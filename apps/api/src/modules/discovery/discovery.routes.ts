import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateDiscoveryRunRequestSchema,
  CreateDiscoveryRunResponseSchema,
  DiscoveryRunIdParamsSchema,
  DiscoveryRunStatusResponseSchema,
  ErrorResponseSchema,
  ListDiscoveryRecordsQuerySchema,
  ListDiscoveryRecordsResponseSchema,
} from '@lead-flood/contracts';

import { DiscoveryNotImplementedError, DiscoveryRunNotFoundError } from './discovery.errors.js';
import { PrismaDiscoveryRepository } from './discovery.repository.js';
import {
  buildDiscoveryService,
  type DiscoveryRunJobPayload,
} from './discovery.service.js';

export interface DiscoveryRouteDependencies {
  enqueueDiscoveryRun?: (payload: DiscoveryRunJobPayload) => Promise<void>;
}

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof DiscoveryRunNotFoundError) {
    reply.status(404).send(
      ErrorResponseSchema.parse({
        error: error.message,
        requestId: request.id,
      }),
    );
    return true;
  }

  if (error instanceof DiscoveryNotImplementedError) {
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

export function registerDiscoveryRoutes(
  app: FastifyInstance,
  dependencies?: DiscoveryRouteDependencies,
): void {
  const repository = new PrismaDiscoveryRepository();
  const service = buildDiscoveryService(repository, {
    enqueueDiscoveryRun: dependencies?.enqueueDiscoveryRun
      ? dependencies.enqueueDiscoveryRun
      : async () => {
          throw new DiscoveryNotImplementedError('Discovery queue publisher is not configured');
        },
  });

  app.post('/v1/discovery/runs', async (request, reply) => {
    const parsed = CreateDiscoveryRunRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid discovery run payload');
    }

    try {
      const result = await service.createDiscoveryRun(parsed.data);
      return CreateDiscoveryRunResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/discovery/runs/:runId', async (request, reply) => {
    const parsedParams = DiscoveryRunIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid discovery run id');
    }

    try {
      const result = await service.getDiscoveryRunStatus(parsedParams.data.runId);
      return DiscoveryRunStatusResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/discovery/records', async (request, reply) => {
    const parsedQuery = ListDiscoveryRecordsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid discovery records query');
    }

    try {
      const result = await service.listDiscoveryRecords(parsedQuery.data);
      return ListDiscoveryRecordsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
