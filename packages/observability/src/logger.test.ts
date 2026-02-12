import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('creates logger with service/env bindings', () => {
    const logger = createLogger({ service: 'worker', env: 'test', level: 'debug' });

    expect(logger).toBeDefined();
    expect(logger.level).toBe('debug');
  });
});
