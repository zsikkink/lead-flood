import { prisma } from '@lead-flood/db';
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
  leadId?: string | undefined;
  feedbackEventId?: string | undefined;
  correlationId?: string | undefined;
}

export interface LabelsGenerateLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

/** Feedback event types that indicate positive outcomes. */
const POSITIVE_EVENT_TYPES = new Set(['REPLIED', 'MEETING_BOOKED', 'DEAL_WON']);
/** Feedback event types that indicate negative outcomes. */
const NEGATIVE_EVENT_TYPES = new Set(['DEAL_LOST', 'UNSUBSCRIBED', 'BOUNCED']);

/** Days after which a lead with no feedback is considered cold. */
const COLD_LEAD_TIMEOUT_DAYS = 14;
/** Minimum new labels before logging "retrain recommended". */
const RETRAIN_THRESHOLD = 50;

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
    let newLabelCount = 0;

    // ── 1. Generate labels from feedback events ──────────────────────────
    const unlabeledEvents = await prisma.feedbackEvent.findMany({
      where: {
        ...(feedbackEventId ? { id: feedbackEventId } : {}),
        ...(leadId ? { leadId } : {}),
        createdAt: { gte: new Date(from), lte: new Date(to) },
        trainingLabels: { none: {} },
      },
      select: { id: true, leadId: true, eventType: true },
    });

    for (const event of unlabeledEvents) {
      let label: number | null = null;
      if (POSITIVE_EVENT_TYPES.has(event.eventType)) {
        label = 1;
      } else if (NEGATIVE_EVENT_TYPES.has(event.eventType)) {
        label = 0;
      }

      if (label === null) continue;

      try {
        await prisma.trainingLabel.create({
          data: {
            leadId: event.leadId,
            feedbackEventId: event.id,
            label,
            source: 'FEEDBACK_EVENT',
          },
        });
        newLabelCount++;
      } catch (error: unknown) {
        // Skip unique constraint violations (duplicate labels)
        if (isPrismaUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    // ── 2. Generate negative labels for cold leads ───────────────────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - COLD_LEAD_TIMEOUT_DAYS);

    const coldLeads = await prisma.messageSend.findMany({
      where: {
        status: 'SENT',
        sentAt: { lte: cutoffDate },
        lead: {
          feedbackEvents: { none: {} },
          trainingLabels: {
            none: { source: 'COLD_LEAD_TIMEOUT' },
          },
        },
      },
      select: { leadId: true },
      distinct: ['leadId'],
    });

    for (const cold of coldLeads) {
      try {
        await prisma.trainingLabel.create({
          data: {
            leadId: cold.leadId,
            feedbackEventId: null,
            label: 0,
            source: 'COLD_LEAD_TIMEOUT',
          },
        });
        newLabelCount++;
      } catch (error: unknown) {
        if (isPrismaUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    if (newLabelCount >= RETRAIN_THRESHOLD) {
      logger.info(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          newLabelCount,
          threshold: RETRAIN_THRESHOLD,
        },
        'Retrain recommended: new label count exceeds threshold',
      );
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        newLabelCount,
        feedbackLabels: unlabeledEvents.length,
        coldLeadLabels: coldLeads.length,
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

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
