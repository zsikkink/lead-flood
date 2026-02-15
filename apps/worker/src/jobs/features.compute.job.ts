import type { Job, SendOptions } from 'pg-boss';

export const FEATURES_COMPUTE_JOB_NAME = 'features.compute';
export const FEATURES_COMPUTE_IDEMPOTENCY_KEY_PATTERN = 'features.compute:${leadId}:${snapshotVersion}';

export const FEATURES_COMPUTE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 20,
  retryBackoff: true,
  deadLetter: 'features.compute.dead_letter',
};

export interface FeaturesComputeJobPayload {
  runId: string;
  leadId: string;
  icpProfileId: string;
  snapshotVersion: number;
  sourceVersion?: string;
  enrichmentRecordId?: string;
  correlationId?: string;
}

export interface FeaturesComputeLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleFeaturesComputeJob(
  logger: FeaturesComputeLogger,
  job: Job<FeaturesComputeJobPayload>,
): Promise<void> {
  const { runId, correlationId, leadId, icpProfileId, snapshotVersion } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      leadId,
      icpProfileId,
      snapshotVersion,
    },
    'Started features.compute job',
  );

  try {
    // TODO: Compute deterministic feature snapshot from lead/discovery/enrichment data.
    // TODO: Persist LeadFeatureSnapshot and emit downstream scoring.compute job.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
      },
      'Completed features.compute job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
        error,
      },
      'Failed features.compute job',
    );

    throw error;
  }
}
