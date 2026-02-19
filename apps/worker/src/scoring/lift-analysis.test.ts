import { describe, expect, it } from 'vitest';

import { adjustDeterministicWeights, computeFactorLift } from './lift-analysis.js';

describe('computeFactorLift', () => {
  it('returns empty array for empty inputs', () => {
    expect(computeFactorLift([], [{ has_email: 1 }])).toEqual([]);
    expect(computeFactorLift([{ has_email: 1 }], [])).toEqual([]);
  });

  it('computes positive lift for features more common in converted', () => {
    const converted = [
      { has_email: 1, review_count: 50 },
      { has_email: 1, review_count: 40 },
    ];
    const nonConverted = [
      { has_email: 0, review_count: 10 },
      { has_email: 0, review_count: 5 },
    ];

    const results = computeFactorLift(converted, nonConverted);
    const emailLift = results.find((r) => r.factor === 'has_email');

    expect(emailLift).toBeDefined();
    expect(emailLift!.lift).toBeGreaterThan(0);
    expect(emailLift!.convertedFreq).toBe(1);
    expect(emailLift!.nonConvertedFreq).toBe(0);
  });

  it('computes negative lift for features less common in converted', () => {
    const converted = [
      { review_count: 5 },
      { review_count: 3 },
    ];
    const nonConverted = [
      { review_count: 50 },
      { review_count: 40 },
    ];

    const results = computeFactorLift(converted, nonConverted);
    const reviewLift = results.find((r) => r.factor === 'review_count');

    expect(reviewLift).toBeDefined();
    expect(reviewLift!.lift).toBeLessThan(0);
  });

  it('sorts by absolute lift descending', () => {
    const converted = [{ a: 100, b: 2 }];
    const nonConverted = [{ a: 1, b: 1 }];

    const results = computeFactorLift(converted, nonConverted);
    expect(results[0]!.factor).toBe('a');
  });

  it('handles boolean values', () => {
    const converted = [{ flag: true }, { flag: true }];
    const nonConverted = [{ flag: false }, { flag: false }];

    const results = computeFactorLift(converted, nonConverted);
    const flagLift = results.find((r) => r.factor === 'flag');
    expect(flagLift).toBeDefined();
    expect(flagLift!.convertedFreq).toBe(1);
    expect(flagLift!.nonConvertedFreq).toBe(0);
  });
});

describe('adjustDeterministicWeights', () => {
  it('increases weights for strong positive lift', () => {
    const weights = { has_email: 10, review_count: 5 };
    const lifts = [
      { factor: 'has_email', convertedFreq: 1, nonConvertedFreq: 0.2, lift: 0.8, sampleSize: 100 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts);
    expect(adjusted.has_email).toBeGreaterThan(10);
  });

  it('decreases weights for strong negative lift', () => {
    const weights = { has_email: 10, review_count: 15 };
    const lifts = [
      { factor: 'review_count', convertedFreq: 5, nonConvertedFreq: 40, lift: -0.5, sampleSize: 100 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts);
    expect(adjusted.review_count).toBeLessThan(15);
  });

  it('respects minWeight and maxWeight bounds', () => {
    const weights = { x: 29, y: 2 };
    const lifts = [
      { factor: 'x', convertedFreq: 100, nonConvertedFreq: 1, lift: 10, sampleSize: 100 },
      { factor: 'y', convertedFreq: 1, nonConvertedFreq: 100, lift: -10, sampleSize: 100 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts);
    expect(adjusted.x).toBeLessThanOrEqual(30);
    expect(adjusted.y).toBeGreaterThanOrEqual(1);
  });

  it('does not change weights for insignificant lift', () => {
    const weights = { has_email: 10 };
    const lifts = [
      { factor: 'has_email', convertedFreq: 0.5, nonConvertedFreq: 0.48, lift: 0.04, sampleSize: 100 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts);
    expect(adjusted.has_email).toBe(10);
  });

  it('ignores factors not in current weights', () => {
    const weights = { has_email: 10 };
    const lifts = [
      { factor: 'unknown_factor', convertedFreq: 1, nonConvertedFreq: 0, lift: 5, sampleSize: 50 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts);
    expect(adjusted.unknown_factor).toBeUndefined();
  });

  it('caps adjustment at maxChangePercent', () => {
    const weights = { x: 20 };
    const lifts = [
      { factor: 'x', convertedFreq: 100, nonConvertedFreq: 1, lift: 99, sampleSize: 100 },
    ];

    const adjusted = adjustDeterministicWeights(weights, lifts, { maxChangePercent: 0.1 });
    // Max increase is 10%, so max new weight is 22
    expect(adjusted.x).toBeLessThanOrEqual(22);
  });
});
