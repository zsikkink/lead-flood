import { prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';
import { afterEach, describe, expect, it } from 'vitest';

import { buildAuthenticateUser } from '../../src/auth/service.js';
import { hashPassword } from '../../src/auth/password.js';
import type { ApiEnv } from '../../src/env.js';
import { buildServer } from '../../src/server.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/lead_flood';
process.env.DATABASE_URL = databaseUrl;
const directUrl = process.env.DIRECT_URL ?? databaseUrl;
process.env.DIRECT_URL = directUrl;

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  PG_BOSS_SCHEMA: 'pgboss',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: directUrl,
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

describe('POST /v1/auth/login integration', () => {
  const userEmail = `integration-auth-${Date.now()}@lead-flood.local`;

  afterEach(async () => {
    await prisma.session.deleteMany({
      where: {
        user: {
          email: userEmail,
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: userEmail,
      },
    });
  });

  it('authenticates a stored user and persists refresh session', async () => {
    const password = 'integration-password';
    await prisma.user.create({
      data: {
        email: userEmail,
        firstName: 'Integration',
        lastName: 'User',
        isActive: true,
        passwordHash: hashPassword(password),
      },
    });

    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
      authenticateUser: buildAuthenticateUser({
        findUserByEmail: async (email) => {
          return prisma.user.findUnique({
            where: { email },
          });
        },
        createSession: async ({ sessionId, userId, refreshToken, expiresAt }) => {
          await prisma.session.create({
            data: {
              id: sessionId,
              userId,
              refreshToken,
              expiresAt,
            },
          });
        },
        accessTokenSecret: env.JWT_ACCESS_SECRET,
        refreshTokenSecret: env.JWT_REFRESH_SECRET,
      }),
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      getLeadById: async () => null,
      getJobById: async () => null,
    });

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: userEmail,
        password,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string };
    };
    expect(body.accessToken).not.toBe('dev-access-token');
    expect(body.refreshToken).not.toBe('dev-refresh-token');
    expect(body.user.email).toBe(userEmail);

    const session = await prisma.session.findUnique({
      where: { refreshToken: body.refreshToken },
    });
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(body.user.id);

    await server.close();
  });
});
