import type { EvaluationSplit } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

export const MODEL_EVALUATE_JOB_NAME = 'model.evaluate';
export const MODEL_EVALUATE_IDEMPOTENCY_KEY_PATTERN = 'model.evaluate:${modelVersionId}:${split}';

export const MODEL_EVALUATE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'model.evaluate.dead_letter',
};

export interface ModelEvaluateJobPayload {
  runId: string;
  trainingRunId: string;
  modelVersionId: string;
  split: EvaluationSplit;
  activateIfPass?: boolean;
  correlationId?: string;
}

export interface ModelEvaluateLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleModelEvaluateJob(
  logger: ModelEvaluateLogger,
  job: Job<ModelEvaluateJobPayload>,
): Promise<void> {
  const { runId, correlationId, trainingRunId, modelVersionId, split, activateIfPass } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      trainingRunId,
      modelVersionId,
      split,
      activateIfPass,
      correlationId: correlationId ?? job.id,
    },
    'Started model.evaluate job',
  );

  try {
    // TODO: Evaluate model metrics and persist ModelEvaluation rows.
    // TODO: Optionally activate model and trigger rescoring when thresholds pass.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        modelVersionId,
        correlationId: correlationId ?? job.id,
      },
      'Completed model.evaluate job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        modelVersionId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed model.evaluate job',
    );

    throw error;
  }
}
