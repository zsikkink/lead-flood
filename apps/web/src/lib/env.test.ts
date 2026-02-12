import { describe, expect, it, vi } from 'vitest';

import { getWebEnv } from './env';

describe('getWebEnv', () => {
  it('uses default API base URL when not set', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', undefined);
    const env = getWebEnv();
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:5050');
  });

  it('returns configured API base URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:9999');
    const env = getWebEnv();
    expect(env.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:9999');
  });
});
