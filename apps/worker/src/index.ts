import PgBoss from 'pg-boss';

import { createLogger } from '@lead-flood/observability';

import { loadWorkerEnv } from './env.js';
import { handleHeartbeatJob, type HeartbeatJobPayload } from './jobs/heartbeat.job.js';
import { handleLeadEnrichJob, type LeadEnrichJobPayload } from './jobs/lead-enrich.job.js';

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
