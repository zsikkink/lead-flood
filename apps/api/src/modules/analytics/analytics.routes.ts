import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ErrorResponseSchema,
  FunnelQuerySchema,
  FunnelResponseSchema,
  ModelMetricsQuerySchema,
  ModelMetricsResponseSchema,
  RecomputeRollupRequestSchema,
  RetrainStatusQuerySchema,
  RetrainStatusResponseSchema,
  ScoreDistributionQuerySchema,
  ScoreDistributionResponseSchema,
} from '@lead-flood/contracts';

import { AnalyticsNotImplementedError } from './analytics.errors.js';
import { PrismaAnalyticsRepository } from './analytics.repository.js';
import { buildAnalyticsService, type AnalyticsRollupJobPayload } from './analytics.service.js';

export interface AnalyticsRouteDependencies {
  enqueueAnalyticsRollup?: ((payload: AnalyticsRollupJobPayload) => Promise<void>) | undefined;
}

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof AnalyticsNotImplementedError) {
    reply.status(501).send(
      ErrorResponseSchema.parse({
        error: error.message,
        requestId: request.id,
      }),
    );
    return true;
  }

  return false;
}

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  dependencies?: AnalyticsRouteDependencies,
): void {
  const repository = new PrismaAnalyticsRepository();
  const service = buildAnalyticsService(repository, {
    enqueueAnalyticsRollup: dependencies?.enqueueAnalyticsRollup,
  });

  app.get('/v1/analytics/funnel', async (request, reply) => {
    const parsedQuery = FunnelQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid funnel query');
    }

    try {
      const result = await service.getFunnel(parsedQuery.data);
      return FunnelResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/analytics/score-distribution', async (request, reply) => {
    const parsedQuery = ScoreDistributionQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid score distribution query');
    }

    try {
      const result = await service.getScoreDistribution(parsedQuery.data);
      return ScoreDistributionResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/analytics/model-metrics', async (request, reply) => {
    const parsedQuery = ModelMetricsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid model metrics query');
    }

    try {
      const result = await service.getModelMetrics(parsedQuery.data);
      return ModelMetricsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/analytics/retrain-status', async (request, reply) => {
    const parsedQuery = RetrainStatusQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid retrain status query');
    }

    try {
      const result = await service.getRetrainStatus(parsedQuery.data);
      return RetrainStatusResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/analytics/rollups/recompute', async (request, reply) => {
    const parsedBody = RecomputeRollupRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid rollup recompute payload');
    }

    try {
      await service.recomputeRollup(parsedBody.data);
      reply.status(202).send();
      return;
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
