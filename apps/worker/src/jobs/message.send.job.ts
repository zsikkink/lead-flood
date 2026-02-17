import type { SendMessageRequest } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { ResendAdapter, TrengoAdapter } from '@lead-flood/providers';
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
  sendId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  correlationId?: string;
}

export interface MessageSendLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface MessageSendJobDependencies {
  resendAdapter: ResendAdapter;
  trengoAdapter: TrengoAdapter;
}

export async function handleMessageSendJob(
  logger: MessageSendLogger,
  job: Job<MessageSendJobPayload>,
  deps?: MessageSendJobDependencies,
): Promise<void> {
  const { runId, correlationId, sendId, messageDraftId, messageVariantId, idempotencyKey, channel } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      sendId,
      messageDraftId,
      messageVariantId,
      idempotencyKey,
      channel,
    },
    'Started message.send job',
  );

  try {
    const send = await prisma.messageSend.findUnique({
      where: { id: sendId },
      include: {
        messageVariant: true,
        lead: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!send) {
      logger.error({ jobId: job.id, sendId }, 'MessageSend not found');
      return;
    }

    if (send.status !== 'QUEUED') {
      logger.warn({ jobId: job.id, sendId, status: send.status }, 'MessageSend already processed');
      return;
    }

    const effectiveChannel = channel ?? send.channel;

    if (effectiveChannel === 'EMAIL') {
      if (!deps?.resendAdapter) {
        await markFailed(sendId, 'PROVIDER_NOT_CONFIGURED', 'Resend adapter not available');
        logger.error({ jobId: job.id, sendId }, 'Resend adapter not configured');
        return;
      }

      const result = await deps.resendAdapter.sendEmail({
        to: send.lead.email,
        subject: send.messageVariant.subject ?? `Message from Lead Flood`,
        bodyText: send.messageVariant.bodyText,
        bodyHtml: send.messageVariant.bodyHtml,
        idempotencyKey: send.idempotencyKey,
      });

      if (result.status === 'success') {
        await prisma.messageSend.update({
          where: { id: sendId },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
          },
        });

        logger.info(
          { jobId: job.id, sendId, providerMessageId: result.providerMessageId },
          'Email sent successfully via Resend',
        );
      } else if (result.status === 'retryable_error') {
        throw new Error(`Resend retryable error: ${result.failure.message}`);
      } else {
        await markFailed(sendId, result.failure.statusCode?.toString() ?? 'TERMINAL', result.failure.message);
        logger.error({ jobId: job.id, sendId, failure: result.failure }, 'Email send failed permanently');
      }
    } else if (effectiveChannel === 'WHATSAPP') {
      if (!deps?.trengoAdapter) {
        await markFailed(sendId, 'PROVIDER_NOT_CONFIGURED', 'Trengo adapter not available');
        logger.error({ jobId: job.id, sendId }, 'Trengo adapter not configured');
        return;
      }

      const result = await deps.trengoAdapter.sendMessage({
        to: send.lead.email,
        bodyText: send.messageVariant.bodyText,
      });

      if (result.status === 'success') {
        await prisma.messageSend.update({
          where: { id: sendId },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
          },
        });

        logger.info(
          { jobId: job.id, sendId, providerMessageId: result.providerMessageId },
          'WhatsApp message sent via Trengo',
        );
      } else if (result.status === 'retryable_error') {
        throw new Error(`Trengo retryable error: ${result.failure.message}`);
      } else {
        await markFailed(sendId, result.failure.statusCode?.toString() ?? 'TERMINAL', result.failure.message);
        logger.error({ jobId: job.id, sendId, failure: result.failure }, 'WhatsApp send failed permanently');
      }
    } else {
      await markFailed(sendId, 'UNSUPPORTED_CHANNEL', `Unsupported channel: ${effectiveChannel}`);
      logger.error({ jobId: job.id, sendId, channel: effectiveChannel }, 'Unsupported message channel');
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        sendId,
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
        sendId,
        messageDraftId,
        messageVariantId,
        error,
      },
      'Failed message.send job',
    );

    throw error;
  }
}

async function markFailed(sendId: string, failureCode: string, failureReason: string): Promise<void> {
  await prisma.messageSend.update({
    where: { id: sendId },
    data: {
      status: 'FAILED',
      failureCode,
      failureReason,
    },
  });
}
