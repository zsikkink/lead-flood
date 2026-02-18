import { describe, expect, it } from 'vitest';

import {
  computeFeatureVectorHash,
  FEATURE_KEYS,
  stableStringify,
  toEmployeeSizeBucket,
} from './features.compute.job.js';

describe('features.compute helpers', () => {
  it('stableStringify keeps deterministic object order', () => {
    const first = stableStringify({
      b: 2,
      a: 1,
      nested: {
        z: true,
        x: false,
      },
    });

    const second = stableStringify({
      nested: {
        x: false,
        z: true,
      },
      a: 1,
      b: 2,
    });

    expect(first).toBe(second);
  });

  it('computeFeatureVectorHash is stable across key order variations', () => {
    const firstHash = computeFeatureVectorHash({
      source_provider: 'BRAVE_SEARCH',
      has_email: true,
      has_domain: true,
    });
    const secondHash = computeFeatureVectorHash({
      has_domain: true,
      has_email: true,
      source_provider: 'BRAVE_SEARCH',
    });

    expect(firstHash).toBe(secondHash);
  });

  it('maps employee size bucket consistently', () => {
    expect(toEmployeeSizeBucket(null)).toBe('unknown');
    expect(toEmployeeSizeBucket(5)).toBe('micro');
    expect(toEmployeeSizeBucket(20)).toBe('small');
    expect(toEmployeeSizeBucket(100)).toBe('medium');
    expect(toEmployeeSizeBucket(600)).toBe('large');
    expect(toEmployeeSizeBucket(5000)).toBe('enterprise');
  });

  it('exposes the required feature keys', () => {
    expect(FEATURE_KEYS).toEqual([
      'source_provider',
      'has_email',
      'has_domain',
      'has_company_name',
      'country',
      'industry',
      'industry_supported',
      'has_whatsapp',
      'has_instagram',
      'accepts_online_payments',
      'review_count',
      'follower_count',
      'physical_address_present',
      'physical_location',
      'physical_store_present',
      'recent_activity',
      'custom_order_signals',
      'pure_self_serve_ecom',
      'shopify_detected',
      'abandonment_signal_detected',
      'multi_staff_detected',
      'follower_growth_signal',
      'high_engagement_signal',
      'has_booking_or_contact_form',
      'variable_pricing_detected',
      'industry_match',
      'industry_match_reason',
      'geo_match',
      'geo_match_reason',
      'employee_size_bucket',
      'enrichment_success_rate',
      'discovery_attempt_count',
      'enrichment_attempt_count',
      'days_since_discovery',
      'rule_match_count',
      'hard_filter_passed',
    ]);
  });
});
