import { createLogger } from '@lead-flood/observability';
import { describe, expect, it } from 'vitest';

import type { ApiEnv } from '../../src/env.js';
import { buildServer } from '../../src/server.js';

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
  SUPABASE_PROJECT_REF: 'test-project-ref',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

describe('POST /v1/auth/login integration', () => {
  it('returns 410 because email/password login endpoint is retired', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      accessTokenSecret: env.JWT_ACCESS_SECRET!,
      checkDatabaseHealth: async () => true,
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      getLeadById: async () => null,
      listLeads: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }),
      getJobById: async () => null,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'integration-auth@lead-flood.local',
        password: 'integration-password',
      },
    });

    expect(response.statusCode).toBe(410);
    expect((response.json() as { error: string }).error).toContain('Deprecated endpoint');

    await server.close();
  });
});
