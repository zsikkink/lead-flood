import { describe, expect, it } from 'vitest';

import { computeNextFollowUpAfter, computeOooFollowUpAfter } from './jitter.js';

describe('computeNextFollowUpAfter', () => {
  it('returns a date between 60h and 96h from now', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const result = computeNextFollowUpAfter(now);

    const diffMs = result.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    expect(diffHours).toBeGreaterThanOrEqual(60);
    expect(diffHours).toBeLessThanOrEqual(96);
  });

  it('produces different values across multiple calls (randomness)', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const results = new Set<number>();

    for (let i = 0; i < 20; i++) {
      results.add(computeNextFollowUpAfter(now).getTime());
    }

    // With 20 random calls, we should get at least 2 distinct values
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('computeOooFollowUpAfter', () => {
  it('returns a date between 6.5d and 8d from now', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const result = computeOooFollowUpAfter(now);

    const diffMs = result.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // 7 days = 168h, jitter -12h to +24h => 156h to 192h
    expect(diffHours).toBeGreaterThanOrEqual(156);
    expect(diffHours).toBeLessThanOrEqual(192);
  });
});
