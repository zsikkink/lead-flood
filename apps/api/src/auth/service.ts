import { randomUUID } from 'node:crypto';

import type { LoginRequest, LoginResponse } from '@lead-flood/contracts';

import { signJwt } from './jwt.js';
import { verifyPassword } from './password.js';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface AuthenticateUserDependencies {
  findUserByEmail: (email: string) => Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string | null;
    isActive: boolean;
  } | null>;
  createSession: (input: { sessionId: string; userId: string; refreshToken: string; expiresAt: Date }) => Promise<void>;
  accessTokenSecret: string;
  refreshTokenSecret: string;
}

export function buildAuthenticateUser(deps: AuthenticateUserDependencies) {
  return async function authenticateUser(input: LoginRequest): Promise<LoginResponse | null> {
    const user = await deps.findUserByEmail(input.email);

    if (!user || !user.isActive || !user.passwordHash) {
      return null;
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sessionId = randomUUID();
    const accessTokenExp = nowSeconds + ACCESS_TOKEN_TTL_SECONDS;
    const refreshTokenExp = nowSeconds + REFRESH_TOKEN_TTL_SECONDS;

    const accessToken = signJwt(
      {
        sub: user.id,
        sid: sessionId,
        type: 'access',
        iat: nowSeconds,
        exp: accessTokenExp,
      },
      deps.accessTokenSecret,
    );

    const refreshToken = signJwt(
      {
        sub: user.id,
        sid: sessionId,
        type: 'refresh',
        iat: nowSeconds,
        exp: refreshTokenExp,
      },
      deps.refreshTokenSecret,
    );

    await deps.createSession({
      sessionId,
      userId: user.id,
      refreshToken,
      expiresAt: new Date(refreshTokenExp * 1000),
    });

    return {
      tokenType: 'Bearer',
      accessToken,
      refreshToken,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  };
}
