import type { SendMessageRequest } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

export const MESSAGE_SEND_JOB_NAME = 'message.send';
export const MESSAGE_SEND_IDEMPOTENCY_KEY_PATTERN = 'message.send:${messageVariantId}';

export const MESSAGE_SEND_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 5,
  retryDelay: 90,
  retryBackoff: true,
  deadLetter: 'message.send.dead_letter',
};

export interface MessageSendJobPayload extends Pick<SendMessageRequest, 'messageDraftId' | 'messageVariantId' | 'idempotencyKey' | 'scheduledAt'> {
  runId: string;
  channel: 'EMAIL';
  correlationId?: string;
}

export interface MessageSendLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleMessageSendJob(
  logger: MessageSendLogger,
  job: Job<MessageSendJobPayload>,
): Promise<void> {
  const { runId, correlationId, messageDraftId, messageVariantId, idempotencyKey } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      messageDraftId,
      messageVariantId,
      idempotencyKey,
    },
    'Started message.send job',
  );

  try {
    // TODO: Send selected message variant using configured provider.
    // TODO: Persist MessageSend status transitions and emit analytics.rollup job.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        messageDraftId,
        messageVariantId,
      },
      'Completed message.send job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        messageDraftId,
        messageVariantId,
        error,
      },
      'Failed message.send job',
    );

    throw error;
  }
}
