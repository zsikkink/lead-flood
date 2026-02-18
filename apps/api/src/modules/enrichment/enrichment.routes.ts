import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateEnrichmentRunRequestSchema,
  CreateEnrichmentRunResponseSchema,
  EnrichmentRunIdParamsSchema,
  EnrichmentRunStatusResponseSchema,
  ErrorResponseSchema,
  ListEnrichmentRecordsQuerySchema,
  ListEnrichmentRecordsResponseSchema,
} from '@lead-flood/contracts';

import { EnrichmentNotImplementedError } from './enrichment.errors.js';
import { PrismaEnrichmentRepository } from './enrichment.repository.js';
import {
  buildEnrichmentService,
  type EnrichmentRunJobPayload,
} from './enrichment.service.js';

export interface EnrichmentRouteDependencies {
  enqueueEnrichmentRun?: ((payload: EnrichmentRunJobPayload) => Promise<void>) | undefined;
}

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof EnrichmentNotImplementedError) {
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

export function registerEnrichmentRoutes(
  app: FastifyInstance,
  dependencies?: EnrichmentRouteDependencies,
): void {
  const repository = new PrismaEnrichmentRepository();
  const service = buildEnrichmentService(repository, {
    enqueueEnrichmentRun: dependencies?.enqueueEnrichmentRun
      ? dependencies.enqueueEnrichmentRun
      : async () => {
          throw new EnrichmentNotImplementedError('Enrichment queue publisher is not configured');
        },
  });

  app.post('/v1/enrichment/runs', async (request, reply) => {
    const parsed = CreateEnrichmentRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid enrichment run payload');
    }

    try {
      const result = await service.createEnrichmentRun(parsed.data);
      return CreateEnrichmentRunResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/enrichment/runs/:runId', async (request, reply) => {
    const parsedParams = EnrichmentRunIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid enrichment run id');
    }

    try {
      const result = await service.getEnrichmentRunStatus(parsedParams.data.runId);
      return EnrichmentRunStatusResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/enrichment/records', async (request, reply) => {
    const parsedQuery = ListEnrichmentRecordsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid enrichment records query');
    }

    try {
      const result = await service.listEnrichmentRecords(parsedQuery.data);
      return ListEnrichmentRecordsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
