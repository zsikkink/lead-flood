import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ErrorResponseSchema,
  FeedbackSummaryQuerySchema,
  FeedbackSummaryResponseSchema,
  IngestFeedbackEventRequestSchema,
  IngestFeedbackEventResponseSchema,
  ListFeedbackEventsQuerySchema,
  ListFeedbackEventsResponseSchema,
} from '@lead-flood/contracts';

import { FeedbackNotImplementedError } from './feedback.errors.js';
import { StubFeedbackRepository } from './feedback.repository.js';
import { buildFeedbackService } from './feedback.service.js';

function sendValidationError(reply: FastifyReply, requestId: string, message: string) {
  reply.status(400);
  return ErrorResponseSchema.parse({
    error: message,
    requestId,
  });
}

function handleModuleError(error: unknown, request: FastifyRequest, reply: FastifyReply): boolean {
  if (error instanceof FeedbackNotImplementedError) {
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

export function registerFeedbackRoutes(app: FastifyInstance): void {
  const repository = new StubFeedbackRepository();
  const service = buildFeedbackService(repository);

  app.post('/v1/feedback/events', async (request, reply) => {
    const parsed = IngestFeedbackEventRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendValidationError(reply, request.id, 'Invalid feedback event payload');
    }

    try {
      const result = await service.ingestFeedbackEvent(parsed.data);
      return IngestFeedbackEventResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/feedback/events', async (request, reply) => {
    const parsedQuery = ListFeedbackEventsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid feedback events query');
    }

    try {
      const result = await service.listFeedbackEvents(parsedQuery.data);
      return ListFeedbackEventsResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });

  app.get('/v1/feedback/summary', async (request, reply) => {
    const parsedQuery = FeedbackSummaryQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendValidationError(reply, request.id, 'Invalid feedback summary query');
    }

    try {
      const result = await service.getFeedbackSummary(parsedQuery.data);
      return FeedbackSummaryResponseSchema.parse(result);
    } catch (error: unknown) {
      if (handleModuleError(error, request, reply)) {
        return;
      }
      throw error;
    }
  });
}
