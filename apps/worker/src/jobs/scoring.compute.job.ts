import type { CreateScoringRunRequest } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

export const SCORING_COMPUTE_JOB_NAME = 'scoring.compute';
export const SCORING_COMPUTE_IDEMPOTENCY_KEY_PATTERN = 'scoring.compute:${runId}';

export const SCORING_COMPUTE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'scoring.compute.dead_letter',
};

export interface ScoringComputeJobPayload
  extends Pick<CreateScoringRunRequest, 'mode' | 'icpProfileId' | 'leadIds' | 'modelVersionId' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
}

export interface ScoringComputeLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleScoringComputeJob(
  logger: ScoringComputeLogger,
  job: Job<ScoringComputeJobPayload>,
): Promise<void> {
  const { runId, correlationId, modelVersionId, icpProfileId } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      modelVersionId,
      icpProfileId,
    },
    'Started scoring.compute job',
  );

  try {
    // TODO: Load active model version and feature snapshots.
    // TODO: Compute deterministic + logistic scores and persist LeadScorePrediction rows.
    // TODO: Emit downstream message.generate jobs for eligible scored leads.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
      },
      'Completed scoring.compute job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed scoring.compute job',
    );

    throw error;
  }
}
