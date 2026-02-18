import { z } from 'zod';

// ---------- Reply Classification ----------

export const ReplyClassificationSchema = z.enum([
  'INTERESTED',
  'NOT_INTERESTED',
  'OUT_OF_OFFICE',
  'UNSUBSCRIBE',
]);
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;

// ---------- followup.check job ----------

export const FollowupCheckJobPayloadSchema = z.object({
  runId: z.string(),
  correlationId: z.string().optional(),
});
export type FollowupCheckJobPayload = z.infer<typeof FollowupCheckJobPayloadSchema>;

// ---------- reply.classify job ----------

export const ReplyClassifyJobPayloadSchema = z.object({
  runId: z.string(),
  feedbackEventId: z.string(),
  replyText: z.string().nullable(),
  leadId: z.string(),
  messageSendId: z.string(),
  correlationId: z.string().optional(),
});
export type ReplyClassifyJobPayload = z.infer<typeof ReplyClassifyJobPayloadSchema>;

// ---------- notify.sales job ----------

export const NotifySalesJobPayloadSchema = z.object({
  runId: z.string(),
  leadId: z.string(),
  feedbackEventId: z.string(),
  classification: ReplyClassificationSchema.nullable(),
  unclassified: z.boolean().optional(),
  reason: z.string().optional(),
  correlationId: z.string().optional(),
});
export type NotifySalesJobPayload = z.infer<typeof NotifySalesJobPayloadSchema>;

// ---------- Extended message.generate payload fields ----------

export const FollowUpGenerateFieldsSchema = z.object({
  followUpNumber: z.number().int().min(0).max(3).optional(),
  parentMessageSendId: z.string().optional(),
  previouslyPitchedFeatures: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
});
export type FollowUpGenerateFields = z.infer<typeof FollowUpGenerateFieldsSchema>;
