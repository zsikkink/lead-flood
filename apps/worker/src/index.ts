import PgBoss from 'pg-boss';

import { createLogger } from '@lead-flood/observability';

import { loadWorkerEnv } from './env.js';
import { handleHeartbeatJob, type HeartbeatJobPayload } from './jobs/heartbeat.job.js';
import { handleLeadEnrichJob, type LeadEnrichJobPayload } from './jobs/lead-enrich.job.js';
import { dispatchPendingOutboxEvents } from './outbox-dispatcher.js';

async function main(): Promise<void> {
  const env = loadWorkerEnv(process.env);
  const logger = createLogger({
    service: 'worker',
    env: env.APP_ENV,
    level: env.LOG_LEVEL,
  });

  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PG_BOSS_SCHEMA,
  });

  await boss.start();
  logger.info('Worker started');

  await boss.createQueue('system.heartbeat');
  await boss.createQueue('lead.enrich.stub');

  let outboxDispatchRunning = false;
  const runOutboxDispatch = async (): Promise<void> => {
    if (outboxDispatchRunning) {
      return;
    }

    outboxDispatchRunning = true;
    try {
      const dispatchedCount = await dispatchPendingOutboxEvents(boss, logger);
      if (dispatchedCount > 0) {
        logger.info({ dispatchedCount }, 'Dispatched outbox events');
      }
    } catch (error: unknown) {
      logger.error({ error }, 'Outbox dispatch cycle failed');
    } finally {
      outboxDispatchRunning = false;
    }
  };

  await runOutboxDispatch();
  const outboxInterval = setInterval(() => {
    void runOutboxDispatch();
  }, 5000);
  await boss.schedule(
    'system.heartbeat',
    '*/1 * * * *',
    { source: 'scheduler' } satisfies HeartbeatJobPayload,
    {
      singletonKey: 'system.heartbeat',
      retryLimit: 2,
      retryDelay: 5,
    },
  );

  await boss.work<HeartbeatJobPayload>('system.heartbeat', async (jobs) => {
    for (const job of jobs) {
      await handleHeartbeatJob(logger, job);
    }
  });

  await boss.work<LeadEnrichJobPayload>('lead.enrich.stub', async (jobs) => {
    for (const job of jobs) {
      await handleLeadEnrichJob(logger, job);
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down worker');
    clearInterval(outboxInterval);
    await boss.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error('Worker boot failed:', error);
  process.exit(1);
});
