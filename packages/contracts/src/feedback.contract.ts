import { z } from 'zod';

export const FeedbackEventTypeSchema = z.enum([
  'REPLIED',
  'MEETING_BOOKED',
  'DEAL_WON',
  'DEAL_LOST',
  'UNSUBSCRIBED',
  'BOUNCED',
]);

export const FeedbackSourceSchema = z.enum(['WEBHOOK', 'MANUAL', 'CRM_IMPORT']);

export const IngestFeedbackEventRequestSchema = z
  .object({
    leadId: z.string().min(1),
    messageSendId: z.string().min(1).optional(),
    eventType: FeedbackEventTypeSchema,
    source: FeedbackSourceSchema,
    providerEventId: z.string().min(1).optional(),
    payloadJson: z.unknown().optional(),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const IngestFeedbackEventResponseSchema = z
  .object({
    feedbackEventId: z.string(),
    dedupeKey: z.string(),
  })
  .strict();

export const FeedbackEventResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    messageSendId: z.string().nullable(),
    eventType: FeedbackEventTypeSchema,
    source: FeedbackSourceSchema,
    providerEventId: z.string().nullable(),
    dedupeKey: z.string(),
    payloadJson: z.unknown().nullable(),
    occurredAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ListFeedbackEventsQuerySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    messageSendId: z.string().min(1).optional(),
    eventType: FeedbackEventTypeSchema.optional(),
    source: FeedbackSourceSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListFeedbackEventsResponseSchema = z
  .object({
    items: z.array(FeedbackEventResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const FeedbackSummaryQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    icpProfileId: z.string().min(1).optional(),
  })
  .strict();

export const FeedbackSummaryResponseSchema = z
  .object({
    from: z.string().datetime().nullable(),
    to: z.string().datetime().nullable(),
    totalEvents: z.number().int().min(0),
    repliedCount: z.number().int().min(0),
    meetingBookedCount: z.number().int().min(0),
    dealWonCount: z.number().int().min(0),
    dealLostCount: z.number().int().min(0),
    unsubscribedCount: z.number().int().min(0),
    bouncedCount: z.number().int().min(0),
  })
  .strict();

export type FeedbackEventType = z.infer<typeof FeedbackEventTypeSchema>;
export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;
export type IngestFeedbackEventRequest = z.infer<typeof IngestFeedbackEventRequestSchema>;
export type IngestFeedbackEventResponse = z.infer<
  typeof IngestFeedbackEventResponseSchema
>;
export type FeedbackEventResponse = z.infer<typeof FeedbackEventResponseSchema>;
export type ListFeedbackEventsQuery = z.infer<typeof ListFeedbackEventsQuerySchema>;
export type ListFeedbackEventsResponse = z.infer<
  typeof ListFeedbackEventsResponseSchema
>;
export type FeedbackSummaryQuery = z.infer<typeof FeedbackSummaryQuerySchema>;
export type FeedbackSummaryResponse = z.infer<typeof FeedbackSummaryResponseSchema>;
