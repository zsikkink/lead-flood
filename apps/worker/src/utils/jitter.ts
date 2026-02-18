const HOURS_MS = 60 * 60 * 1000;

/**
 * Compute next follow-up time: 72h base + random jitter (-12h to +24h).
 * Effective range: 60h to 96h (2.5 to 4 days).
 */
export function computeNextFollowUpAfter(from: Date = new Date()): Date {
  const baseMs = 72 * HOURS_MS;
  const jitterRangeMs = 36 * HOURS_MS; // -12h to +24h = 36h range
  const jitterOffsetMs = -12 * HOURS_MS;
  const jitterMs = jitterOffsetMs + Math.random() * jitterRangeMs;

  return new Date(from.getTime() + baseMs + jitterMs);
}

/**
 * Compute OOO follow-up: 7 days base + random jitter (-12h to +24h).
 * Effective range: 156h to 192h (6.5 to 8 days).
 */
export function computeOooFollowUpAfter(from: Date = new Date()): Date {
  const baseMs = 168 * HOURS_MS; // 7 days
  const jitterRangeMs = 36 * HOURS_MS;
  const jitterOffsetMs = -12 * HOURS_MS;
  const jitterMs = jitterOffsetMs + Math.random() * jitterRangeMs;

  return new Date(from.getTime() + baseMs + jitterMs);
}
