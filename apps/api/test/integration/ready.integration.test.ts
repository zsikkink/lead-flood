import { createLogger } from '@lead-flood/observability';
import { describe, expect, it } from 'vitest';

import { buildServer } from '../../src/server.js';
import type { ApiEnv } from '../../src/env.js';

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  PG_BOSS_SCHEMA: 'pgboss',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
};

describe('GET /ready', () => {
  it('returns 503 when db check fails', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => false,
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      getLeadById: async () => null,
      getJobById: async () => null,
    });

    const response = await server.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', db: 'fail' });
    await server.close();
  });

  it('returns 200 when db check succeeds', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      getLeadById: async () => null,
      getJobById: async () => null,
    });

    const response = await server.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready', db: 'ok' });
    await server.close();
  });
});
