import type { DiscoveryCountryCode } from '../providers/types.js';

const COUNTRY_DIALING_CODE: Record<DiscoveryCountryCode, string> = {
  JO: '962',
  SA: '966',
  AE: '971',
  EG: '20',
};

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function validateE164Candidate(value: string): string | null {
  if (!value.startsWith('+')) {
    return null;
  }
  const digits = value.slice(1);
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return `+${digits}`;
}

export function normalizePhoneE164(
  value: string | null | undefined,
  countryCode: DiscoveryCountryCode | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedCountry =
    countryCode && countryCode in COUNTRY_DIALING_CODE ? countryCode : null;
  const countryDialingCode = normalizedCountry ? COUNTRY_DIALING_CODE[normalizedCountry] : null;

  if (trimmed.startsWith('+')) {
    let digits = normalizeDigits(trimmed.slice(1));
    if (!digits) {
      return null;
    }

    if (countryDialingCode && digits.startsWith('0')) {
      digits = `${countryDialingCode}${digits.slice(1)}`;
    }

    return validateE164Candidate(`+${digits}`);
  }

  let digits = normalizeDigits(trimmed);
  if (!digits) {
    return null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return validateE164Candidate(`+${digits}`);
  }

  if (countryDialingCode) {
    if (digits.startsWith(countryDialingCode)) {
      return validateE164Candidate(`+${digits}`);
    }

    if (digits.startsWith('0')) {
      return validateE164Candidate(`+${countryDialingCode}${digits.slice(1)}`);
    }

    return validateE164Candidate(`+${countryDialingCode}${digits}`);
  }

  return validateE164Candidate(`+${digits}`);
}
