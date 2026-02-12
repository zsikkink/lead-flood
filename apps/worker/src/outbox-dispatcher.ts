import type PgBoss from 'pg-boss';

import { prisma } from '@lead-flood/db';

interface OutboxPayload {
  leadId: string;
  jobExecutionId: string;
  source: string;
}

const MAX_OUTBOX_ATTEMPTS = 5;
const DISPATCH_BATCH_SIZE = 20;
const STALE_PROCESSING_WINDOW_MS = 5 * 60 * 1000;
const BASE_RETRY_DELAY_MS = 5 * 1000;
const MAX_RETRY_DELAY_MS = 60 * 1000;

const TERMINAL_OUTBOX_STATUSES = new Set(['sent', 'dead_letter']);

export interface OutboxDispatchLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

function isOutboxPayload(payload: unknown): payload is OutboxPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as Record<string, unknown>;
  return (
    typeof value.leadId === 'string' &&
    typeof value.jobExecutionId === 'string' &&
    typeof value.source === 'string'
  );
}

function calculateRetryDelay(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1));
}

export async function dispatchPendingOutboxEvents(
  boss: Pick<PgBoss, 'send'>,
  logger: OutboxDispatchLogger,
): Promise<number> {
  const now = new Date();
  const staleProcessingCutoff = new Date(now.getTime() - STALE_PROCESSING_WINDOW_MS);
  const events = await prisma.outboxEvent.findMany({
    where: {
      OR: [
        { status: 'pending' },
        {
          status: 'failed',
          nextAttemptAt: {
            lte: now,
          },
        },
        {
          status: 'processing',
          updatedAt: {
            lte: staleProcessingCutoff,
          },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: DISPATCH_BATCH_SIZE,
  });

  let dispatchedCount = 0;

  for (const event of events) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: {
          in: ['pending', 'failed', 'processing'],
        },
      },
      data: {
        status: 'processing',
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    if (TERMINAL_OUTBOX_STATUSES.has(event.status)) {
      continue;
    }

    if (event.attempts >= MAX_OUTBOX_ATTEMPTS) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'dead_letter',
          lastError: 'Max dispatch attempts exceeded',
          nextAttemptAt: null,
          processedAt: now,
        },
      });
      logger.warn(
        {
          outboxEventId: event.id,
          attempts: event.attempts,
        },
        'Promoted outbox event to dead letter queue due to max attempts',
      );
      continue;
    }

    if (!isOutboxPayload(event.payload)) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'dead_letter',
          attempts: {
            increment: 1,
          },
          lastError: 'Invalid outbox payload',
          nextAttemptAt: null,
          processedAt: now,
        },
      });
      logger.warn(
        {
          outboxEventId: event.id,
          payload: event.payload,
        },
        'Promoted outbox event to dead letter queue because payload is invalid',
      );
      continue;
    }

    const payload: OutboxPayload = event.payload;
    const targetJob = await prisma.jobExecution.findUnique({
      where: { id: payload.jobExecutionId },
      select: { id: true, status: true },
    });

    if (!targetJob) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'dead_letter',
          attempts: {
            increment: 1,
          },
          lastError: 'Referenced job execution was not found',
          nextAttemptAt: null,
          processedAt: now,
        },
      });
      logger.warn(
        {
          outboxEventId: event.id,
          jobExecutionId: payload.jobExecutionId,
        },
        'Promoted outbox event to dead letter queue because target job is missing',
      );
      continue;
    }

    if (targetJob.status !== 'queued') {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'sent',
          attempts: {
            increment: 1,
          },
          lastError: `Skipped publish because target job is already ${targetJob.status}`,
          nextAttemptAt: null,
          processedAt: now,
        },
      });
      logger.info(
        {
          outboxEventId: event.id,
          jobExecutionId: targetJob.id,
          jobStatus: targetJob.status,
        },
        'Marked outbox event as sent without publish to avoid duplicate work',
      );
      continue;
    }

    try {
      await boss.send(event.type, payload, {
        singletonKey: `outbox:${event.id}`,
        retryLimit: 3,
        retryDelay: 5,
        retryBackoff: true,
      });

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'sent',
          attempts: {
            increment: 1,
          },
          processedAt: now,
          lastError: null,
          nextAttemptAt: null,
        },
      });

      dispatchedCount += 1;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown outbox dispatch failure';
      const attemptsAfterFailure = event.attempts + 1;

      if (attemptsAfterFailure >= MAX_OUTBOX_ATTEMPTS) {
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'dead_letter',
            attempts: {
              increment: 1,
            },
            lastError: errorMessage,
            nextAttemptAt: null,
            processedAt: now,
          },
        });

        logger.error(
          {
            outboxEventId: event.id,
            type: event.type,
            attempts: attemptsAfterFailure,
            error,
          },
          'Outbox dispatch failed and was promoted to dead letter queue',
        );
        continue;
      }

      const nextAttemptDelayMs = calculateRetryDelay(attemptsAfterFailure);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          attempts: {
            increment: 1,
          },
          lastError: errorMessage,
          nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs),
          processedAt: null,
        },
      });

      logger.error(
        {
          outboxEventId: event.id,
          type: event.type,
          attempts: attemptsAfterFailure,
          error,
        },
        'Outbox dispatch failed',
      );
    }
  }

  return dispatchedCount;
}
