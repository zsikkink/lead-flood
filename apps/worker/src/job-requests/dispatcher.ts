import { randomUUID } from 'node:crypto';
import os from 'node:os';

import {
  runSearchTask,
  seedSearchTasks,
  type DiscoveryCountryCode,
  type DiscoveryLanguageCode,
  type DiscoveryProvider,
  type DiscoveryRuntimeConfig,
  type SearchTaskType,
} from '@lead-flood/discovery';
import { prisma, type Prisma } from '@lead-flood/db';

const COUNTRY_SET = new Set<DiscoveryCountryCode>(['JO', 'SA', 'AE', 'EG']);
const LANGUAGE_SET = new Set<DiscoveryLanguageCode>(['en', 'ar']);
const TASK_TYPE_SET = new Set<SearchTaskType>([
  'SERP_GOOGLE',
  'SERP_GOOGLE_LOCAL',
  'SERP_MAPS_LOCAL',
]);

export type JobRequestType = 'DISCOVERY_SEED' | 'DISCOVERY_RUN';

type JobRequestStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';

interface ClaimedJobRequest {
  id: number;
  requestedBy: string;
  requestType: JobRequestType;
  paramsJson: Prisma.JsonValue;
  idempotencyKey: string | null;
}

interface DiscoverySeedRequestParams {
  profile?: 'default' | 'small';
  maxTasks?: number;
  maxPages?: number;
  bucket?: string;
  taskTypes?: SearchTaskType[];
  countries?: DiscoveryCountryCode[];
  languages?: DiscoveryLanguageCode[];
}

interface DiscoveryRunRequestParams {
  maxTasks?: number;
  timeBucket?: string;
  concurrency?: number;
}

interface DiscoveryRunExecutionSummary {
  processedTasks: number;
  done: number;
  failed: number;
  skipped: number;
  newBusinesses: number;
  newSources: number;
  serpapiRequests: number;
}

export interface JobRequestDispatcherLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface JobRequestDispatcherDependencies {
  logger: JobRequestDispatcherLogger;
  config: DiscoveryRuntimeConfig;
  provider: DiscoveryProvider;
  pollMs: number;
  maxPerTick: number;
  workerId: string;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function normalizeCountries(value: unknown, fallback: DiscoveryCountryCode[]): DiscoveryCountryCode[] {
  const parsed = normalizeStringArray(value)
    .map((entry) => entry.toUpperCase())
    .filter((entry): entry is DiscoveryCountryCode => COUNTRY_SET.has(entry as DiscoveryCountryCode));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function normalizeLanguages(value: unknown, fallback: DiscoveryLanguageCode[]): DiscoveryLanguageCode[] {
  const parsed = normalizeStringArray(value)
    .map((entry) => entry.toLowerCase())
    .filter((entry): entry is DiscoveryLanguageCode => LANGUAGE_SET.has(entry as DiscoveryLanguageCode));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function normalizeTaskTypes(value: unknown, fallback: SearchTaskType[]): SearchTaskType[] {
  const parsed = normalizeStringArray(value)
    .map((entry) => entry.toUpperCase())
    .filter((entry): entry is SearchTaskType => TASK_TYPE_SET.has(entry as SearchTaskType));

  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

function parseSeedParams(input: Prisma.JsonValue): DiscoverySeedRequestParams {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const payload = input as Record<string, unknown>;
  const parsed: DiscoverySeedRequestParams = {};

  if (payload.profile === 'default' || payload.profile === 'small') {
    parsed.profile = payload.profile;
  }

  const maxTasks = normalizePositiveInt(payload.maxTasks);
  if (maxTasks !== undefined) {
    parsed.maxTasks = maxTasks;
  }

  const maxPages = normalizePositiveInt(payload.maxPages);
  if (maxPages !== undefined) {
    parsed.maxPages = maxPages;
  }

  const bucket = normalizeString(payload.bucket);
  if (bucket !== undefined) {
    parsed.bucket = bucket;
  }

  const taskTypes = normalizeTaskTypes(payload.taskTypes, []);
  if (taskTypes.length > 0) {
    parsed.taskTypes = taskTypes;
  }

  const countries = normalizeCountries(payload.countries, []);
  if (countries.length > 0) {
    parsed.countries = countries;
  }

  const languages = normalizeLanguages(payload.languages, []);
  if (languages.length > 0) {
    parsed.languages = languages;
  }

  return parsed;
}

function parseRunParams(input: Prisma.JsonValue): DiscoveryRunRequestParams {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const payload = input as Record<string, unknown>;
  const parsed: DiscoveryRunRequestParams = {};

  const maxTasks = normalizePositiveInt(payload.maxTasks);
  if (maxTasks !== undefined) {
    parsed.maxTasks = maxTasks;
  }

  const timeBucket = normalizeString(payload.timeBucket);
  if (timeBucket !== undefined) {
    parsed.timeBucket = timeBucket;
  }

  const concurrency = normalizePositiveInt(payload.concurrency);
  if (concurrency !== undefined) {
    parsed.concurrency = concurrency;
  }

  return parsed;
}

function resolveSeedConfig(
  base: DiscoveryRuntimeConfig,
  overrides: DiscoverySeedRequestParams,
): Pick<
  DiscoveryRuntimeConfig,
  | 'countries'
  | 'languages'
  | 'maxPagesPerQuery'
  | 'refreshBucket'
  | 'seedProfile'
  | 'maxTasks'
  | 'taskTypes'
  | 'seedBucket'
> {
  return {
    countries:
      overrides.countries && overrides.countries.length > 0
        ? overrides.countries
        : base.countries,
    languages:
      overrides.languages && overrides.languages.length > 0
        ? overrides.languages
        : base.languages,
    maxPagesPerQuery: overrides.maxPages ?? base.maxPagesPerQuery,
    refreshBucket: base.refreshBucket,
    seedProfile: overrides.profile ?? base.seedProfile,
    maxTasks: overrides.maxTasks ?? base.maxTasks,
    taskTypes:
      overrides.taskTypes && overrides.taskTypes.length > 0
        ? overrides.taskTypes
        : base.taskTypes,
    seedBucket: overrides.bucket ?? base.seedBucket,
  };
}

async function claimNextJobRequest(workerId: string): Promise<ClaimedJobRequest | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedJobRequest[]>`
      SELECT
        id,
        requested_by::text AS "requestedBy",
        request_type::text AS "requestType",
        params_json AS "paramsJson",
        idempotency_key AS "idempotencyKey"
      FROM public.job_requests
      WHERE status = 'PENDING'::job_request_status
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const claimed = rows[0] ?? null;
    if (!claimed) {
      return null;
    }

    await tx.$executeRaw`
      UPDATE public.job_requests
      SET
        status = 'RUNNING'::job_request_status,
        claimed_by = ${workerId},
        claimed_at = now(),
        started_at = now()
      WHERE id = ${claimed.id}
    `;

    return claimed;
  });
}

async function getJobRequestStatus(id: number): Promise<JobRequestStatus | null> {
  const rows = await prisma.$queryRaw<Array<{ status: JobRequestStatus }>>`
    SELECT status::text AS status
    FROM public.job_requests
    WHERE id = ${id}
    LIMIT 1
  `;

  return rows[0]?.status ?? null;
}

async function setJobRequestOutcome(
  id: number,
  status: Extract<JobRequestStatus, 'SUCCESS' | 'FAILED' | 'CANCELED'>,
  jobRunId: string | null,
  errorText: string | null,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE public.job_requests
    SET
      status = ${status}::job_request_status,
      finished_at = now(),
      error_text = ${errorText},
      job_run_id = ${jobRunId}
    WHERE id = ${id}
  `;
}

async function updateJobRunProgress(jobRunId: string, summary: DiscoveryRunExecutionSummary): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: 'RUNNING',
      countersJson: toInputJson({
        tasks_processed: summary.processedTasks,
        done: summary.done,
        failed: summary.failed,
        skipped: summary.skipped,
        new_businesses: summary.newBusinesses,
        new_sources: summary.newSources,
      }),
      resourceJson: toInputJson({
        serpapi_requests: summary.serpapiRequests,
        serpapi_cached_responses: 0,
        estimated_serpapi_cost_units: summary.serpapiRequests,
        db_writes: {
          businesses_inserted: summary.newBusinesses,
          sources_inserted: summary.newSources,
          evidence_inserted: summary.newBusinesses,
        },
      }),
    },
  });
}

async function executeDiscoveryRunRequest(
  requestId: number,
  jobRunId: string,
  provider: DiscoveryProvider,
  config: DiscoveryRuntimeConfig,
  params: DiscoveryRunRequestParams,
): Promise<DiscoveryRunExecutionSummary> {
  const summary: DiscoveryRunExecutionSummary = {
    processedTasks: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    newBusinesses: 0,
    newSources: 0,
    serpapiRequests: 0,
  };

  const maxTasks = params.maxTasks ?? 40;
  const options = params.timeBucket ? { timeBucket: params.timeBucket } : {};

  while (summary.processedTasks < maxTasks) {
    const currentStatus = await getJobRequestStatus(requestId);
    if (currentStatus === 'CANCELED') {
      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: 'CANCELED',
          finishedAt: new Date(),
          durationMs: 0,
        },
      });
      return summary;
    }

    const result = await runSearchTask(provider, config, options);

    if (result.status === 'EMPTY') {
      break;
    }

    if (!result.taskId) {
      break;
    }

    summary.processedTasks += 1;
    summary.serpapiRequests += 1;
    summary.newBusinesses += result.newBusinesses;
    summary.newSources += result.newSources;

    if (result.status === 'DONE') {
      summary.done += 1;
    } else if (result.status === 'FAILED') {
      summary.failed += 1;
    } else if (result.status === 'SKIPPED') {
      summary.skipped += 1;
    }

    await updateJobRunProgress(jobRunId, summary);
  }

  return summary;
}

async function processClaimedRequest(
  request: ClaimedJobRequest,
  dependencies: JobRequestDispatcherDependencies,
): Promise<void> {
  const startedAt = Date.now();
  const paramsJson = request.paramsJson;
  const jobName =
    request.requestType === 'DISCOVERY_SEED'
      ? 'job_request:DISCOVERY_SEED'
      : 'job_request:DISCOVERY_RUN';

  const jobRun = await prisma.jobRun.create({
    data: {
      id: randomUUID(),
      jobName,
      status: 'RUNNING',
      paramsJson: toInputJson(paramsJson),
      countersJson: toInputJson({}),
      resourceJson: toInputJson({}),
    },
  });

  await prisma.$executeRaw`
    UPDATE public.job_requests
    SET job_run_id = ${jobRun.id}
    WHERE id = ${request.id}
  `;

  try {
    if (request.requestType === 'DISCOVERY_SEED') {
      const params = parseSeedParams(paramsJson);
      const seedConfig = resolveSeedConfig(dependencies.config, params);
      const result = await seedSearchTasks(seedConfig);

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt),
          countersJson: toInputJson({
            generated: result.generated,
            inserted: result.inserted,
          }),
          resourceJson: toInputJson({
            db_writes: {
              search_tasks_inserted: result.inserted,
            },
          }),
        },
      });

      await setJobRequestOutcome(request.id, 'SUCCESS', jobRun.id, null);

      dependencies.logger.info(
        {
          requestId: request.id,
          requestType: request.requestType,
          jobRunId: jobRun.id,
          generated: result.generated,
          inserted: result.inserted,
          requestedBy: request.requestedBy,
          idempotencyKey: request.idempotencyKey,
        },
        'Processed job request',
      );

      return;
    }

    if (request.requestType === 'DISCOVERY_RUN') {
      const params = parseRunParams(paramsJson);
      const summary = await executeDiscoveryRunRequest(
        request.id,
        jobRun.id,
        dependencies.provider,
        dependencies.config,
        params,
      );

      const requestStatus = await getJobRequestStatus(request.id);
      if (requestStatus === 'CANCELED') {
        await setJobRequestOutcome(request.id, 'CANCELED', jobRun.id, null);
        dependencies.logger.warn(
          {
            requestId: request.id,
            requestType: request.requestType,
            jobRunId: jobRun.id,
            requestedBy: request.requestedBy,
          },
          'Canceled job request while running',
        );
        return;
      }

      await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt),
          countersJson: toInputJson({
            tasks_processed: summary.processedTasks,
            done: summary.done,
            failed: summary.failed,
            skipped: summary.skipped,
            new_businesses: summary.newBusinesses,
            new_sources: summary.newSources,
          }),
          resourceJson: toInputJson({
            serpapi_requests: summary.serpapiRequests,
            serpapi_cached_responses: 0,
            estimated_serpapi_cost_units: summary.serpapiRequests,
            db_writes: {
              businesses_inserted: summary.newBusinesses,
              sources_inserted: summary.newSources,
              evidence_inserted: summary.newBusinesses,
            },
          }),
        },
      });

      await setJobRequestOutcome(request.id, 'SUCCESS', jobRun.id, null);

      dependencies.logger.info(
        {
          requestId: request.id,
          requestType: request.requestType,
          jobRunId: jobRun.id,
          requestedBy: request.requestedBy,
          idempotencyKey: request.idempotencyKey,
          ...summary,
        },
        'Processed job request',
      );

      return;
    }

    throw new Error(`Unsupported job request type: ${request.requestType}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process job request';

    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        durationMs: Math.max(0, Date.now() - startedAt),
        errorText: message,
      },
    });

    await setJobRequestOutcome(request.id, 'FAILED', jobRun.id, message);

    dependencies.logger.error(
      {
        requestId: request.id,
        requestType: request.requestType,
        jobRunId: jobRun.id,
        requestedBy: request.requestedBy,
        idempotencyKey: request.idempotencyKey,
        error: message,
      },
      'Job request failed',
    );
  }
}

export function buildDefaultWorkerId(): string {
  return `${os.hostname()}:${process.pid}`;
}

export function startJobRequestDispatcher(
  dependencies: JobRequestDispatcherDependencies,
): { stop: () => void } {
  const { logger, pollMs, maxPerTick, workerId } = dependencies;

  let stopped = false;
  let running = false;
  let interval: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped || running) {
      return;
    }
    running = true;

    try {
      for (let index = 0; index < maxPerTick; index += 1) {
        const claimed = await claimNextJobRequest(workerId);
        if (!claimed) {
          break;
        }

        logger.info(
          {
            requestId: claimed.id,
            requestType: claimed.requestType,
            requestedBy: claimed.requestedBy,
            idempotencyKey: claimed.idempotencyKey,
            workerId,
          },
          'Claimed job request',
        );

        await processClaimedRequest(claimed, dependencies);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown error';
      if (message.includes('job_requests') && message.includes('does not exist')) {
        stopped = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        logger.warn(
          {
            workerId,
            error: message,
          },
          'Job request dispatcher disabled because job_requests table is missing',
        );
        return;
      }

      logger.error(
        {
          workerId,
          error: message,
        },
        'Job request dispatcher tick failed',
      );
    } finally {
      running = false;
    }
  };

  interval = setInterval(() => {
    void tick();
  }, pollMs);

  void tick();

  logger.info(
    {
      workerId,
      pollMs,
      maxPerTick,
    },
    'Started job request dispatcher',
  );

  return {
    stop: () => {
      stopped = true;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      logger.info({ workerId }, 'Stopped job request dispatcher');
    },
  };
}
