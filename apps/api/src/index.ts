import PgBoss from 'pg-boss';

import { Prisma, prisma } from '@lead-onslaught/db';
import { createLogger } from '@lead-onslaught/observability';

import { loadApiEnv } from './env.js';
import { buildServer, LeadAlreadyExistsError } from './server.js';

async function main(): Promise<void> {
  const env = loadApiEnv(process.env);
  const logger = createLogger({
    service: 'api',
    env: env.APP_ENV,
    level: env.LOG_LEVEL,
  });
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PG_BOSS_SCHEMA,
  });

  await boss.start();
  await boss.createQueue('lead.enrich.stub');

  const server = buildServer({
    env,
    logger,
    checkDatabaseHealth: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (error: unknown) {
        logger.error({ error }, 'Database readiness check failed');
        return false;
      }
    },
    createLeadAndEnqueue: async (input) => {
      try {
        const { lead, jobExecution } = await prisma.$transaction(async (tx) => {
          const lead = await tx.lead.create({
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email,
              source: input.source,
              status: 'new',
            },
          });

          const jobExecution = await tx.jobExecution.create({
            data: {
              type: 'lead.enrich.stub',
              status: 'queued',
              payload: {
                leadId: lead.id,
                source: input.source,
              },
              leadId: lead.id,
            },
          });

          return {
            lead,
            jobExecution,
          };
        });

        try {
          await boss.send(
            'lead.enrich.stub',
            {
              leadId: lead.id,
              jobExecutionId: jobExecution.id,
              source: input.source,
            },
            {
              singletonKey: `lead.enrich.stub:${lead.id}`,
              retryLimit: 3,
              retryDelay: 5,
              retryBackoff: true,
            },
          );
        } catch (error: unknown) {
          logger.error({ error, leadId: lead.id }, 'Failed to enqueue lead enrichment job');

          await prisma.$transaction([
            prisma.lead.update({
              where: { id: lead.id },
              data: {
                status: 'failed',
                error: 'Failed to enqueue enrichment job',
              },
            }),
            prisma.jobExecution.update({
              where: { id: jobExecution.id },
              data: {
                status: 'failed',
                error: 'Failed to enqueue enrichment job',
                finishedAt: new Date(),
              },
            }),
          ]);

          throw error;
        }

        return {
          leadId: lead.id,
          jobId: jobExecution.id,
        };
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new LeadAlreadyExistsError('Lead already exists for this email');
        }

        throw error;
      }
    },
    getLeadById: async (leadId) => {
      return prisma.lead.findUnique({
        where: { id: leadId },
      });
    },
    getJobById: async (jobId) => {
      return prisma.jobExecution.findUnique({
        where: { id: jobId },
      });
    },
  });

  await server.listen({
    host: '0.0.0.0',
    port: env.API_PORT,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down API');
    await server.close();
    await boss.stop();
    await prisma.$disconnect();
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
  console.error('API boot failed:', error);
  process.exit(1);
});
