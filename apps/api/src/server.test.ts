import { createLogger } from '@lead-flood/observability';
import { afterEach, describe, expect, it } from 'vitest';

import { type LoginRequest } from '@lead-flood/contracts';

import { buildServer, type BuildServerOptions } from './server.js';
import type { ApiEnv } from './env.js';

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  PG_BOSS_SCHEMA: 'pgboss',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

const makeDefaultOptions = (): BuildServerOptions => ({
  env,
  logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
  checkDatabaseHealth: async () => true,
  authenticateUser: async ({ email }: LoginRequest) => ({
    tokenType: 'Bearer',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresInSeconds: 3600,
    user: {
      id: 'user_1',
      email,
      firstName: 'Demo',
      lastName: 'User',
    },
  }),
  createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
  getLeadById: async () => null,
  listLeads: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
  getJobById: async () => null,
});

describe('buildServer', () => {
  const servers: Array<ReturnType<typeof buildServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it('returns health response', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 404 with typed error body', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/missing' });
    const body = response.json() as { error: string; requestId?: string };
    const requestIdHeader = response.headers['x-request-id'];

    expect(response.statusCode).toBe(404);
    expect(body.error).toBe('Route not found');
    expect(typeof body.requestId).toBe('string');
    expect(requestIdHeader).toBe(body.requestId);
  });

  it('returns auth login response for valid payload', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'demo@lead-flood.local',
        password: 'password',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tokenType: 'Bearer',
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresInSeconds: 3600,
      user: {
        id: 'user_1',
        email: 'demo@lead-flood.local',
        firstName: 'Demo',
        lastName: 'User',
      },
    });
  });

  it('returns 401 for invalid login credentials', async () => {
    const server = buildServer({
      ...makeDefaultOptions(),
      authenticateUser: async () => null,
    });
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'demo@lead-flood.local',
        password: 'wrong-password',
      },
    });
    const body = response.json() as { error: string; requestId?: string };

    expect(response.statusCode).toBe(401);
    expect(body.error).toBe('Invalid email or password');
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('returns 400 for invalid login payload', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'not-an-email',
        password: 'password',
      },
    });
    const body = response.json() as { error: string; requestId?: string };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Invalid login payload');
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('creates lead and returns leadId/jobId', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        source: 'manual',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      leadId: 'lead_1',
      jobId: 'job_1',
    });
  });

  it('returns 400 for invalid lead payload', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/leads',
      payload: {
        firstName: 'Ada',
      },
    });
    const body = response.json() as { error: string };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Invalid lead payload');
  });

  it('returns 404 for missing lead', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/leads/lead_1',
    });
    const body = response.json() as { error: string };

    expect(response.statusCode).toBe(404);
    expect(body.error).toBe('Lead not found');
  });

  it('returns paginated lead inspection list', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/leads?page=1&pageSize=20',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it('returns lead payload when found', async () => {
    const server = buildServer({
      ...makeDefaultOptions(),
      getLeadById: async () => ({
        id: 'lead_1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        source: 'manual',
        status: 'enriched',
        enrichmentData: { company: 'Analytical Engines' },
        error: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    });
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/leads/lead_1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'lead_1',
      status: 'enriched',
    });
  });

  it('returns 404 for missing job', async () => {
    const server = buildServer(makeDefaultOptions());
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/jobs/job_1',
    });
    const body = response.json() as { error: string };

    expect(response.statusCode).toBe(404);
    expect(body.error).toBe('Job not found');
  });

  it('returns job payload when found', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const server = buildServer({
      ...makeDefaultOptions(),
      getJobById: async () => ({
        id: 'job_1',
        type: 'lead.enrich.stub',
        status: 'completed',
        attempts: 1,
        leadId: 'lead_1',
        result: { status: 'ok' },
        error: null,
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        updatedAt: now,
      }),
    });
    servers.push(server);

    const response = await server.inject({
      method: 'GET',
      url: '/v1/jobs/job_1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 'job_1',
      status: 'completed',
    });
  });
});
