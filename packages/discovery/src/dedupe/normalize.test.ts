import { describe, expect, it } from 'vitest';

import { normalizeCity, normalizeCountrySynonyms, normalizeQuery } from './normalize.js';

describe('normalizeQuery', () => {
  it('normalizes casing and whitespace', () => {
    expect(normalizeQuery('  Best   Restaurants   Dubai  ')).toBe('best restaurants dubai');
  });
});

describe('normalizeCountrySynonyms', () => {
  it('maps country synonyms to canonical codes', () => {
    expect(normalizeCountrySynonyms('ksa')).toBe('SA');
    expect(normalizeCountrySynonyms('Saudi Arabia')).toBe('SA');
    expect(normalizeCountrySynonyms('UAE')).toBe('AE');
    expect(normalizeCountrySynonyms('Jordan')).toBe('JO');
    expect(normalizeCountrySynonyms('Egypt')).toBe('EG');
  });
});

describe('normalizeCity', () => {
  it('normalizes city names', () => {
    expect(normalizeCity('  Riyadh  ')).toBe('riyadh');
    expect(normalizeCity('')).toBeNull();
  });
});
