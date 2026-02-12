import { describe, expect, it } from 'vitest';

import { createUuidPrefix } from './index.js';

describe('createUuidPrefix', () => {
  it('joins prefix and random value with underscore', () => {
    expect(createUuidPrefix('lead', 'abc123')).toBe('lead_abc123');
  });
});
