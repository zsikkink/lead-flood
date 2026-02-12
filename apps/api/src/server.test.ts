import { createLogger } from '@lead-onslaught/observability';
import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './server.js';
import type { ApiEnv } from './env.js';

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/lead_onslaught',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5434/lead_onslaught',
};

describe('buildServer', () => {
  const servers: Array<ReturnType<typeof buildServer>> = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it('returns health response', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
    });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('returns 404 with typed error body', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
    });
    servers.push(server);

    const response = await server.inject({ method: 'GET', url: '/missing' });
    const body = response.json() as { error: string; requestId?: string };
    const requestIdHeader = response.headers['x-request-id'];

    expect(response.statusCode).toBe(404);
    expect(body.error).toBe('Route not found');
    expect(typeof body.requestId).toBe('string');
    expect(requestIdHeader).toBe(body.requestId);
  });

  it('returns auth login stub response for valid payload', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
    });
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'demo@lead-onslaught.local',
        password: 'password',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      tokenType: 'Bearer',
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
      expiresInSeconds: 3600,
      user: {
        id: 'dev-user',
        email: 'demo@lead-onslaught.local',
        firstName: 'Demo',
        lastName: 'User',
      },
    });
  });

  it('returns 400 for invalid login payload', async () => {
    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
    });
    servers.push(server);

    const response = await server.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'not-an-email',
        password: 'password',
      },
    });
    const body = response.json() as { error: string; requestId?: string };

    expect(response.statusCode).toBe(400);
    expect(body.error).toBe('Invalid login payload');
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });
});
