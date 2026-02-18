import { describe, expect, it } from 'vitest';

import { normalizePhoneE164 } from './phone.js';

describe('normalizePhoneE164', () => {
  it('normalizes JO local phone with trunk prefix', () => {
    expect(normalizePhoneE164('07 9537 4140', 'JO')).toBe('+962795374140');
  });

  it('normalizes JO malformed plus value with leading zero', () => {
    expect(normalizePhoneE164('+0795374140', 'JO')).toBe('+962795374140');
  });

  it('normalizes SA local phone with trunk prefix', () => {
    expect(normalizePhoneE164('0501234567', 'SA')).toBe('+966501234567');
  });

  it('normalizes AE local phone with trunk prefix', () => {
    expect(normalizePhoneE164('055 123 4567', 'AE')).toBe('+971551234567');
  });

  it('normalizes EG local phone with trunk prefix', () => {
    expect(normalizePhoneE164('01012345678', 'EG')).toBe('+201012345678');
  });

  it('handles international format with 00 prefix', () => {
    expect(normalizePhoneE164('00962795374140', 'JO')).toBe('+962795374140');
  });

  it('returns null for invalid values', () => {
    expect(normalizePhoneE164('', 'JO')).toBeNull();
    expect(normalizePhoneE164('abc', 'JO')).toBeNull();
    expect(normalizePhoneE164('123', 'JO')).toBeNull();
  });
});
