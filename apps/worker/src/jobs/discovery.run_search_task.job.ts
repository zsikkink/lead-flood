import { getMetricSnapshot, logDiscoveryEvent, runSearchTask } from '@lead-flood/discovery';
import type {
  DiscoveryProvider as SerpDiscoveryProvider,
  DiscoveryRuntimeConfig,
} from '@lead-flood/discovery';
import { prisma, type Prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

export const DISCOVERY_RUN_SEARCH_TASK_JOB_NAME = 'discovery.run_search_task';
export const DISCOVERY_RUN_SEARCH_TASK_IDEMPOTENCY_KEY_PATTERN =
  'discovery.run_search_task:${slot}';

export const DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'discovery.run_search_task.dead_letter',
};

export interface DiscoveryRunSearchTaskJobPayload {
  slot?: number;
  reason?: string;
  correlationId?: string;
  jobRunId?: string;
  maxTasks?: number;
  timeBucket?: string;
}

export interface DiscoveryRunSearchTaskLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface DiscoveryRunSearchTaskDependencies {
  boss: Pick<PgBoss, 'send'>;
  provider: SerpDiscoveryProvider;
  config: DiscoveryRuntimeConfig;
  maxTasks?: number;
}

interface RunState {
  processedTaskCount: number;
  doneCount: number;
  failedCount: number;
  skippedCount: number;
  newBusinesses: number;
  newSources: number;
  serpapiRequests: number;
  startedAtMs: number;
  finalized: boolean;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getRunKey(job: Job<DiscoveryRunSearchTaskJobPayload>): string {
  if (job.data.jobRunId) {
    return `jobRun:${job.data.jobRunId}`;
  }
  if (job.data.correlationId) {
    return `correlation:${job.data.correlationId}`;
  }
  return `slot:${job.data.slot ?? 0}`;
}

const runStates = new Map<string, RunState>();

function getRunState(runKey: string): RunState {
  const existing = runStates.get(runKey);
  if (existing) {
    return existing;
  }
  const created: RunState = {
    processedTaskCount: 0,
    doneCount: 0,
    failedCount: 0,
    skippedCount: 0,
    newBusinesses: 0,
    newSources: 0,
    serpapiRequests: 0,
    startedAtMs: Date.now(),
    finalized: false,
  };
  runStates.set(runKey, created);
  return created;
}

function nextPollDelaySeconds(status: 'EMPTY' | 'DONE' | 'FAILED' | 'SKIPPED'): number {
  if (status === 'EMPTY') {
    return 30;
  }
  if (status === 'SKIPPED') {
    return 15;
  }
  return 1;
}

async function updateJobRunProgress(jobRunId: string, state: RunState): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: 'RUNNING',
      countersJson: toInputJson({
        tasks_processed: state.processedTaskCount,
        done: state.doneCount,
        failed: state.failedCount,
        skipped: state.skippedCount,
        new_businesses: state.newBusinesses,
        new_sources: state.newSources,
      }),
      resourceJson: toInputJson({
        serpapi_requests: state.serpapiRequests,
        serpapi_cached_responses: 0,
        estimated_serpapi_cost_units: state.serpapiRequests,
        db_writes: {
          businesses_inserted: state.newBusinesses,
          sources_inserted: state.newSources,
          evidence_inserted: state.newBusinesses,
        },
      }),
    },
  });
}

async function finalizeJobRun(
  jobRunId: string,
  state: RunState,
  status: 'SUCCESS' | 'FAILED',
  errorText: string | null,
): Promise<void> {
  if (state.finalized) {
    return;
  }
  state.finalized = true;

  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status,
      finishedAt: new Date(),
      durationMs: Math.max(0, Date.now() - state.startedAtMs),
      errorText,
      countersJson: toInputJson({
        tasks_processed: state.processedTaskCount,
        done: state.doneCount,
        failed: state.failedCount,
        skipped: state.skippedCount,
        new_businesses: state.newBusinesses,
        new_sources: state.newSources,
      }),
      resourceJson: toInputJson({
        serpapi_requests: state.serpapiRequests,
        serpapi_cached_responses: 0,
        estimated_serpapi_cost_units: state.serpapiRequests,
        db_writes: {
          businesses_inserted: state.newBusinesses,
          sources_inserted: state.newSources,
          evidence_inserted: state.newBusinesses,
        },
      }),
    },
  });
}

export async function handleDiscoveryRunSearchTaskJob(
  logger: DiscoveryRunSearchTaskLogger,
  job: Job<DiscoveryRunSearchTaskJobPayload>,
  dependencies: DiscoveryRunSearchTaskDependencies,
): Promise<void> {
  const slot = job.data.slot ?? 0;
  const correlationId = job.data.correlationId ?? job.id;
  const runKey = getRunKey(job);
  const runState = getRunState(runKey);
  const effectiveMaxTasks = job.data.maxTasks ?? dependencies.maxTasks;

  if (effectiveMaxTasks !== undefined && runState.processedTaskCount >= effectiveMaxTasks) {
    if (job.data.jobRunId) {
      await finalizeJobRun(job.data.jobRunId, runState, 'SUCCESS', null);
      runStates.delete(runKey);
    }
    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        maxTasks: effectiveMaxTasks,
        processedTaskCount: runState.processedTaskCount,
      },
      'Skipping discovery.run_search_task loop because DISCOVERY_RUN_MAX_TASKS has been reached',
    );
    return;
  }

  const runResult = await runSearchTask(
    dependencies.provider,
    dependencies.config,
    job.data.timeBucket ? { timeBucket: job.data.timeBucket } : {},
  );

  if (runResult.taskId) {
    runState.processedTaskCount += 1;
    runState.serpapiRequests += 1;
    runState.newBusinesses += runResult.newBusinesses;
    runState.newSources += runResult.newSources;
    if (runResult.status === 'DONE') {
      runState.doneCount += 1;
    }
    if (runResult.status === 'FAILED') {
      runState.failedCount += 1;
    }
    if (runResult.status === 'SKIPPED') {
      runState.skippedCount += 1;
    }
  }

  if (job.data.jobRunId) {
    if (runResult.status === 'FAILED' && effectiveMaxTasks === undefined) {
      await finalizeJobRun(job.data.jobRunId, runState, 'FAILED', runResult.error ?? 'Task failed');
      runStates.delete(runKey);
    } else {
      await updateJobRunProgress(job.data.jobRunId, runState);
    }
  }

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      slot,
      correlationId,
      taskId: runResult.taskId,
      status: runResult.status,
      taskType: runResult.taskType ?? null,
      queryHash: runResult.queryHash ?? null,
      countryCode: runResult.countryCode ?? null,
      language: runResult.language ?? null,
      attempts: runResult.attempts ?? null,
      durationMs: runResult.durationMs,
      newBusinesses: runResult.newBusinesses,
      newSources: runResult.newSources,
      localBusinessCount: runResult.localBusinessCount,
      organicResultCount: runResult.organicResultCount,
      error: runResult.error ?? null,
      processedTaskCount: runState.processedTaskCount,
      maxTasks: effectiveMaxTasks ?? null,
      metrics: getMetricSnapshot(),
      timeBucket: job.data.timeBucket ?? null,
      jobRunId: job.data.jobRunId ?? null,
    },
    'Processed discovery.run_search_task job',
  );

  logDiscoveryEvent('discovery.run_search_task.completed', {
    slot,
    correlationId,
    taskId: runResult.taskId,
    status: runResult.status,
    queryHash: runResult.queryHash ?? null,
    duration_ms: runResult.durationMs,
    new_businesses: runResult.newBusinesses,
    new_sources: runResult.newSources,
    local_businesses: runResult.localBusinessCount,
    organic_results: runResult.organicResultCount,
    error: runResult.error ?? null,
    processed_task_count: runState.processedTaskCount,
    max_tasks: effectiveMaxTasks ?? null,
    time_bucket: job.data.timeBucket ?? null,
  });

  if (effectiveMaxTasks !== undefined && runState.processedTaskCount >= effectiveMaxTasks) {
    if (job.data.jobRunId) {
      await finalizeJobRun(job.data.jobRunId, runState, 'SUCCESS', null);
      runStates.delete(runKey);
    }
    logger.info(
      {
        slot,
        correlationId,
        processedTaskCount: runState.processedTaskCount,
        maxTasks: effectiveMaxTasks,
      },
      'Stopping discovery.run_search_task loop after hitting DISCOVERY_RUN_MAX_TASKS',
    );
    return;
  }

  if (effectiveMaxTasks !== undefined && runResult.status === 'EMPTY') {
    if (job.data.jobRunId) {
      await finalizeJobRun(job.data.jobRunId, runState, 'SUCCESS', null);
      runStates.delete(runKey);
    }
    logger.info(
      {
        slot,
        correlationId,
        processedTaskCount: runState.processedTaskCount,
        maxTasks: effectiveMaxTasks,
      },
      'Stopping discovery.run_search_task loop because bounded run reached empty queue',
    );
    return;
  }

  const startAfterSeconds = nextPollDelaySeconds(runResult.status);
  await dependencies.boss.send(
    DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
    {
      slot,
      reason: 'loop',
      correlationId,
      jobRunId: job.data.jobRunId,
      maxTasks: effectiveMaxTasks,
      timeBucket: job.data.timeBucket,
    },
    {
      startAfter: startAfterSeconds,
      ...DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS,
    },
  );
}
