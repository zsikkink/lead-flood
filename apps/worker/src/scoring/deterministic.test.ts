import { describe, expect, it } from 'vitest';

import {
  evaluateDeterministicScore,
  toScoreBand,
  type DeterministicRule,
} from './deterministic.js';

describe('deterministic scoring', () => {
  it('forces score to zero when a hard filter fails', () => {
    const result = evaluateDeterministicScore(
      [
        {
          id: 'rule-country-hard',
          name: 'Country must be supported',
          ruleType: 'HARD_FILTER',
          isRequired: true,
          fieldKey: 'country',
          operator: 'IN',
          valueJson: ['UAE', 'KSA', 'Jordan', 'Egypt'],
          weight: null,
          isActive: true,
          orderIndex: 1,
          priority: 1,
        },
        {
          id: 'rule-weighted-1',
          name: 'Has WhatsApp',
          ruleType: 'HARD_FILTER',
          isRequired: true,
          fieldKey: 'has_whatsapp',
          operator: 'EQ',
          valueJson: true,
          weight: 3,
          isActive: true,
          orderIndex: 2,
          priority: 2,
        },
      ],
      {
        country: 'France',
        has_whatsapp: true,
      },
    );

    expect(result.hardFilterPassed).toBe(false);
    expect(result.qualificationScore).toBe(0);
    expect(result.reasonCodes).toContain('HARD_FILTER_FAILED');
    expect(result.reasonCodes).toContain('HARD_FILTER_FAILED_COUNTRY');
  });

  it('keeps weak in-region leads non-zero and rewards stronger fit', () => {
    const rules: DeterministicRule[] = [
      {
        id: 'rule-country-hard',
        name: 'Country must match',
        ruleType: 'HARD_FILTER',
        fieldKey: 'country',
        operator: 'IN',
        valueJson: ['UAE', 'KSA', 'Jordan', 'Egypt'],
        weight: null,
        isActive: true,
        orderIndex: 1,
        priority: 1,
      },
      {
        id: 'rule-weighted-2',
        name: 'Has Instagram',
        ruleType: 'WEIGHTED',
        fieldKey: 'has_instagram',
        operator: 'EQ',
        valueJson: true,
        weight: 2,
        isActive: true,
        orderIndex: 2,
        priority: 2,
      },
      {
        id: 'rule-weighted-3',
        name: 'Review count > 50',
        ruleType: 'WEIGHTED',
        fieldKey: 'review_count',
        operator: 'GT',
        valueJson: 50,
        weight: 2,
        isActive: true,
        orderIndex: 3,
        priority: 3,
      },
    ];

    const weakResult = evaluateDeterministicScore(rules, {
      country: 'UAE',
      has_instagram: false,
      review_count: 5,
    });
    const strongResult = evaluateDeterministicScore(rules, {
      country: 'UAE',
      has_instagram: true,
      review_count: 60,
    });

    expect(weakResult.hardFilterPassed).toBe(true);
    expect(weakResult.qualificationScore).toBeGreaterThan(0);
    expect(weakResult.qualificationScore).toBeLessThan(0.5);

    expect(strongResult.hardFilterPassed).toBe(true);
    expect(strongResult.qualificationScore).toBeGreaterThan(weakResult.qualificationScore);
    expect(strongResult.reasonCodes).toContain('HIGH_WEIGHTED_MATCH');
    expect(strongResult.ruleMatchCount).toBe(3);
  });

  it('applies negative weights without hard-zeroing when country passes', () => {
    const base = evaluateDeterministicScore(
      [
        {
          id: 'rule-country-hard',
          name: 'Country must match',
          ruleType: 'HARD_FILTER',
          fieldKey: 'country',
          operator: 'IN',
          valueJson: ['UAE', 'KSA', 'Jordan', 'Egypt'],
          weight: null,
          isActive: true,
          orderIndex: 1,
          priority: 1,
        },
        {
          id: 'rule-fit',
          name: 'Accepts online payments',
          ruleType: 'WEIGHTED',
          fieldKey: 'accepts_online_payments',
          operator: 'EQ',
          valueJson: true,
          weight: 3,
          isActive: true,
          orderIndex: 2,
          priority: 2,
        },
      ],
      {
        country: 'UAE',
        accepts_online_payments: true,
      },
    );

    const withAntiFit = evaluateDeterministicScore(
      [
        {
          id: 'rule-country-hard',
          name: 'Country must match',
          ruleType: 'HARD_FILTER',
          fieldKey: 'country',
          operator: 'IN',
          valueJson: ['UAE', 'KSA', 'Jordan', 'Egypt'],
          weight: null,
          isActive: true,
          orderIndex: 1,
          priority: 1,
        },
        {
          id: 'rule-fit',
          name: 'Accepts online payments',
          ruleType: 'WEIGHTED',
          fieldKey: 'accepts_online_payments',
          operator: 'EQ',
          valueJson: true,
          weight: 3,
          isActive: true,
          orderIndex: 2,
          priority: 2,
        },
        {
          id: 'rule-anti-fit',
          name: 'Pure self-serve ecommerce',
          ruleType: 'WEIGHTED',
          fieldKey: 'pure_self_serve_ecom',
          operator: 'EQ',
          valueJson: true,
          weight: -3,
          isActive: true,
          orderIndex: 3,
          priority: 3,
        },
      ],
      {
        country: 'UAE',
        accepts_online_payments: true,
        pure_self_serve_ecom: true,
      },
    );

    expect(withAntiFit.hardFilterPassed).toBe(true);
    expect(withAntiFit.qualificationScore).toBeGreaterThan(0);
    expect(withAntiFit.qualificationScore).toBeLessThan(base.qualificationScore);
  });

  it('maps score bands deterministically', () => {
    expect(toScoreBand(0.1)).toBe('LOW');
    expect(toScoreBand(0.5)).toBe('MEDIUM');
    expect(toScoreBand(0.9)).toBe('HIGH');
  });
});
