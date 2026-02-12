import type PgBoss from 'pg-boss';
import { prisma } from '@lead-flood/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dispatchPendingOutboxEvents } from '../../src/outbox-dispatcher.js';

describe('outbox retry recovery integration', () => {
  const createdOutboxIds: string[] = [];
  const createdJobIds: string[] = [];
  const createdLeadIds: string[] = [];

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

  it('recovers from publish failure and eventually marks event sent', async () => {
    const lead = await prisma.lead.create({
      data: {
        firstName: 'Integration',
        lastName: 'Worker',
        email: `outbox-recovery-${Date.now()}@lead-flood.local`,
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

    const outboxEvent = await prisma.outboxEvent.create({
      data: {
        type: 'lead.enrich.stub',
        payload: {
          leadId: lead.id,
          jobExecutionId: jobExecution.id,
          source: 'test',
        },
        status: 'pending',
      },
    });
    createdOutboxIds.push(outboxEvent.id);

    const boss = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error('temporary queue outage'))
        .mockResolvedValueOnce('ok'),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const firstDispatchCount = await dispatchPendingOutboxEvents(
      boss as unknown as Pick<PgBoss, 'send'>,
      logger,
    );
    expect(firstDispatchCount).toBe(0);

    const firstAttemptState = await prisma.outboxEvent.findUnique({
      where: { id: outboxEvent.id },
    });
    expect(firstAttemptState?.status).toBe('failed');
    expect(firstAttemptState?.attempts).toBe(1);
    expect(firstAttemptState?.nextAttemptAt).not.toBeNull();

    await prisma.outboxEvent.update({
      where: { id: outboxEvent.id },
      data: {
        status: 'failed',
        nextAttemptAt: new Date(Date.now() - 1_000),
      },
    });

    const secondDispatchCount = await dispatchPendingOutboxEvents(
      boss as unknown as Pick<PgBoss, 'send'>,
      logger,
    );
    expect(secondDispatchCount).toBe(1);
    expect(boss.send).toHaveBeenCalledTimes(2);

    const recoveredState = await prisma.outboxEvent.findUnique({
      where: { id: outboxEvent.id },
    });
    expect(recoveredState?.status).toBe('sent');
    expect(recoveredState?.attempts).toBe(2);
    expect(recoveredState?.processedAt).not.toBeNull();
    expect(recoveredState?.nextAttemptAt).toBeNull();
  });
});
