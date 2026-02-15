import PgBoss from 'pg-boss';

import { Prisma, prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ApiEnv } from '../../src/env.js';
import { buildServer, LeadAlreadyExistsError, type BuildServerOptions } from '../../src/server.js';

interface LeadEnrichJobPayload {
  leadId: string;
  jobExecutionId: string;
  source: string;
}

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/lead_flood';
process.env.DATABASE_URL = databaseUrl;
const directUrl = process.env.DIRECT_URL ?? databaseUrl;
process.env.DIRECT_URL = directUrl;

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  PG_BOSS_SCHEMA: process.env.PG_BOSS_SCHEMA ?? 'pgboss',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: directUrl,
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function processLeadEnrichJob(job: { data: LeadEnrichJobPayload }): Promise<void> {
  const { leadId, jobExecutionId, source } = job.data;

  const jobExecution = await prisma.jobExecution.findUnique({
    where: { id: jobExecutionId },
  });
  if (!jobExecution) {
    return;
  }

  await prisma.$transaction([
    prisma.jobExecution.update({
      where: { id: jobExecutionId },
      data: {
        status: 'running',
        startedAt: new Date(),
        attempts: {
          increment: 1,
        },
        error: null,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'processing',
        error: null,
      },
    }),
  ]);

  await sleep(2000);

  const enrichmentData = {
    provider: 'stub',
    source,
    enrichedAt: new Date().toISOString(),
  };

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'enriched',
        enrichmentData,
        error: null,
      },
    }),
    prisma.jobExecution.update({
      where: { id: jobExecutionId },
      data: {
        status: 'completed',
        result: enrichmentData,
        error: null,
        finishedAt: new Date(),
      },
    }),
  ]);
}

describe('lead pipeline e2e', () => {
  const logger = createLogger({ service: 'api-e2e', env: 'test', level: 'error' });
  let boss: PgBoss | null = null;
  let server: ReturnType<typeof buildServer> | null = null;

  beforeAll(async () => {
    const queueBoss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: env.PG_BOSS_SCHEMA,
    });
    await queueBoss.start();
    await queueBoss.createQueue('lead.enrich.stub');
    await queueBoss.work<LeadEnrichJobPayload>('lead.enrich.stub', async (jobs) => {
      for (const job of jobs) {
        await processLeadEnrichJob(job);
      }
    });
    boss = queueBoss;

    const options: BuildServerOptions = {
      env,
      logger,
      checkDatabaseHealth: async () => {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      },
      authenticateUser: async () => null,
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

          await queueBoss.send('lead.enrich.stub', {
            leadId: lead.id,
            jobExecutionId: jobExecution.id,
            source: input.source,
          });

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
      listLeads: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
      getJobById: async (jobId) => {
        return prisma.jobExecution.findUnique({
          where: { id: jobId },
        });
      },
    };

    server = buildServer(options);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
    if (boss) {
      await boss.stop();
    }
  });

  it('creates and enriches a lead end-to-end', async () => {
    const uniqueEmail = `e2e-${Date.now()}@lead-flood.local`;

    if (!server) {
      throw new Error('Server not initialized');
    }

    const createResponse = await server.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        firstName: 'E2E',
        lastName: 'Tester',
        email: uniqueEmail,
        source: 'e2e',
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json() as { leadId: string; jobId: string };

    let leadStatus: string | null = null;
    let jobStatus: string | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const lead = await prisma.lead.findUnique({
        where: { id: created.leadId },
      });
      const job = await prisma.jobExecution.findUnique({
        where: { id: created.jobId },
      });
      leadStatus = lead?.status ?? null;
      jobStatus = job?.status ?? null;

      if (leadStatus === 'enriched' && jobStatus === 'completed') {
        break;
      }

      await sleep(500);
    }

    expect(leadStatus).toBe('enriched');
    expect(jobStatus).toBe('completed');

    await prisma.jobExecution.deleteMany({
      where: { leadId: created.leadId },
    });
    await prisma.lead.delete({
      where: { id: created.leadId },
    });
  });
});
