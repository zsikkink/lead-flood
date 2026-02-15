import { describe, expect, it } from 'vitest';

import { evaluateDeterministicScore, toScoreBand } from './deterministic.js';

describe('deterministic scoring', () => {
  it('forces score to zero when a hard filter fails', () => {
    const result = evaluateDeterministicScore(
      [
        {
          id: 'rule-hard-1',
          name: 'Industry must match',
          ruleType: 'HARD_FILTER',
          fieldKey: 'industry_match',
          operator: 'EQ',
          valueJson: true,
          weight: null,
          isActive: true,
          priority: 1,
        },
        {
          id: 'rule-weighted-1',
          name: 'Has domain',
          ruleType: 'WEIGHTED',
          fieldKey: 'has_domain',
          operator: 'EQ',
          valueJson: true,
          weight: 1,
          isActive: true,
          priority: 2,
        },
      ],
      {
        industry_match: false,
        has_domain: true,
      },
    );

    expect(result.hardFilterPassed).toBe(false);
    expect(result.qualificationScore).toBe(0);
    expect(result.reasonCodes).toContain('HARD_FILTER_FAILED');
    expect(result.reasonCodes).toContain('HARD_FILTER_FAILED_INDUSTRY_MATCH');
  });

  it('normalizes weighted score between zero and one', () => {
    const result = evaluateDeterministicScore(
      [
        {
          id: 'rule-hard-1',
          name: 'Hard pass',
          ruleType: 'HARD_FILTER',
          fieldKey: 'hard_filter_passed',
          operator: 'EQ',
          valueJson: true,
          weight: null,
          isActive: true,
          priority: 1,
        },
        {
          id: 'rule-weighted-1',
          name: 'Industry match',
          ruleType: 'WEIGHTED',
          fieldKey: 'industry_match',
          operator: 'EQ',
          valueJson: true,
          weight: 0.7,
          isActive: true,
          priority: 2,
        },
        {
          id: 'rule-weighted-2',
          name: 'Geo match',
          ruleType: 'WEIGHTED',
          fieldKey: 'geo_match',
          operator: 'EQ',
          valueJson: true,
          weight: 0.3,
          isActive: true,
          priority: 3,
        },
      ],
      {
        hard_filter_passed: true,
        industry_match: true,
        geo_match: false,
      },
    );

    expect(result.hardFilterPassed).toBe(true);
    expect(result.qualificationScore).toBeCloseTo(0.7, 6);
    expect(result.reasonCodes).toContain('MEDIUM_WEIGHTED_MATCH');
    expect(result.ruleMatchCount).toBe(2);
  });

  it('maps score bands deterministically', () => {
    expect(toScoreBand(0.1)).toBe('LOW');
    expect(toScoreBand(0.5)).toBe('MEDIUM');
    expect(toScoreBand(0.9)).toBe('HIGH');
  });
});
