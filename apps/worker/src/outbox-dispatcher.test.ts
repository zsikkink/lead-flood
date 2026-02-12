import type PgBoss from 'pg-boss';
import { prisma } from '@lead-flood/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchPendingOutboxEvents } from './outbox-dispatcher.js';

describe('dispatchPendingOutboxEvents', () => {
  const createdOutboxIds: string[] = [];

  afterEach(async () => {
    if (createdOutboxIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: {
          id: {
            in: createdOutboxIds.splice(0, createdOutboxIds.length),
          },
        },
      });
    }
  });

  it('marks pending outbox events as sent when publish succeeds', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: 'lead_1',
          jobExecutionId: 'job_1',
          source: 'test',
        },
        status: 'pending',
      },
    });
    createdOutboxIds.push(event.id);

    const boss = {
      send: vi.fn(async () => 'ok'),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const count = await dispatchPendingOutboxEvents(boss as unknown as Pick<PgBoss, 'send'>, logger);

    expect(count).toBe(1);
    expect(boss.send).toHaveBeenCalledTimes(1);

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated?.status).toBe('sent');
    expect(updated?.attempts).toBe(1);
    expect(updated?.processedAt).not.toBeNull();
  });

  it('marks outbox events as failed and schedules retry when publish fails', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: 'lead_1',
          jobExecutionId: 'job_1',
          source: 'test',
        },
        status: 'pending',
      },
    });
    createdOutboxIds.push(event.id);

    const boss = {
      send: vi.fn(async () => {
        throw new Error('queue unavailable');
      }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const count = await dispatchPendingOutboxEvents(boss as unknown as Pick<PgBoss, 'send'>, logger);

    expect(count).toBe(0);
    expect(boss.send).toHaveBeenCalledTimes(1);

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated?.status).toBe('failed');
    expect(updated?.attempts).toBe(1);
    expect(updated?.nextAttemptAt).not.toBeNull();
    expect(updated?.lastError).toContain('queue unavailable');
  });
});
