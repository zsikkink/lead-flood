import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from './env.js';

describe('loadWorkerEnv', () => {
  it('parses required worker variables', () => {
    const env = loadWorkerEnv({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_onslaught',
      APP_ENV: 'test',
      LOG_LEVEL: 'debug',
      PG_BOSS_SCHEMA: 'pgboss',
    });

    expect(env.DATABASE_URL).toContain('lead_onslaught');
    expect(env.APP_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('throws on missing DATABASE_URL', () => {
    expect(() => loadWorkerEnv({ APP_ENV: 'test' })).toThrowError(
      'Invalid worker environment configuration',
    );
  });
});
