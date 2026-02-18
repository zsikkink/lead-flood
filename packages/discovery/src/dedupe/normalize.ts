import type { DiscoveryCountryCode } from '../providers/types.js';

const COUNTRY_SYNONYMS: Record<string, DiscoveryCountryCode> = {
  JO: 'JO',
  JORDAN: 'JO',
  SA: 'SA',
  KSA: 'SA',
  'SAUDI ARABIA': 'SA',
  AE: 'AE',
  UAE: 'AE',
  'UNITED ARAB EMIRATES': 'AE',
  EG: 'EG',
  EGYPT: 'EG',
};

export function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeCountrySynonyms(value: string): DiscoveryCountryCode | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, ' ');
  return COUNTRY_SYNONYMS[normalized] ?? null;
}

export function normalizeCity(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = normalizeQuery(value);
  return normalized.length > 0 ? normalized : null;
}
