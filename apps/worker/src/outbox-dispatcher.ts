import type PgBoss from 'pg-boss';

import { prisma } from '@lead-flood/db';

interface OutboxPayload {
  leadId: string;
  jobExecutionId: string;
  source: string;
}

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

export async function dispatchPendingOutboxEvents(
  boss: Pick<PgBoss, 'send'>,
  logger: OutboxDispatchLogger,
): Promise<number> {
  const now = new Date();
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
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  let dispatchedCount = 0;

  for (const event of events) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: {
          in: ['pending', 'failed'],
        },
      },
      data: {
        status: 'processing',
      },
    });

    if (claimed.count === 0) {
      continue;
    }

    if (!isOutboxPayload(event.payload)) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          attempts: {
            increment: 1,
          },
          lastError: 'Invalid outbox payload',
          nextAttemptAt: new Date(Date.now() + 60_000),
        },
      });
      logger.warn({ outboxEventId: event.id, payload: event.payload }, 'Skipping invalid outbox payload');
      continue;
    }

    const payload: OutboxPayload = event.payload;

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
          processedAt: new Date(),
          lastError: null,
          nextAttemptAt: null,
        },
      });

      dispatchedCount += 1;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown outbox dispatch failure';
      const nextAttemptDelayMs = Math.min(60_000, 2 ** Math.min(event.attempts + 1, 6) * 1000);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'failed',
          attempts: {
            increment: 1,
          },
          lastError: errorMessage,
          nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs),
        },
      });

      logger.error(
        {
          outboxEventId: event.id,
          type: event.type,
          error,
        },
        'Outbox dispatch failed',
      );
    }
  }

  return dispatchedCount;
}
