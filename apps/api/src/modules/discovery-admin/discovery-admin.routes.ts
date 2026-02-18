import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AdminLeadDetailResponseSchema,
  AdminLeadIdParamsSchema,
  AdminListLeadsQuerySchema,
  AdminListLeadsResponseSchema,
  AdminListSearchTasksQuerySchema,
  AdminListSearchTasksResponseSchema,
  AdminSearchTaskDetailResponseSchema,
  AdminSearchTaskIdParamsSchema,
  ErrorResponseSchema,
  JobRunDetailResponseSchema,
  JobRunIdParamsSchema,
  JobRunListQuerySchema,
  ListJobRunsResponseSchema,
  type RunDiscoverySeedRequest,
  type RunDiscoveryTasksRequest,
  type TriggerJobRunResponse,
  RunDiscoverySeedRequestSchema,
  RunDiscoveryTasksRequestSchema,
  TriggerJobRunResponseSchema,
} from '@lead-flood/contracts';

import {
  DiscoveryAdminNotFoundError,
  DiscoveryAdminNotImplementedError,
} from './discovery-admin.errors.js';
import { PrismaDiscoveryAdminRepository } from './discovery-admin.repository.js';
import { buildDiscoveryAdminService } from './discovery-admin.service.js';

export interface DiscoveryAdminRouteDependencies {
  adminApiKey?: string;
  triggerDiscoverySeedJob?: (input: RunDiscoverySeedRequest) => Promise<TriggerJobRunResponse>;
  triggerDiscoveryTaskRun?: (input: RunDiscoveryTasksRequest) => Promise<TriggerJobRunResponse>;
}

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function requireAdminKey(
  request: FastifyRequest,
  reply: FastifyReply,
  adminApiKey: string | undefined,
): boolean {
  if (!adminApiKey) {
    return true;
  }

  const provided = request.headers['x-admin-key'];
  const candidate = Array.isArray(provided) ? provided[0] : provided;

  if (candidate === adminApiKey) {
    return true;
  }

  reply.status(401).send(
    ErrorResponseSchema.parse({
      error: 'Unauthorized',
      requestId: request.id,
    }),
  );
  return false;
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof DiscoveryAdminNotFoundError) {
    reply.status(404).send(
      ErrorResponseSchema.parse({
        error: error.message,
        requestId: request.id,
      }),
    );
    return true;
  }

  if (error instanceof DiscoveryAdminNotImplementedError) {
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

export function registerDiscoveryAdminRoutes(
  app: FastifyInstance,
  dependencies: DiscoveryAdminRouteDependencies = {},
): void {
  const repository = new PrismaDiscoveryAdminRepository();
  const service = buildDiscoveryAdminService(repository, {
    ...(dependencies.triggerDiscoverySeedJob
      ? { triggerDiscoverySeedJob: dependencies.triggerDiscoverySeedJob }
      : {}),
    ...(dependencies.triggerDiscoveryTaskRun
      ? { triggerDiscoveryTaskRun: dependencies.triggerDiscoveryTaskRun }
      : {}),
  });

  app.get('/v1/admin/leads', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedQuery = AdminListLeadsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid admin leads query');
    }

    try {
      const result = await service.listLeads(parsedQuery.data);
      return AdminListLeadsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/admin/leads/:id', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedParams = AdminLeadIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid lead id');
    }

    try {
      const result = await service.getLeadById(parsedParams.data.id);
      return AdminLeadDetailResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/admin/search-tasks', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedQuery = AdminListSearchTasksQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid search task query');
    }

    try {
      const result = await service.listSearchTasks(parsedQuery.data);
      return AdminListSearchTasksResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/admin/search-tasks/:id', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedParams = AdminSearchTaskIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid search task id');
    }

    try {
      const result = await service.getSearchTaskById(parsedParams.data.id);
      return AdminSearchTaskDetailResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/admin/jobs/discovery/seed', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedBody = RunDiscoverySeedRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid discovery seed payload');
    }

    try {
      const result = await service.triggerDiscoverySeed(parsedBody.data);
      reply.status(202);
      return TriggerJobRunResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/admin/jobs/discovery/run', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedBody = RunDiscoveryTasksRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid discovery run payload');
    }

    try {
      const result = await service.triggerDiscoveryTaskRun(parsedBody.data);
      reply.status(202);
      return TriggerJobRunResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/admin/jobs/runs', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedQuery = JobRunListQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid job runs query');
    }

    try {
      const result = await service.listJobRuns(parsedQuery.data);
      return ListJobRunsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/admin/jobs/runs/:id', async (request, reply) => {
    if (!requireAdminKey(request, reply, dependencies.adminApiKey)) {
      return;
    }

    const parsedParams = JobRunIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid job run id');
    }

    try {
      const result = await service.getJobRunById(parsedParams.data.id);
      return JobRunDetailResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
