import type { ReplyClassifyJobPayload, TrengoWebhookPayload } from '@lead-flood/contracts';
import { type Prisma, prisma } from '@lead-flood/db';

export interface WebhookProcessResult {
  feedbackEventId: string | null;
  dedupeKey: string;
  skipped: boolean;
  reason?: string | undefined;
}

export interface WebhookServiceDependencies {
  enqueueReplyClassify?: ((payload: ReplyClassifyJobPayload) => Promise<void>) | undefined;
}

/**
 * Process an inbound Trengo webhook event.
 *
 * 1. Correlate to a MessageSend via providerConversationId
 * 2. Create a FeedbackEvent with source=WEBHOOK, eventType=REPLIED
 * 3. Idempotency via dedupeKey = `trengo:<message_id>`
 * 4. Cancel pending follow-ups for this lead
 * 5. Enqueue reply classification
 */
export async function processTrengoWebhook(
  payload: TrengoWebhookPayload,
  deps?: WebhookServiceDependencies | undefined,
): Promise<WebhookProcessResult> {
  const messageId = payload.data.id;
  const dedupeKey = `trengo:${messageId}`;
  const conversationId = payload.data.conversation_id;
  const contactPhone = payload.data.contact?.phone ?? null;
  const replyText = payload.data.message?.body ?? null;

  // Find the correlated MessageSend
  let messageSend: { id: string; leadId: string } | null = null;

  if (conversationId) {
    messageSend = await prisma.messageSend.findFirst({
      where: { providerConversationId: String(conversationId) },
      select: { id: true, leadId: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Fallback: try to correlate by phone number on the lead
  if (!messageSend && contactPhone) {
    const lead = await prisma.lead.findFirst({
      where: { phone: contactPhone },
      select: { id: true },
    });
    if (lead) {
      const latestSend = await prisma.messageSend.findFirst({
        where: { leadId: lead.id, channel: 'WHATSAPP' },
        select: { id: true, leadId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (latestSend) {
        messageSend = latestSend;
      }
    }
  }

  if (!messageSend) {
    return {
      feedbackEventId: null,
      dedupeKey,
      skipped: true,
      reason: 'NO_CORRELATED_MESSAGE_SEND',
    };
  }

  // Upsert FeedbackEvent (idempotent via dedupeKey)
  const event = await prisma.feedbackEvent.upsert({
    where: { dedupeKey },
    create: {
      leadId: messageSend.leadId,
      messageSendId: messageSend.id,
      eventType: 'REPLIED',
      source: 'WEBHOOK',
      providerEventId: String(messageId),
      dedupeKey,
      payloadJson: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      replyText,
      occurredAt: new Date(),
    },
    update: {},
  });

  // Also update the MessageSend status to REPLIED
  await prisma.messageSend.update({
    where: { id: messageSend.id },
    data: {
      status: 'REPLIED',
      repliedAt: new Date(),
    },
  });

  // Cancel all pending follow-ups for this lead
  await prisma.messageSend.updateMany({
    where: {
      leadId: messageSend.leadId,
      nextFollowUpAfter: { not: null },
    },
    data: { nextFollowUpAfter: null },
  });

  // Enqueue reply classification
  if (deps?.enqueueReplyClassify) {
    await deps.enqueueReplyClassify({
      runId: `reply.classify:${event.id}`,
      feedbackEventId: event.id,
      replyText,
      leadId: messageSend.leadId,
      messageSendId: messageSend.id,
      correlationId: `webhook:trengo:${messageId}`,
    });
  }

  return {
    feedbackEventId: event.id,
    dedupeKey: event.dedupeKey,
    skipped: false,
  };
}
