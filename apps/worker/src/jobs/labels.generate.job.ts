import type { Job, SendOptions } from 'pg-boss';

export const LABELS_GENERATE_JOB_NAME = 'labels.generate';
export const LABELS_GENERATE_IDEMPOTENCY_KEY_PATTERN =
  'labels.generate:${feedbackEventId || `${from}:${to}` }';

export const LABELS_GENERATE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 120,
  retryBackoff: true,
  deadLetter: 'labels.generate.dead_letter',
};

export interface LabelsGenerateJobPayload {
  runId: string;
  from: string;
  to: string;
  leadId?: string;
  feedbackEventId?: string;
  correlationId?: string;
}

export interface LabelsGenerateLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleLabelsGenerateJob(
  logger: LabelsGenerateLogger,
  job: Job<LabelsGenerateJobPayload>,
): Promise<void> {
  const { runId, correlationId, from, to, leadId, feedbackEventId } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      from,
      to,
      leadId,
      feedbackEventId,
    },
    'Started labels.generate job',
  );

  try {
    // TODO: Read feedback and messaging outcomes to generate TrainingLabel rows.
    // TODO: Emit model.train job when retraining thresholds are met.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
      },
      'Completed labels.generate job',
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
      'Failed labels.generate job',
    );

    throw error;
  }
}
