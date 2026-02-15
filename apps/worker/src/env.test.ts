import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from './env.js';

describe('loadWorkerEnv', () => {
  it('parses required worker variables', () => {
    const env = loadWorkerEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
      APP_ENV: 'test',
      LOG_LEVEL: 'debug',
      PG_BOSS_SCHEMA: 'pgboss',
      APOLLO_API_KEY: 'apollo-test-key',
      APOLLO_BASE_URL: 'https://api.apollo.io',
      APOLLO_RATE_LIMIT_MS: '0',
      PDL_API_KEY: 'pdl-test-key',
      PDL_BASE_URL: 'https://api.peopledatalabs.com',
      PDL_RATE_LIMIT_MS: '0',
      DISCOVERY_ENABLED: 'true',
      ENRICHMENT_ENABLED: 'true',
    });

    expect(env.DATABASE_URL).toContain('lead_flood');
    expect(env.APP_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.DISCOVERY_ENABLED).toBe(true);
    expect(env.ENRICHMENT_ENABLED).toBe(true);
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadWorkerEnv({ APP_ENV: 'test' })).toThrowError(
      'Invalid worker environment configuration',
    );
  });
});
