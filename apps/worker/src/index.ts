import PgBoss, { type Job } from 'pg-boss';

import {
  loadDiscoveryRuntimeConfig,
  SerpApiDiscoveryProvider,
  type DiscoveryRuntimeConfig,
} from '@lead-flood/discovery';
import type { DiscoveryProvider } from '@lead-flood/contracts';
import { createLogger } from '@lead-flood/observability';
import {
  ApolloDiscoveryAdapter,
  BraveSearchAdapter,
  CompanySearchAdapter,
  ClearbitAdapter,
  GooglePlacesAdapter,
  GoogleSearchAdapter,
  HunterEnrichmentAdapter,
  LinkedInScrapeAdapter,
  PdlEnrichmentAdapter,
  PublicWebLookupAdapter,
} from '@lead-flood/providers';

import { loadWorkerEnv } from './env.js';
import {
  ANALYTICS_ROLLUP_JOB_NAME,
  handleAnalyticsRollupJob,
  type AnalyticsRollupJobPayload,
} from './jobs/analytics.rollup.job.js';
import {
  DISCOVERY_RUN_JOB_NAME,
  handleDiscoveryRunJob,
  type DiscoveryRunJobPayload,
} from './jobs/discovery.run.job.js';
import {
  DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
  DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS,
  handleDiscoveryRunSearchTaskJob,
  type DiscoveryRunSearchTaskJobPayload,
} from './jobs/discovery.run_search_task.job.js';
import {
  DISCOVERY_SEED_JOB_NAME,
  DISCOVERY_SEED_RETRY_OPTIONS,
  handleDiscoverySeedJob,
  type DiscoverySeedJobPayload,
} from './jobs/discovery.seed.job.js';
import {
  ENRICHMENT_RUN_JOB_NAME,
  handleEnrichmentRunJob,
  type EnrichmentRunJobPayload,
} from './jobs/enrichment.run.job.js';
import {
  FEATURES_COMPUTE_JOB_NAME,
  handleFeaturesComputeJob,
  type FeaturesComputeJobPayload,
} from './jobs/features.compute.job.js';
import { handleHeartbeatJob, type HeartbeatJobPayload } from './jobs/heartbeat.job.js';
import {
  LABELS_GENERATE_JOB_NAME,
  handleLabelsGenerateJob,
  type LabelsGenerateJobPayload,
} from './jobs/labels.generate.job.js';
import { handleLeadEnrichJob, type LeadEnrichJobPayload } from './jobs/lead-enrich.job.js';
import {
  MESSAGE_GENERATE_JOB_NAME,
  handleMessageGenerateJob,
  type MessageGenerateJobPayload,
} from './jobs/message.generate.job.js';
import {
  MESSAGE_SEND_JOB_NAME,
  handleMessageSendJob,
  type MessageSendJobPayload,
} from './jobs/message.send.job.js';
import {
  MODEL_EVALUATE_JOB_NAME,
  handleModelEvaluateJob,
  type ModelEvaluateJobPayload,
} from './jobs/model.evaluate.job.js';
import {
  MODEL_TRAIN_JOB_NAME,
  handleModelTrainJob,
  type ModelTrainJobPayload,
} from './jobs/model.train.job.js';
import {
  SCORING_COMPUTE_JOB_NAME,
  handleScoringComputeJob,
  type ScoringComputeJobPayload,
} from './jobs/scoring.compute.job.js';
import { dispatchPendingOutboxEvents } from './outbox-dispatcher.js';
import { ensureWorkerQueues, HEARTBEAT_QUEUE_NAME, LEAD_ENRICH_STUB_QUEUE_NAME } from './queues.js';
import { registerWorkerSchedules } from './schedules.js';

interface WorkerLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

type BossForWork = Pick<PgBoss, 'work'>;
type JobHandler<TPayload> = (logger: WorkerLogger, job: Job<TPayload>) => Promise<void>;
interface WorkerRegistrationOptions {
  batchSize?: number;
  pollingIntervalSeconds?: number;
  concurrent?: boolean;
}

const ALL_DISCOVERY_PROVIDERS: DiscoveryProvider[] = [
  'BRAVE_SEARCH',
  'GOOGLE_PLACES',
  'GOOGLE_SEARCH',
  'LINKEDIN_SCRAPE',
  'COMPANY_SEARCH_FREE',
  'APOLLO',
];

function parseDiscoveryProviderOrder(raw: string | undefined): DiscoveryProvider[] {
  if (!raw) {
    return [];
  }

  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is DiscoveryProvider =>
      ALL_DISCOVERY_PROVIDERS.includes(entry as DiscoveryProvider),
    );

  return Array.from(new Set(values));
}

async function registerWorker<TPayload>(
  boss: BossForWork,
  logger: WorkerLogger,
  queueName: string,
  handler: JobHandler<TPayload>,
  options?: WorkerRegistrationOptions,
): Promise<void> {
  const processJobs = async (jobs: Job<TPayload>[]): Promise<void> => {
    if (options?.concurrent) {
      await Promise.all(jobs.map(async (job) => handler(logger, job)));
      return;
    }

    for (const job of jobs) {
      await handler(logger, job);
    }
  };

  if (options?.batchSize || options?.pollingIntervalSeconds) {
    await boss.work<TPayload>(
      queueName,
      {
        ...(options.batchSize ? { batchSize: options.batchSize } : {}),
        ...(options.pollingIntervalSeconds
          ? { pollingIntervalSeconds: options.pollingIntervalSeconds }
          : {}),
      },
      processJobs,
    );
  } else {
    await boss.work<TPayload>(queueName, processJobs);
  }

  logger.info({ queueName }, 'Registered worker queue');
}

async function main(): Promise<void> {
  const env = loadWorkerEnv(process.env);
  const logger = createLogger({
    service: 'worker',
    env: env.APP_ENV,
    level: env.LOG_LEVEL,
  });

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PG_BOSS_SCHEMA,
  });

  await boss.start();
  logger.info({}, 'Worker started');

  await ensureWorkerQueues(boss);
  await registerWorkerSchedules(boss);

  const apolloAdapter = new ApolloDiscoveryAdapter({
    apiKey: env.APOLLO_API_KEY ?? '',
    baseUrl: env.APOLLO_BASE_URL,
    minRequestIntervalMs: env.APOLLO_RATE_LIMIT_MS,
  });

  const braveSearchAdapter = new BraveSearchAdapter({
    enabled: env.BRAVE_SEARCH_ENABLED,
    apiKey: env.BRAVE_SEARCH_API_KEY,
    baseUrl: env.BRAVE_SEARCH_BASE_URL,
    minRequestIntervalMs: env.BRAVE_SEARCH_RATE_LIMIT_MS,
  });

  const googlePlacesAdapter = new GooglePlacesAdapter({
    enabled: env.GOOGLE_PLACES_ENABLED,
    apiKey: env.GOOGLE_PLACES_API_KEY,
    baseUrl: env.GOOGLE_PLACES_BASE_URL,
    minRequestIntervalMs: env.GOOGLE_PLACES_RATE_LIMIT_MS,
  });

  const googleSearchAdapter = new GoogleSearchAdapter({
    apiKey: env.GOOGLE_SEARCH_API_KEY,
    searchEngineId: env.GOOGLE_SEARCH_ENGINE_ID,
    baseUrl: env.GOOGLE_SEARCH_BASE_URL,
    minRequestIntervalMs: env.GOOGLE_SEARCH_RATE_LIMIT_MS,
  });

  const linkedInScrapeAdapter = new LinkedInScrapeAdapter({
    enabled: env.LINKEDIN_SCRAPE_ENABLED,
    scrapeEndpoint: env.LINKEDIN_SCRAPE_ENDPOINT,
    apiKey: env.LINKEDIN_SCRAPE_API_KEY,
  });

  const companySearchAdapter = new CompanySearchAdapter({
    enabled: env.COMPANY_SEARCH_ENABLED,
    baseUrl: env.COMPANY_SEARCH_BASE_URL,
  });

  const pdlAdapter = new PdlEnrichmentAdapter({
    apiKey: env.PDL_API_KEY ?? '',
    baseUrl: env.PDL_BASE_URL,
    minRequestIntervalMs: env.PDL_RATE_LIMIT_MS,
  });

  const hunterAdapter = new HunterEnrichmentAdapter({
    enabled: env.HUNTER_ENABLED,
    apiKey: env.HUNTER_API_KEY,
    baseUrl: env.HUNTER_BASE_URL,
    minRequestIntervalMs: env.HUNTER_RATE_LIMIT_MS,
  });

  const clearbitAdapter = new ClearbitAdapter({
    apiKey: env.CLEARBIT_API_KEY,
    personBaseUrl: env.CLEARBIT_PERSON_BASE_URL,
    companyBaseUrl: env.CLEARBIT_COMPANY_BASE_URL,
  });

  const publicWebLookupAdapter = new PublicWebLookupAdapter({
    enabled: env.OTHER_FREE_ENRICHMENT_ENABLED,
    baseUrl: env.PUBLIC_LOOKUP_BASE_URL,
  });
  const discoveryProviderOrder = parseDiscoveryProviderOrder(env.DISCOVERY_PROVIDER_ORDER);

  let discoveryRuntimeConfig: DiscoveryRuntimeConfig | null = null;
  let serpApiProvider: SerpApiDiscoveryProvider | null = null;
  try {
    discoveryRuntimeConfig = loadDiscoveryRuntimeConfig(process.env);
    if (discoveryRuntimeConfig.mapsZoomWarning) {
      logger.warn(
        {
          warning: discoveryRuntimeConfig.mapsZoomWarning,
        },
        'Using default discovery maps zoom',
      );
    }
    serpApiProvider = new SerpApiDiscoveryProvider({
      apiKey: discoveryRuntimeConfig.serpApiKey,
      rps: discoveryRuntimeConfig.rps,
      enableCache: discoveryRuntimeConfig.enableCache,
      maxAttempts: discoveryRuntimeConfig.maxTaskAttempts,
      backoffBaseSeconds: discoveryRuntimeConfig.backoffBaseSeconds,
      mapsZoom: discoveryRuntimeConfig.mapsZoom,
    });
  } catch (error: unknown) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : 'invalid discovery runtime config',
      },
      'SerpAPI discovery runtime disabled; set SERPAPI_API_KEY and discovery env vars to enable',
    );
  }

  let outboxDispatchRunning = false;
  const runOutboxDispatch = async (): Promise<void> => {
    if (outboxDispatchRunning) {
      return;
    }

    outboxDispatchRunning = true;
    try {
      const dispatchedCount = await dispatchPendingOutboxEvents(boss, logger);
      if (dispatchedCount > 0) {
        logger.info({ dispatchedCount }, 'Dispatched outbox events');
      }
    } catch (error: unknown) {
      logger.error({ error }, 'Outbox dispatch cycle failed');
    } finally {
      outboxDispatchRunning = false;
    }
  };

  await runOutboxDispatch();
  const outboxInterval = setInterval(() => {
    void runOutboxDispatch();
  }, 5000);

  await registerWorker<HeartbeatJobPayload>(boss, logger, HEARTBEAT_QUEUE_NAME, handleHeartbeatJob);
  await registerWorker<LeadEnrichJobPayload>(
    boss,
    logger,
    LEAD_ENRICH_STUB_QUEUE_NAME,
    handleLeadEnrichJob,
  );
  await registerWorker<DiscoveryRunJobPayload>(boss, logger, DISCOVERY_RUN_JOB_NAME, (jobLogger, job) =>
    handleDiscoveryRunJob(jobLogger, job, {
      boss,
      apolloAdapter,
      braveSearchAdapter,
      googlePlacesAdapter,
      googleSearchAdapter,
      linkedInScrapeAdapter,
      companySearchAdapter,
      discoveryEnabled: env.DISCOVERY_ENABLED,
      apolloEnabled: env.APOLLO_ENABLED,
      braveSearchEnabled: env.BRAVE_SEARCH_ENABLED,
      googlePlacesEnabled: env.GOOGLE_PLACES_ENABLED,
      googleSearchEnabled: env.GOOGLE_SEARCH_ENABLED,
      linkedInScrapeEnabled: env.LINKEDIN_SCRAPE_ENABLED,
      companySearchEnabled: env.COMPANY_SEARCH_ENABLED,
      defaultProvider: env.DISCOVERY_DEFAULT_PROVIDER,
      providerOrder: discoveryProviderOrder,
      defaultEnrichmentProvider: env.ENRICHMENT_DEFAULT_PROVIDER,
    }),
  );

  if (discoveryRuntimeConfig && serpApiProvider) {
    await registerWorker<DiscoverySeedJobPayload>(
      boss,
      logger,
      DISCOVERY_SEED_JOB_NAME,
      (jobLogger, job) =>
        handleDiscoverySeedJob(jobLogger, job, {
          boss,
          config: discoveryRuntimeConfig,
        }),
    );

    await registerWorker<DiscoveryRunSearchTaskJobPayload>(
      boss,
      logger,
      DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
      (jobLogger, job) =>
        handleDiscoveryRunSearchTaskJob(jobLogger, job, {
          boss,
          provider: serpApiProvider,
          config: discoveryRuntimeConfig,
          ...(env.DISCOVERY_RUN_MAX_TASKS !== undefined
            ? { maxTasks: env.DISCOVERY_RUN_MAX_TASKS }
            : {}),
        }),
      {
        batchSize: discoveryRuntimeConfig.concurrency,
        pollingIntervalSeconds: 1,
        concurrent: true,
      },
    );

    for (let slot = 0; slot < discoveryRuntimeConfig.concurrency; slot += 1) {
      await boss.send(
        DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
        {
          slot,
          reason: 'worker_bootstrap',
          correlationId: 'bootstrap:discovery.run_search_task',
        } satisfies DiscoveryRunSearchTaskJobPayload,
        {
          ...DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS,
        },
      );
    }

    await boss.send(
      DISCOVERY_SEED_JOB_NAME,
      {
        reason: 'worker_bootstrap',
        correlationId: 'bootstrap:discovery.seed',
      } satisfies DiscoverySeedJobPayload,
      {
        ...DISCOVERY_SEED_RETRY_OPTIONS,
      },
    );
  }

  await registerWorker<EnrichmentRunJobPayload>(
    boss,
    logger,
    ENRICHMENT_RUN_JOB_NAME,
    (jobLogger, job) =>
      handleEnrichmentRunJob(jobLogger, job, {
        boss,
        pdlAdapter,
        hunterAdapter,
        clearbitAdapter,
        publicWebLookupAdapter,
        enrichmentEnabled: env.ENRICHMENT_ENABLED,
        pdlEnabled: env.PDL_ENABLED,
        hunterEnabled: env.HUNTER_ENABLED,
        clearbitEnabled: env.CLEARBIT_ENABLED,
        otherFreeEnabled: env.OTHER_FREE_ENRICHMENT_ENABLED,
        defaultProvider: env.ENRICHMENT_DEFAULT_PROVIDER,
      }),
  );
  await registerWorker<FeaturesComputeJobPayload>(
    boss,
    logger,
    FEATURES_COMPUTE_JOB_NAME,
    (jobLogger, job) =>
      handleFeaturesComputeJob(jobLogger, job, {
        boss,
      }),
  );
  await registerWorker<LabelsGenerateJobPayload>(
    boss,
    logger,
    LABELS_GENERATE_JOB_NAME,
    handleLabelsGenerateJob,
  );
  await registerWorker<ScoringComputeJobPayload>(
    boss,
    logger,
    SCORING_COMPUTE_JOB_NAME,
    handleScoringComputeJob,
  );
  await registerWorker<ModelTrainJobPayload>(boss, logger, MODEL_TRAIN_JOB_NAME, handleModelTrainJob);
  await registerWorker<ModelEvaluateJobPayload>(
    boss,
    logger,
    MODEL_EVALUATE_JOB_NAME,
    handleModelEvaluateJob,
  );
  await registerWorker<MessageGenerateJobPayload>(
    boss,
    logger,
    MESSAGE_GENERATE_JOB_NAME,
    handleMessageGenerateJob,
  );
  await registerWorker<MessageSendJobPayload>(boss, logger, MESSAGE_SEND_JOB_NAME, handleMessageSendJob);
  await registerWorker<AnalyticsRollupJobPayload>(
    boss,
    logger,
    ANALYTICS_ROLLUP_JOB_NAME,
    handleAnalyticsRollupJob,
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down worker');
    clearInterval(outboxInterval);
    await boss.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error('Worker boot failed:', error);
  process.exit(1);
});
