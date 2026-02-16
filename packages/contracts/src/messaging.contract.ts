import { z } from 'zod';

export const MessageChannelSchema = z.enum(['EMAIL']);

export const MessageApprovalStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'AUTO_APPROVED',
]);

export const MessageSendStatusSchema = z.enum([
  'QUEUED',
  'SENT',
  'DELIVERED',
  'REPLIED',
  'BOUNCED',
  'FAILED',
]);

export const SendProviderSchema = z.enum(['RESEND']);

export const MessageDraftIdParamsSchema = z
  .object({
    draftId: z.string().min(1),
  })
  .strict();

export const MessageSendIdParamsSchema = z
  .object({
    sendId: z.string().min(1),
  })
  .strict();

export const GenerateMessageDraftRequestSchema = z
  .object({
    leadId: z.string().min(1),
    icpProfileId: z.string().min(1),
    scorePredictionId: z.string().min(1).optional(),
    knowledgeEntryIds: z.array(z.string().min(1)).default([]),
    channel: MessageChannelSchema.default('EMAIL'),
    promptVersion: z.string().min(1),
  })
  .strict();

export const GenerateMessageDraftResponseSchema = z
  .object({
    draftId: z.string(),
    variantIds: z.array(z.string()),
  })
  .strict();

export const MessageVariantResponseSchema = z
  .object({
    id: z.string(),
    messageDraftId: z.string(),
    variantKey: z.string(),
    channel: MessageChannelSchema,
    subject: z.string().nullable(),
    bodyText: z.string(),
    bodyHtml: z.string().nullable(),
    ctaText: z.string().nullable(),
    qualityScore: z.number().nullable(),
    isSelected: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const MessageDraftResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    icpProfileId: z.string(),
    scorePredictionId: z.string().nullable(),
    promptVersion: z.string(),
    generatedByModel: z.string(),
    groundingKnowledgeIds: z.array(z.string()),
    groundingContextJson: z.unknown().nullable(),
    approvalStatus: MessageApprovalStatusSchema,
    approvedByUserId: z.string().nullable(),
    approvedAt: z.string().datetime().nullable(),
    rejectedReason: z.string().nullable(),
    variants: z.array(MessageVariantResponseSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ApproveMessageDraftRequestSchema = z
  .object({
    approvedByUserId: z.string().min(1),
    selectedVariantId: z.string().min(1).optional(),
  })
  .strict();

export const RejectMessageDraftRequestSchema = z
  .object({
    rejectedByUserId: z.string().min(1),
    rejectedReason: z.string().min(1).max(1000),
  })
  .strict();

export const SendMessageRequestSchema = z
  .object({
    messageDraftId: z.string().min(1),
    messageVariantId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    scheduledAt: z.string().datetime().optional(),
  })
  .strict();

export const MessageSendResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    messageDraftId: z.string(),
    messageVariantId: z.string(),
    channel: MessageChannelSchema,
    provider: SendProviderSchema,
    providerMessageId: z.string().nullable(),
    status: MessageSendStatusSchema,
    idempotencyKey: z.string(),
    scheduledAt: z.string().datetime().nullable(),
    sentAt: z.string().datetime().nullable(),
    deliveredAt: z.string().datetime().nullable(),
    repliedAt: z.string().datetime().nullable(),
    failureCode: z.string().nullable(),
    failureReason: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListMessageDraftsQuerySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    icpProfileId: z.string().min(1).optional(),
    approvalStatus: MessageApprovalStatusSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListMessageDraftsResponseSchema = z
  .object({
    items: z.array(MessageDraftResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const ListMessageSendsQuerySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    status: MessageSendStatusSchema.optional(),
    channel: MessageChannelSchema.optional(),
    provider: SendProviderSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListMessageSendsResponseSchema = z
  .object({
    items: z.array(MessageSendResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export type MessageChannel = z.infer<typeof MessageChannelSchema>;
export type MessageApprovalStatus = z.infer<typeof MessageApprovalStatusSchema>;
export type MessageSendStatus = z.infer<typeof MessageSendStatusSchema>;
export type SendProvider = z.infer<typeof SendProviderSchema>;
export type GenerateMessageDraftRequest = z.infer<
  typeof GenerateMessageDraftRequestSchema
>;
export type GenerateMessageDraftResponse = z.infer<
  typeof GenerateMessageDraftResponseSchema
>;
export type MessageVariantResponse = z.infer<typeof MessageVariantResponseSchema>;
export type MessageDraftResponse = z.infer<typeof MessageDraftResponseSchema>;
export type ApproveMessageDraftRequest = z.infer<
  typeof ApproveMessageDraftRequestSchema
>;
export type RejectMessageDraftRequest = z.infer<
  typeof RejectMessageDraftRequestSchema
>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type MessageSendResponse = z.infer<typeof MessageSendResponseSchema>;
export type ListMessageDraftsQuery = z.infer<typeof ListMessageDraftsQuerySchema>;
export type ListMessageDraftsResponse = z.infer<
  typeof ListMessageDraftsResponseSchema
>;
export type ListMessageSendsQuery = z.infer<typeof ListMessageSendsQuerySchema>;
export type ListMessageSendsResponse = z.infer<typeof ListMessageSendsResponseSchema>;
