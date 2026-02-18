import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { AuthUser, VerifyAccessToken } from './guard.js';

export interface SupabaseJwtVerifierOptions {
  issuer: string;
  audience: string;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function deriveNames(payload: JWTPayload): Pick<AuthUser, 'firstName' | 'lastName'> {
  const rawMetadata = payload.user_metadata;
  const metadata =
    rawMetadata && typeof rawMetadata === 'object'
      ? (rawMetadata as Record<string, unknown>)
      : null;

  const fullName = readString(metadata?.full_name ?? metadata?.name);
  const firstNameFromMetadata = readString(metadata?.first_name);
  const lastNameFromMetadata = readString(metadata?.last_name);

  if (firstNameFromMetadata || lastNameFromMetadata) {
    return {
      firstName: firstNameFromMetadata,
      lastName: lastNameFromMetadata,
    };
  }

  if (fullName) {
    const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);
    return {
      firstName: first ?? null,
      lastName: rest.length > 0 ? rest.join(' ') : null,
    };
  }

  return {
    firstName: null,
    lastName: null,
  };
}

export function buildSupabaseAccessTokenVerifier(
  options: SupabaseJwtVerifierOptions,
): VerifyAccessToken {
  const issuer = options.issuer.replace(/\/+$/, '');
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return async (token: string): Promise<AuthUser | null> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: options.audience,
      });

      const sub = readString(payload.sub);
      if (!sub) {
        return null;
      }

      const email = readString(payload.email);
      const { firstName, lastName } = deriveNames(payload);

      return {
        sub,
        email,
        firstName,
        lastName,
      };
    } catch {
      return null;
    }
  };
}
