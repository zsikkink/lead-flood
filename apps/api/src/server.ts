import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  ErrorResponseSchema,
  HealthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  ReadyResponseSchema,
} from '@lead-onslaught/contracts';

import type { ApiEnv } from './env.js';

export interface BuildServerOptions {
  env: ApiEnv;
  logger: FastifyBaseLogger;
  checkDatabaseHealth: () => Promise<boolean>;
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
    loggerInstance: options.logger,
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  app.register(cors, {
    origin: options.env.CORS_ORIGIN,
    credentials: true,
  });

  app.addHook('onSend', (request, reply, payload, done) => {
    reply.header('x-request-id', request.id);
    done(null, payload);
  });

  app.get('/health', async () => {
    return HealthResponseSchema.parse({ status: 'ok' });
  });

  app.get('/ready', async (_request, reply) => {
    const databaseReady = await options.checkDatabaseHealth();

    if (!databaseReady) {
      reply.status(503);
      return ReadyResponseSchema.parse({ status: 'not_ready', db: 'fail' });
    }

    return ReadyResponseSchema.parse({ status: 'ready', db: 'ok' });
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const parsedRequest = LoginRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      reply.status(400);
      return ErrorResponseSchema.parse({
        error: 'Invalid login payload',
        requestId: request.id,
      });
    }

    return LoginResponseSchema.parse({
      tokenType: 'Bearer',
      accessToken: 'dev-access-token',
      refreshToken: 'dev-refresh-token',
      expiresInSeconds: 3600,
      user: {
        id: 'dev-user',
        email: parsedRequest.data.email,
        firstName: 'Demo',
        lastName: 'User',
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(
      ErrorResponseSchema.parse({
        error: 'Route not found',
        requestId: request.id,
      }),
    );
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled API error');

    if (!reply.sent) {
      reply.status(500).send(
        ErrorResponseSchema.parse({
          error: 'Internal server error',
          requestId: request.id,
        }),
      );
    }
  });

  return app;
}
