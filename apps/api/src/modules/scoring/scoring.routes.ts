import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateScoringRunRequestSchema,
  CreateScoringRunResponseSchema,
  ErrorResponseSchema,
  LatestLeadDeterministicScoreResponseSchema,
  LatestLeadFeatureSnapshotResponseSchema,
  LatestLeadScoreResponseSchema,
  LatestLeadScoreQuerySchema,
  LeadIdParamsSchema,
  ListScorePredictionsQuerySchema,
  ListScorePredictionsResponseSchema,
  ScoringRunIdParamsSchema,
  ScoringRunStatusResponseSchema,
} from '@lead-flood/contracts';

import { ScoringNotImplementedError } from './scoring.errors.js';
import { PrismaScoringRepository } from './scoring.repository.js';
import {
  buildScoringService,
  type ScoringRunJobPayload,
} from './scoring.service.js';

export interface ScoringRouteDependencies {
  enqueueScoringRun?: ((payload: ScoringRunJobPayload) => Promise<void>) | undefined;
}

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof ScoringNotImplementedError) {
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

export function registerScoringRoutes(
  app: FastifyInstance,
  dependencies?: ScoringRouteDependencies,
): void {
  const repository = new PrismaScoringRepository();
  const service = buildScoringService(repository, {
    enqueueScoringRun: dependencies?.enqueueScoringRun
      ? dependencies.enqueueScoringRun
      : async () => {
          throw new ScoringNotImplementedError('Scoring queue publisher is not configured');
        },
  });

  app.post('/v1/scoring/runs', async (request, reply) => {
    const parsed = CreateScoringRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid scoring run payload');
    }

    try {
      const result = await service.createScoringRun(parsed.data);
      return CreateScoringRunResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/scoring/runs/:runId', async (request, reply) => {
    const parsedParams = ScoringRunIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid scoring run id');
    }

    try {
      const result = await service.getScoringRunStatus(parsedParams.data.runId);
      return ScoringRunStatusResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/scoring/predictions', async (request, reply) => {
    const parsedQuery = ListScorePredictionsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid score predictions query');
    }

    try {
      const result = await service.listScorePredictions(parsedQuery.data);
      return ListScorePredictionsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/scoring/leads/:leadId/latest', async (request, reply) => {
    const parsedParams = LeadIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid lead id');
    }
    const parsedQuery = LatestLeadScoreQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid scoring query');
    }

    try {
      const result = await service.getLatestLeadScore(parsedParams.data.leadId, parsedQuery.data);
      return LatestLeadScoreResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/scoring/leads/:leadId/latest-feature-snapshot', async (request, reply) => {
    const parsedParams = LeadIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid lead id');
    }
    const parsedQuery = LatestLeadScoreQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid scoring query');
    }

    try {
      const result = await service.getLatestLeadFeatureSnapshot(
        parsedParams.data.leadId,
        parsedQuery.data,
      );
      return LatestLeadFeatureSnapshotResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/scoring/leads/:leadId/latest-deterministic', async (request, reply) => {
    const parsedParams = LeadIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid lead id');
    }
    const parsedQuery = LatestLeadScoreQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid scoring query');
    }

    try {
      const result = await service.getLatestLeadDeterministicScore(
        parsedParams.data.leadId,
        parsedQuery.data,
      );
      return LatestLeadDeterministicScoreResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
