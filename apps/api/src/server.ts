import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import {
  CreateLeadRequestSchema,
  CreateLeadResponseSchema,
  ErrorResponseSchema,
  GetJobStatusResponseSchema,
  GetLeadResponseSchema,
  HealthResponseSchema,
  ListLeadsQuerySchema,
  ListLeadsResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  type CreateLeadRequest,
  type ListLeadsQuery,
  type ListLeadsResponse,
  type LoginRequest,
  type LoginResponse,
  type JobStatus,
  type LeadStatus,
  ReadyResponseSchema,
} from '@lead-flood/contracts';

import { buildAuthGuard } from './auth/guard.js';
import type { ApiEnv } from './env.js';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes.js';
import { registerDiscoveryRoutes } from './modules/discovery/discovery.routes.js';
import type { DiscoveryRunJobPayload } from './modules/discovery/discovery.service.js';
import { registerEnrichmentRoutes } from './modules/enrichment/enrichment.routes.js';
import { registerFeedbackRoutes } from './modules/feedback/feedback.routes.js';
import { registerIcpRoutes } from './modules/icp/icp.routes.js';
import { registerLearningRoutes } from './modules/learning/learning.routes.js';
import { registerMessagingRoutes } from './modules/messaging/messaging.routes.js';
import { registerScoringRoutes } from './modules/scoring/scoring.routes.js';

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
  accessTokenSecret: string;
  checkDatabaseHealth: () => Promise<boolean>;
  authenticateUser: (input: LoginRequest) => Promise<LoginResponse | null>;
  createLeadAndEnqueue: (input: CreateLeadRequest) => Promise<{ leadId: string; jobId: string }>;
  enqueueDiscoveryRun?: (payload: DiscoveryRunJobPayload) => Promise<void>;
  getLeadById: (leadId: string) => Promise<LeadRecord | null>;
  listLeads: (query: ListLeadsQuery) => Promise<ListLeadsResponse>;
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

  app.decorateRequest('user', null);

  // Public routes - no auth required
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

    const login = await options.authenticateUser(parsedRequest.data);
    if (!login) {
      reply.status(401);
      return ErrorResponseSchema.parse({
        error: 'Invalid email or password',
        requestId: request.id,
      });
    }

    return LoginResponseSchema.parse(login);
  });

  // Protected routes - JWT guard applied to all routes registered in this plugin
  const authGuard = buildAuthGuard(options.accessTokenSecret);

  const protectedRoutes: FastifyPluginAsync = async (api) => {
    api.addHook('onRequest', authGuard);

    api.post('/v1/leads', async (request, reply) => {
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

    api.get('/v1/leads', async (request, reply) => {
      const parsedQuery = ListLeadsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        reply.status(400);
        return ErrorResponseSchema.parse({
          error: 'Invalid lead list query',
          requestId: request.id,
        });
      }

      const result = await options.listLeads(parsedQuery.data);
      return ListLeadsResponseSchema.parse(result);
    });

    api.get('/v1/leads/:id', async (request, reply) => {
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

    api.get('/v1/jobs/:id', async (request, reply) => {
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

    registerIcpRoutes(api);
    if (options.enqueueDiscoveryRun) {
      registerDiscoveryRoutes(api, {
        enqueueDiscoveryRun: options.enqueueDiscoveryRun,
      });
    } else {
      registerDiscoveryRoutes(api);
    }
    registerEnrichmentRoutes(api);
    registerScoringRoutes(api);
    registerMessagingRoutes(api);
    registerLearningRoutes(api);
    registerFeedbackRoutes(api);
    registerAnalyticsRoutes(api);
  };

  app.register(protectedRoutes);

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
