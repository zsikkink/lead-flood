import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HASH_ALGORITHM = 'scrypt';
const HASH_N = 16384;
const HASH_R = 8;
const HASH_P = 1;
const HASH_KEYLEN = 64;

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, HASH_KEYLEN, {
    N: HASH_N,
    r: HASH_R,
    p: HASH_P,
  });

  return [
    HASH_ALGORITHM,
    HASH_N.toString(),
    HASH_R.toString(),
    HASH_P.toString(),
    salt,
    derived.toString('base64url'),
  ].join('$');
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split('$');
  if (parts.length !== 6) {
    return false;
  }

  const [algorithm, nRaw, rRaw, pRaw, salt, hashRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algorithm !== HASH_ALGORITHM) {
    return false;
  }

  const n = parsePositiveInt(nRaw);
  const r = parsePositiveInt(rRaw);
  const p = parsePositiveInt(pRaw);
  if (!n || !r || !p || !salt || !hashRaw) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(hashRaw, 'base64url');
  } catch {
    return false;
  }

  if (expected.length === 0) {
    return false;
  }

  const actual = scryptSync(password, salt, expected.length, {
    N: n,
    r,
    p,
  });

  return timingSafeEqual(actual, expected);
}
