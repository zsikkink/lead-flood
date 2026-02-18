import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  ErrorResponseSchema,
  TrengoWebhookPayloadSchema,
  TrengoWebhookResponseSchema,
} from '@lead-flood/contracts';

import { processTrengoWebhook } from './webhook.service.js';

export interface WebhookRouteDependencies {
  trengoWebhookSecret: string;
  enqueueReplyClassify?: ((payload: import('@lead-flood/contracts').ReplyClassifyJobPayload) => Promise<void>) | undefined;
}

function verifyTrengoSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    );
  } catch {
    return false;
  }
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: WebhookRouteDependencies,
): void {
  app.post('/v1/webhooks/trengo', async (request, reply) => {
    // Verify HMAC signature
    const signature = request.headers['x-trengo-signature'] as string | undefined;
    const rawBody = JSON.stringify(request.body);

    if (!signature || !verifyTrengoSignature(rawBody, signature, deps.trengoWebhookSecret)) {
      reply.status(401);
      return ErrorResponseSchema.parse({
        error: 'Invalid webhook signature',
        requestId: request.id,
      });
    }

    const parsed = TrengoWebhookPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return ErrorResponseSchema.parse({
        error: 'Invalid webhook payload',
        requestId: request.id,
      });
    }

    try {
      const result = await processTrengoWebhook(parsed.data, {
        enqueueReplyClassify: deps.enqueueReplyClassify,
      });

      request.log.info(
        {
          feedbackEventId: result.feedbackEventId,
          dedupeKey: result.dedupeKey,
          skipped: result.skipped,
          reason: result.reason,
        },
        'Processed Trengo webhook',
      );

      return TrengoWebhookResponseSchema.parse({ ok: true });
    } catch (error: unknown) {
      request.log.error({ error }, 'Trengo webhook processing failed');
      reply.status(500);
      return ErrorResponseSchema.parse({
        error: 'Webhook processing failed',
        requestId: request.id,
      });
    }
  });
}
