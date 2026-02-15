import type { RecomputeRollupRequest } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

export const ANALYTICS_ROLLUP_JOB_NAME = 'analytics.rollup';
export const ANALYTICS_ROLLUP_IDEMPOTENCY_KEY_PATTERN = 'analytics.rollup:${day}:${icpProfileId || "all"}';

export const ANALYTICS_ROLLUP_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 300,
  retryBackoff: true,
  deadLetter: 'analytics.rollup.dead_letter',
};

export interface AnalyticsRollupJobPayload
  extends Pick<RecomputeRollupRequest, 'day' | 'icpProfileId' | 'fullRecompute' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
}

export interface AnalyticsRollupLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleAnalyticsRollupJob(
  logger: AnalyticsRollupLogger,
  job: Job<AnalyticsRollupJobPayload>,
): Promise<void> {
  const { runId, correlationId, day, icpProfileId, fullRecompute } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      day,
      icpProfileId,
      fullRecompute,
    },
    'Started analytics.rollup job',
  );

  try {
    // TODO: Aggregate daily funnel and outcome metrics into AnalyticsDailyRollup.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        day,
      },
      'Completed analytics.rollup job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        day,
        error,
      },
      'Failed analytics.rollup job',
    );

    throw error;
  }
}
