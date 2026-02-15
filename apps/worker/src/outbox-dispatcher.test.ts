import type PgBoss from 'pg-boss';
import { prisma } from '@lead-flood/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchPendingOutboxEvents } from './outbox-dispatcher.js';

describe('dispatchPendingOutboxEvents', () => {
  const createdOutboxIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdLeadIds: string[] = [];

  async function createQueuedJobFixture() {
    const lead = await prisma.lead.create({
      data: {
        firstName: 'Worker',
        lastName: 'Test',
        email: `worker-outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@lead-flood.local`,
        source: 'test',
        status: 'new',
      },
    });
    createdLeadIds.push(lead.id);

    const jobExecution = await prisma.jobExecution.create({
      data: {
        type: 'lead.enrich.stub',
        status: 'queued',
        payload: {
          leadId: lead.id,
          source: 'test',
        },
        leadId: lead.id,
      },
    });
    createdJobIds.push(jobExecution.id);

    return {
      leadId: lead.id,
      jobExecutionId: jobExecution.id,
    };
  }

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        type: 'lead.enrich.stub',
        status: {
          in: ['pending', 'failed', 'processing'],
        },
      },
    });
  });

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

    if (createdJobIds.length > 0) {
      await prisma.jobExecution.deleteMany({
        where: {
          id: {
            in: createdJobIds.splice(0, createdJobIds.length),
          },
        },
      });
    }

    if (createdLeadIds.length > 0) {
      await prisma.lead.deleteMany({
        where: {
          id: {
            in: createdLeadIds.splice(0, createdLeadIds.length),
          },
        },
      });
    }
  });

  it('marks pending outbox events as sent when publish succeeds', async () => {
    const fixture = await createQueuedJobFixture();
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: fixture.leadId,
          jobExecutionId: fixture.jobExecutionId,
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
    const fixture = await createQueuedJobFixture();
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: fixture.leadId,
          jobExecutionId: fixture.jobExecutionId,
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

  it('promotes failed outbox events to dead letter after max attempts', async () => {
    const fixture = await createQueuedJobFixture();
    const event = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: fixture.leadId,
          jobExecutionId: fixture.jobExecutionId,
          source: 'test',
        },
        status: 'failed',
        attempts: 5,
        nextAttemptAt: new Date(Date.now() - 1_000),
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

    expect(count).toBe(0);
    expect(boss.send).not.toHaveBeenCalled();

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated?.status).toBe('dead_letter');
    expect(updated?.lastError).toContain('Max dispatch attempts exceeded');
    expect(updated?.nextAttemptAt).toBeNull();
    expect(updated?.processedAt).not.toBeNull();
  });
});
