import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from './env.js';

describe('loadWorkerEnv', () => {
  it('parses required worker variables', () => {
    const env = loadWorkerEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
      APP_ENV: 'test',
      LOG_LEVEL: 'debug',
      PG_BOSS_SCHEMA: 'pgboss',
      APOLLO_ENABLED: 'false',
      LINKEDIN_SCRAPE_ENABLED: 'false',
      COMPANY_SEARCH_ENABLED: 'true',
      PDL_ENABLED: 'false',
      HUNTER_ENABLED: 'true',
      CLEARBIT_ENABLED: 'false',
      OTHER_FREE_ENRICHMENT_ENABLED: 'true',
      DISCOVERY_ENABLED: 'false',
      SERPAPI_DISCOVERY_ENABLED: 'true',
      ENRICHMENT_ENABLED: 'true',
    });

    expect(env.DATABASE_URL).toContain('lead_flood');
    expect(env.APP_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.APOLLO_ENABLED).toBe(false);
    expect(env.DISCOVERY_ENABLED).toBe(false);
    expect(env.SERPAPI_DISCOVERY_ENABLED).toBe(true);
    expect(env.ENRICHMENT_ENABLED).toBe(true);
    expect(env.ENRICHMENT_DEFAULT_PROVIDER).toBe('HUNTER');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadWorkerEnv({ APP_ENV: 'test' })).toThrowError(
      'Invalid worker environment configuration',
    );
  });

  it('throws when legacy Google CSE env vars are present', () => {
    expect(() =>
      loadWorkerEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_flood',
        APP_ENV: 'test',
        GOOGLE_SEARCH_API_KEY: 'legacy-key',
      }),
    ).toThrowError('Google CSE is deprecated and not supported');
  });
});
