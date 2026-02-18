import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  ErrorResponseSchema,
  type ReplyClassifyJobPayload,
  TrengoWebhookPayloadSchema,
  TrengoWebhookResponseSchema,
} from '@lead-flood/contracts';

import { processTrengoWebhook } from './webhook.service.js';

export interface WebhookRouteDependencies {
  trengoWebhookSecret: string;
  enqueueReplyClassify?: ((payload: ReplyClassifyJobPayload) => Promise<void>) | undefined;
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

function getRawBody(request: FastifyRequest): string {
  return (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
}

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: WebhookRouteDependencies,
): void {
  // Capture raw body for HMAC verification — scoped to this plugin only
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      const raw = (body as Buffer).toString();
      (req as unknown as { rawBody: string }).rawBody = raw;
      const json = JSON.parse(raw) as unknown;
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post('/v1/webhooks/trengo', { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } }, async (request, reply) => {
    // Verify HMAC signature using the original raw body bytes
    const signature = request.headers['x-trengo-signature'] as string | undefined;
    const rawBody = getRawBody(request);

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
