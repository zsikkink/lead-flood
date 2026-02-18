import type { NotifySalesJobPayload, ReplyClassifyJobPayload } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { OpenAiAdapter } from '@lead-flood/providers';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import { computeOooFollowUpAfter } from '../utils/jitter.js';

export const REPLY_CLASSIFY_JOB_NAME = 'reply.classify';

export const REPLY_CLASSIFY_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'reply.classify.dead_letter',
};

export { type ReplyClassifyJobPayload };

export interface ReplyClassifyLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface ReplyClassifyJobDependencies {
  openAiAdapter: OpenAiAdapter;
  boss: Pick<PgBoss, 'send'>;
  notifySalesJobName: string;
  notifySalesRetryOptions: Pick<SendOptions, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'>;
}

async function cancelFollowUps(leadId: string): Promise<void> {
  await prisma.messageSend.updateMany({
    where: {
      leadId,
      nextFollowUpAfter: { not: null },
    },
    data: { nextFollowUpAfter: null },
  });
}

export async function handleReplyClassifyJob(
  logger: ReplyClassifyLogger,
  job: Job<ReplyClassifyJobPayload>,
  deps: ReplyClassifyJobDependencies,
): Promise<void> {
  const { runId, correlationId, feedbackEventId, replyText, leadId, messageSendId } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id, feedbackEventId, leadId },
    'Started reply.classify job',
  );

  try {
    // Voice note / media-only: no text to classify
    if (!replyText || replyText.trim().length === 0) {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await cancelFollowUps(leadId);

      const notifyPayload: NotifySalesJobPayload = {
        runId: `notify.sales:${feedbackEventId}`,
        leadId,
        feedbackEventId,
        classification: null,
        unclassified: true,
        reason: 'MEDIA_ONLY',
        correlationId: correlationId ?? job.id,
      };

      await deps.boss.send(deps.notifySalesJobName, notifyPayload, deps.notifySalesRetryOptions);

      logger.info(
        { jobId: job.id, feedbackEventId, leadId },
        'Media-only reply — marked replied, notifying team',
      );
      return;
    }

    // Classify via OpenAI
    const result = await deps.openAiAdapter.classifyReply(replyText);

    if (result.status !== 'success') {
      const errorType = result.status === 'retryable_error' ? 'retryable' : 'terminal';
      logger.error(
        { jobId: job.id, feedbackEventId, errorType, failure: result.failure },
        'OpenAI classification failed',
      );

      if (result.status === 'retryable_error') {
        throw new Error(`OpenAI retryable: ${result.failure.message}`);
      }

      // Terminal error: mark as replied (safe default), notify team for manual review
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await cancelFollowUps(leadId);

      await deps.boss.send(
        deps.notifySalesJobName,
        {
          runId: `notify.sales:${feedbackEventId}`,
          leadId,
          feedbackEventId,
          classification: null,
          unclassified: true,
          reason: 'CLASSIFICATION_FAILED',
          correlationId: correlationId ?? job.id,
        } satisfies NotifySalesJobPayload,
        deps.notifySalesRetryOptions,
      );
      return;
    }

    const classification = result.data.classification;

    // Update FeedbackEvent with classification
    await prisma.feedbackEvent.update({
      where: { id: feedbackEventId },
      data: { replyClassification: classification },
    });

    // Side effects by classification
    switch (classification) {
      case 'INTERESTED': {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
        await cancelFollowUps(leadId);
        await deps.boss.send(
          deps.notifySalesJobName,
          {
            runId: `notify.sales:${feedbackEventId}`,
            leadId,
            feedbackEventId,
            classification,
            correlationId: correlationId ?? job.id,
          } satisfies NotifySalesJobPayload,
          deps.notifySalesRetryOptions,
        );
        break;
      }

      case 'NOT_INTERESTED':
      case 'UNSUBSCRIBE': {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'cold' } });
        await cancelFollowUps(leadId);
        break;
      }

      case 'OUT_OF_OFFICE': {
        // Re-schedule follow-up for 7 days + jitter from now
        const latestSend = await prisma.messageSend.findFirst({
          where: { leadId, status: 'SENT' },
          orderBy: { sentAt: 'desc' },
        });

        if (latestSend) {
          await prisma.messageSend.update({
            where: { id: latestSend.id },
            data: { nextFollowUpAfter: computeOooFollowUpAfter() },
          });
        }
        break;
      }
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        feedbackEventId,
        leadId,
        classification,
        confidence: result.data.confidence,
      },
      'Completed reply.classify job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, feedbackEventId, leadId, error },
      'Failed reply.classify job',
    );
    throw error;
  }
}
