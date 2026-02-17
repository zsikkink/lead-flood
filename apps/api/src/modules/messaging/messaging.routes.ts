import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ApproveMessageDraftRequestSchema,
  ErrorResponseSchema,
  GenerateMessageDraftRequestSchema,
  GenerateMessageDraftResponseSchema,
  ListMessageDraftsQuerySchema,
  ListMessageDraftsResponseSchema,
  ListMessageSendsQuerySchema,
  ListMessageSendsResponseSchema,
  MessageDraftIdParamsSchema,
  MessageDraftResponseSchema,
  MessageSendIdParamsSchema,
  MessageSendResponseSchema,
  RejectMessageDraftRequestSchema,
  SendMessageRequestSchema,
} from '@lead-flood/contracts';

import { MessagingNotImplementedError } from './messaging.errors.js';
import { PrismaMessagingRepository } from './messaging.repository.js';
import { buildMessagingService } from './messaging.service.js';

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof MessagingNotImplementedError) {
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

export function registerMessagingRoutes(app: FastifyInstance): void {
  const repository = new PrismaMessagingRepository();
  const service = buildMessagingService(repository);

  app.post('/v1/messaging/drafts/generate', async (request, reply) => {
    const parsed = GenerateMessageDraftRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid generate message payload');
    }

    try {
      const result = await service.generateMessageDraft(parsed.data);
      return GenerateMessageDraftResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/messaging/drafts', async (request, reply) => {
    const parsedQuery = ListMessageDraftsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid message drafts query');
    }

    try {
      const result = await service.listMessageDrafts(parsedQuery.data);
      return ListMessageDraftsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/messaging/drafts/:draftId', async (request, reply) => {
    const parsedParams = MessageDraftIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid message draft id');
    }

    try {
      const result = await service.getMessageDraft(parsedParams.data.draftId);
      return MessageDraftResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/messaging/drafts/:draftId/approve', async (request, reply) => {
    const parsedParams = MessageDraftIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid message draft id');
    }

    const parsedBody = ApproveMessageDraftRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid approve draft payload');
    }

    try {
      const result = await service.approveMessageDraft(parsedParams.data.draftId, parsedBody.data);
      return MessageDraftResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/messaging/drafts/:draftId/reject', async (request, reply) => {
    const parsedParams = MessageDraftIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid message draft id');
    }

    const parsedBody = RejectMessageDraftRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendValidationError(reply, request.id, 'Invalid reject draft payload');
    }

    try {
      const result = await service.rejectMessageDraft(parsedParams.data.draftId, parsedBody.data);
      return MessageDraftResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.post('/v1/messaging/sends', async (request, reply) => {
    const parsed = SendMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid send message payload');
    }

    try {
      const result = await service.sendMessage(parsed.data);
      return MessageSendResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/messaging/sends', async (request, reply) => {
    const parsedQuery = ListMessageSendsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid message sends query');
    }

    try {
      const result = await service.listMessageSends(parsedQuery.data);
      return ListMessageSendsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/messaging/sends/:sendId', async (request, reply) => {
    const parsedParams = MessageSendIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendValidationError(reply, request.id, 'Invalid message send id');
    }

    try {
      const result = await service.getMessageSend(parsedParams.data.sendId);
      return MessageSendResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
