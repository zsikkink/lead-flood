import PgBoss, { type Job } from 'pg-boss';

import { createLogger } from '@lead-flood/observability';

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

async function registerWorker<TPayload>(
  boss: BossForWork,
  logger: WorkerLogger,
  queueName: string,
  handler: JobHandler<TPayload>,
): Promise<void> {
  await boss.work<TPayload>(queueName, async (jobs) => {
    for (const job of jobs) {
      await handler(logger, job);
    }
  });

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
  await registerWorker<DiscoveryRunJobPayload>(boss, logger, DISCOVERY_RUN_JOB_NAME, handleDiscoveryRunJob);
  await registerWorker<EnrichmentRunJobPayload>(
    boss,
    logger,
    ENRICHMENT_RUN_JOB_NAME,
    handleEnrichmentRunJob,
  );
  await registerWorker<FeaturesComputeJobPayload>(
    boss,
    logger,
    FEATURES_COMPUTE_JOB_NAME,
    handleFeaturesComputeJob,
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
