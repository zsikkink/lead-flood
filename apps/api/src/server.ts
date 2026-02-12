import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import {
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  ErrorResponseSchema,
  GetJobStatusResponseSchema,
  GetLeadResponseSchema,
  HealthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  type CreateLeadRequest,
  type JobStatus,
  type LeadStatus,
  ReadyResponseSchema,
} from '@lead-flood/contracts';

import type { ApiEnv } from './env.js';

export class LeadAlreadyExistsError extends Error {
  constructor(message = 'Lead already exists') {
    super(message);
    this.name = 'LeadAlreadyExistsError';
  }
}

export interface LeadRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  source: string;
  status: LeadStatus;
  enrichmentData: unknown | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  leadId: string | null;
  result: unknown | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}

export interface BuildServerOptions {
  env: ApiEnv;
  logger: FastifyBaseLogger;
  checkDatabaseHealth: () => Promise<boolean>;
  createLeadAndEnqueue: (input: CreateLeadRequest) => Promise<{ leadId: string; jobId: string }>;
  getLeadById: (leadId: string) => Promise<LeadRecord | null>;
  getJobById: (jobId: string) => Promise<JobRecord | null>;
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

  app.post('/v1/leads', async (request, reply) => {
    const parsedRequest = CreateLeadRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      reply.status(400);
      return ErrorResponseSchema.parse({
        error: 'Invalid lead payload',
        requestId: request.id,
      });
    }

    try {
      const created = await options.createLeadAndEnqueue(parsedRequest.data);
      return CreateLeadResponseSchema.parse(created);
    } catch (error: unknown) {
      if (error instanceof LeadAlreadyExistsError) {
        reply.status(409);
        return ErrorResponseSchema.parse({
          error: error.message,
          requestId: request.id,
        });
      }

      throw error;
    }
  });

  app.get('/v1/leads/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const leadId = params.id;

    if (!leadId) {
      reply.status(400);
      return ErrorResponseSchema.parse({
        error: 'Lead id is required',
        requestId: request.id,
      });
    }

    const lead = await options.getLeadById(leadId);

    if (!lead) {
      reply.status(404);
      return ErrorResponseSchema.parse({
        error: 'Lead not found',
        requestId: request.id,
      });
    }

    return GetLeadResponseSchema.parse({
      ...lead,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    });
  });

  app.get('/v1/jobs/:id', async (request, reply) => {
    const params = request.params as { id?: string };
    const jobId = params.id;

    if (!jobId) {
      reply.status(400);
      return ErrorResponseSchema.parse({
        error: 'Job id is required',
        requestId: request.id,
      });
    }

    const job = await options.getJobById(jobId);

    if (!job) {
      reply.status(404);
      return ErrorResponseSchema.parse({
        error: 'Job not found',
        requestId: request.id,
      });
    }

    return GetJobStatusResponseSchema.parse({
      ...job,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      updatedAt: job.updatedAt.toISOString(),
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
