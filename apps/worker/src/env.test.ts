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
      GOOGLE_SEARCH_ENABLED: 'true',
      GOOGLE_SEARCH_RATE_LIMIT_MS: '0',
      LINKEDIN_SCRAPE_ENABLED: 'false',
      COMPANY_SEARCH_ENABLED: 'true',
      PDL_ENABLED: 'false',
      HUNTER_ENABLED: 'true',
      CLEARBIT_ENABLED: 'false',
      OTHER_FREE_ENRICHMENT_ENABLED: 'true',
      DISCOVERY_ENABLED: 'true',
      ENRICHMENT_ENABLED: 'true',
    });

    expect(env.DATABASE_URL).toContain('lead_flood');
    expect(env.APP_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.APOLLO_ENABLED).toBe(false);
    expect(env.DISCOVERY_ENABLED).toBe(true);
    expect(env.ENRICHMENT_ENABLED).toBe(true);
    expect(env.DISCOVERY_DEFAULT_PROVIDER).toBe('GOOGLE_SEARCH');
    expect(env.ENRICHMENT_DEFAULT_PROVIDER).toBe('HUNTER');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadWorkerEnv({ APP_ENV: 'test' })).toThrowError(
      'Invalid worker environment configuration',
    );
  });
});
