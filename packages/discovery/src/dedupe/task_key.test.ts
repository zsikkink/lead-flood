import { describe, expect, it } from 'vitest';

import { computeQueryHash, computeTimeBucket } from './task_key.js';

describe('computeTimeBucket', () => {
  it('computes daily bucket', () => {
    const bucket = computeTimeBucket(new Date('2026-02-18T10:00:00.000Z'), 'daily');
    expect(bucket).toBe('2026-02-18');
  });

  it('computes weekly bucket', () => {
    const bucket = computeTimeBucket(new Date('2026-02-18T10:00:00.000Z'), 'weekly');
    expect(bucket).toBe('2026-W08');
  });
});

describe('computeQueryHash', () => {
  it('is deterministic for the same input', () => {
    const hash1 = computeQueryHash('SERP_GOOGLE', 'AE', 'en', 'bakery dubai', 1, '2026-W08');
    const hash2 = computeQueryHash('SERP_GOOGLE', 'AE', 'en', 'bakery dubai', 1, '2026-W08');

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});
