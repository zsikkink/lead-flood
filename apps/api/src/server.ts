import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ErrorResponseSchema, HealthResponseSchema, ReadyResponseSchema } from '@lead-onslaught/contracts';

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
  });

  app.register(cors, {
    origin: options.env.CORS_ORIGIN,
    credentials: true,
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
