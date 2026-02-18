import { prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  MESSAGE_GENERATE_JOB_NAME,
  MESSAGE_GENERATE_RETRY_OPTIONS,
  type MessageGenerateJobPayload,
} from './message.generate.job.js';

export const FOLLOWUP_CHECK_JOB_NAME = 'followup.check';

export const FOLLOWUP_CHECK_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'followup.check.dead_letter',
};

export interface FollowupCheckJobPayload {
  runId: string;
  correlationId?: string | undefined;
}

export interface FollowupCheckLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface FollowupCheckJobDependencies {
  boss: Pick<PgBoss, 'send'>;
}

export async function handleFollowupCheckJob(
  logger: FollowupCheckLogger,
  job: Job<FollowupCheckJobPayload>,
  deps: FollowupCheckJobDependencies,
): Promise<void> {
  const { runId, correlationId } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id },
    'Started followup.check job',
  );

  try {
    const now = new Date();

    // Find all MessageSends eligible for follow-up
    const eligibleSends = await prisma.messageSend.findMany({
      where: {
        status: 'SENT',
        followUpNumber: { lt: 3 },
        nextFollowUpAfter: { not: null, lte: now },
        lead: {
          status: 'messaged',
        },
      },
      select: {
        id: true,
        leadId: true,
        followUpNumber: true,
        lead: {
          select: {
            id: true,
            feedbackEvents: {
              where: { eventType: { in: ['REPLIED', 'UNSUBSCRIBED'] } },
              select: { id: true },
              take: 1,
            },
          },
        },
        messageDraft: {
          select: {
            icpProfileId: true,
            pitchedFeature: true,
          },
        },
      },
      orderBy: { nextFollowUpAfter: 'asc' },
    });

    let enqueuedCount = 0;

    for (const send of eligibleSends) {
      // Double-check: no reply events
      if (send.lead.feedbackEvents.length > 0) {
        // Stale data — cancel this follow-up
        await prisma.messageSend.update({
          where: { id: send.id },
          data: { nextFollowUpAfter: null },
        });
        continue;
      }

      // Collect previously pitched features from all drafts for this lead
      const previousDrafts = await prisma.messageDraft.findMany({
        where: { leadId: send.leadId, pitchedFeature: { not: null } },
        select: { pitchedFeature: true },
      });
      const previouslyPitchedFeatures = previousDrafts
        .map((d) => d.pitchedFeature)
        .filter((f): f is string => f !== null);

      const icpProfileId = send.messageDraft.icpProfileId;

      // Enqueue message.generate in follow-up mode
      await deps.boss.send(
        MESSAGE_GENERATE_JOB_NAME,
        {
          runId: `followup:${send.id}:${send.followUpNumber + 1}`,
          leadId: send.leadId,
          icpProfileId,
          followUpNumber: send.followUpNumber + 1,
          parentMessageSendId: send.id,
          previouslyPitchedFeatures,
          autoApprove: true,
          channel: 'WHATSAPP',
          knowledgeEntryIds: [],
          promptVersion: 'v1-followup',
          correlationId: correlationId ?? job.id,
        } satisfies MessageGenerateJobPayload,
        MESSAGE_GENERATE_RETRY_OPTIONS,
      );

      // Mark as consumed — prevent double-enqueue
      await prisma.messageSend.update({
        where: { id: send.id },
        data: { nextFollowUpAfter: null },
      });

      enqueuedCount++;
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        eligibleCount: eligibleSends.length,
        enqueuedCount,
      },
      'Completed followup.check job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, error },
      'Failed followup.check job',
    );
    throw error;
  }
}
