import type { CreateRetrainRunRequest, TrainingTrigger } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

export const MODEL_TRAIN_JOB_NAME = 'model.train';
export const MODEL_TRAIN_IDEMPOTENCY_KEY_PATTERN = 'model.train:${trainingRunId}';

export const MODEL_TRAIN_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 1,
  retryDelay: 300,
  retryBackoff: true,
  deadLetter: 'model.train.dead_letter',
};

export interface ModelTrainJobPayload
  extends Pick<
    CreateRetrainRunRequest,
    'windowDays' | 'minSamples' | 'activateIfPass' | 'requestedByUserId'
  > {
  runId: string;
  trainingRunId: string;
  trigger: TrainingTrigger;
  correlationId?: string;
}

export interface ModelTrainLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleModelTrainJob(
  logger: ModelTrainLogger,
  job: Job<ModelTrainJobPayload>,
): Promise<void> {
  const { runId, correlationId, trainingRunId, trigger, windowDays, minSamples } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      trainingRunId,
      correlationId: correlationId ?? job.id,
      trigger,
      windowDays,
      minSamples,
    },
    'Started model.train job',
  );

  try {
    // TODO: Build training dataset from LeadFeatureSnapshot + TrainingLabel.
    // TODO: Train logistic regression model and persist ModelVersion.
    // TODO: Emit model.evaluate job for trained model version.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        correlationId: correlationId ?? job.id,
      },
      'Completed model.train job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed model.train job',
    );

    throw error;
  }
}
