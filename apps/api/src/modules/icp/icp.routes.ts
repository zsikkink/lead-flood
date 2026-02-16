import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateIcpProfileRequestSchema,
  CreateQualificationRuleRequestSchema,
  ErrorResponseSchema,
  IcpDebugSampleParamsSchema,
  IcpDebugSampleQuerySchema,
  IcpDebugSampleResponseSchema,
  IcpIdParamsSchema,
  IcpProfileResponseSchema,
  IcpRuleParamsSchema,
  IcpStatusResponseSchema,
  ListIcpProfilesQuerySchema,
  ListIcpProfilesResponseSchema,
  ListIcpRulesResponseSchema,
  QualificationRuleResponseSchema,
  ReplaceIcpRulesRequestSchema,
  UpdateIcpProfileRequestSchema,
  UpdateQualificationRuleRequestSchema,
} from '@lead-flood/contracts';

import { IcpNotFoundError, IcpNotImplementedError } from './icp.errors.js';
import { PrismaIcpRepository } from './icp.repository.js';
import { buildIcpService } from './icp.service.js';

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof IcpNotImplementedError) {
    reply.status(501).send(
      ErrorResponseSchema.parse({
        error: error.message,
        requestId: request.id,
      }),
    );
    return true;
  }

  if (error instanceof IcpNotFoundError) {
    reply.status(404).send(
      ErrorResponseSchema.parse({
        error: error.message,
        requestId: request.id,
      }),
    );
    return true;
  }

  return false;
}

export function registerIcpRoutes(app: FastifyInstance): void {
  const repository = new PrismaIcpRepository();
  const service = buildIcpService(repository);

  app.post('/v1/icps', async (request, reply) => {
    const parsed = CreateIcpProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP create payload');
    }

    try {
      const result = await service.createIcpProfile(parsed.data);
      return IcpProfileResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/icps', async (request, reply) => {
    const parsed = ListIcpProfilesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP list query');
    }

    try {
      const result = await service.listIcpProfiles(parsed.data);
      return ListIcpProfilesResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/icps/:icpId', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    try {
      const result = await service.getIcpProfile(parsedParams.data.icpId);
      return IcpProfileResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.patch('/v1/icps/:icpId', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    const parsedBody = UpdateIcpProfileRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP update payload');
    }

    try {
      const result = await service.updateIcpProfile(parsedParams.data.icpId, parsedBody.data);
      return IcpProfileResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.delete('/v1/icps/:icpId', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    try {
      await service.deleteIcpProfile(parsedParams.data.icpId);
      reply.status(204);
      return;
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/icps/:icpId/rules', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    const parsedBody = CreateQualificationRuleRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid qualification rule payload');
    }

    try {
      const result = await service.createQualificationRule(parsedParams.data.icpId, parsedBody.data);
      return QualificationRuleResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/icps/:icpId/rules', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    try {
      const result = await service.listIcpRules(parsedParams.data.icpId);
      return ListIcpRulesResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.put('/v1/icps/:icpId/rules', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    const parsedBody = ReplaceIcpRulesRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP rules payload');
    }

    try {
      const result = await service.replaceIcpRules(parsedParams.data.icpId, parsedBody.data);
      return ListIcpRulesResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.patch('/v1/icps/:icpId/rules/:ruleId', async (request, reply) => {
    const parsedParams = IcpRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP rule params');
    }

    const parsedBody = UpdateQualificationRuleRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid qualification rule update payload');
    }

    try {
      const result = await service.updateQualificationRule(
        parsedParams.data.icpId,
        parsedParams.data.ruleId,
        parsedBody.data,
      );
      return QualificationRuleResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.delete('/v1/icps/:icpId/rules/:ruleId', async (request, reply) => {
    const parsedParams = IcpRuleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP rule params');
    }

    try {
      await service.deleteQualificationRule(parsedParams.data.icpId, parsedParams.data.ruleId);
      reply.status(204);
      return;
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/icps/:icpId/status', async (request, reply) => {
    const parsedParams = IcpIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP id');
    }

    try {
      const result = await service.getIcpStatus(parsedParams.data.icpId);
      return IcpStatusResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/icp/:icpProfileId/debug-sample', async (request, reply) => {
    const parsedParams = IcpDebugSampleParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP debug params');
    }

    const parsedQuery = IcpDebugSampleQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid ICP debug query');
    }

    try {
      const result = await service.getIcpDebugSample(
        parsedParams.data.icpProfileId,
        parsedQuery.data,
      );
      return IcpDebugSampleResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
