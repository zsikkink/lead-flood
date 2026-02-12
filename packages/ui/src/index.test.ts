import { describe, expect, it } from 'vitest';

import { identity } from './index.js';

describe('identity', () => {
  it('returns the provided value unchanged', () => {
    const value = { id: 'x', count: 1 };

    expect(identity(value)).toBe(value);
  });
});
