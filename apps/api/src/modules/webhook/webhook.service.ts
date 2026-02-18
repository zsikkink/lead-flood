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

  // Atomic: upsert feedback event + mark replied + cancel follow-ups
  const event = await prisma.$transaction(async (tx) => {
    const feedbackEvent = await tx.feedbackEvent.upsert({
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

    await tx.messageSend.update({
      where: { id: messageSend.id },
      data: {
        status: 'REPLIED',
        repliedAt: new Date(),
      },
    });

    await tx.messageSend.updateMany({
      where: {
        leadId: messageSend.leadId,
        nextFollowUpAfter: { not: null },
      },
      data: { nextFollowUpAfter: null },
    });

    return feedbackEvent;
  });

  // Enqueue reply classification (outside transaction — pg-boss is separate)
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
