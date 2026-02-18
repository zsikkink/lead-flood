import { prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApiEnv } from '../../src/env.js';
import { signJwt } from '../../src/auth/jwt.js';
import { buildServer } from '../../src/server.js';
import type { DiscoveryRunJobPayload } from '../../src/modules/discovery/discovery.service.js';

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
  PG_BOSS_SCHEMA: 'pgboss',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: directUrl,
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

function authHeaders(): Record<string, string> {
  const token = signJwt(
    { sub: 'user_1', sid: 'sess_1', type: 'access', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
    env.JWT_ACCESS_SECRET!,
  );
  return { authorization: `Bearer ${token}` };
}

describe('discovery run integration', () => {
  const createdIcpIds: string[] = [];
  const createdRunIds: string[] = [];

  afterEach(async () => {
    if (createdRunIds.length > 0) {
      await prisma.jobExecution.deleteMany({
        where: {
          id: {
            in: createdRunIds.splice(0, createdRunIds.length),
          },
        },
      });
    }

    if (createdIcpIds.length > 0) {
      await prisma.qualificationRule.deleteMany({
        where: {
          icpProfileId: {
            in: createdIcpIds,
          },
        },
      });
      await prisma.icpProfile.deleteMany({
        where: {
          id: {
            in: createdIcpIds.splice(0, createdIcpIds.length),
          },
        },
      });
    }
  });

  it('creates a discovery run, enqueues a job payload, and exposes run status progression', async () => {
    const icp = await prisma.icpProfile.create({
      data: {
        name: `Discovery Run ICP ${Date.now()}`,
        isActive: true,
      },
    });
    createdIcpIds.push(icp.id);

    let enqueuedPayload: DiscoveryRunJobPayload | null = null;

    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      accessTokenSecret: env.JWT_ACCESS_SECRET!,
      checkDatabaseHealth: async () => true,
      authenticateUser: async () => null,
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      enqueueDiscoveryRun: async (payload) => {
        enqueuedPayload = payload;
      },
      getLeadById: async () => null,
      listLeads: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
      getJobById: async () => null,
    });

    const createResponse = await server.inject({
      method: 'POST',
      url: '/v1/discovery/runs',
      headers: authHeaders(),
      payload: {
        icpProfileId: icp.id,
        provider: 'BRAVE_SEARCH',
        limit: 25,
        cursor: 'page_1',
        requestedByUserId: 'user_1',
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const createBody = createResponse.json() as {
      runId: string;
      status: string;
    };
    expect(createBody.status).toBe('QUEUED');
    expect(createBody.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    createdRunIds.push(createBody.runId);

    expect(enqueuedPayload).toEqual({
      runId: createBody.runId,
      icpProfileId: icp.id,
      provider: 'BRAVE_SEARCH',
      limit: 25,
      cursor: 'page_1',
      requestedByUserId: 'user_1',
    });

    const persistedRun = await prisma.jobExecution.findUnique({
      where: { id: createBody.runId },
    });
    expect(persistedRun?.type).toBe('discovery.run');
    expect(persistedRun?.status).toBe('queued');

    const queuedStatusResponse = await server.inject({
      method: 'GET',
      url: `/v1/discovery/runs/${createBody.runId}`,
      headers: authHeaders(),
    });
    expect(queuedStatusResponse.statusCode).toBe(200);
    expect(queuedStatusResponse.json()).toMatchObject({
      runId: createBody.runId,
      runType: 'DISCOVERY',
      status: 'QUEUED',
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
    });

    await prisma.jobExecution.update({
      where: { id: createBody.runId },
      data: {
        status: 'running',
        attempts: {
          increment: 1,
        },
        startedAt: new Date(),
      },
    });

    const runningStatusResponse = await server.inject({
      method: 'GET',
      url: `/v1/discovery/runs/${createBody.runId}`,
      headers: authHeaders(),
    });
    expect(runningStatusResponse.statusCode).toBe(200);
    expect(runningStatusResponse.json()).toMatchObject({
      runId: createBody.runId,
      status: 'RUNNING',
    });

    await prisma.jobExecution.update({
      where: { id: createBody.runId },
      data: {
        status: 'completed',
        result: {
          totalItems: 5,
          processedItems: 4,
          failedItems: 1,
        },
        finishedAt: new Date(),
      },
    });

    const completedStatusResponse = await server.inject({
      method: 'GET',
      url: `/v1/discovery/runs/${createBody.runId}`,
      headers: authHeaders(),
    });
    expect(completedStatusResponse.statusCode).toBe(200);
    expect(completedStatusResponse.json()).toMatchObject({
      runId: createBody.runId,
      status: 'PARTIAL',
      totalItems: 5,
      processedItems: 4,
      failedItems: 1,
    });

    await server.close();
  });
});
