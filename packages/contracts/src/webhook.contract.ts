import { z } from 'zod';

export const TrengoWebhookContactSchema = z.object({
  phone: z.string().optional(),
}).passthrough();

export const TrengoWebhookMessageSchema = z.object({
  body: z.string().optional(),
}).passthrough();

export const TrengoWebhookDataSchema = z.object({
  id: z.number(),
  contact: TrengoWebhookContactSchema.optional(),
  message: TrengoWebhookMessageSchema.optional(),
  channel_id: z.number().optional(),
  conversation_id: z.number().optional(),
}).passthrough();

export const TrengoWebhookPayloadSchema = z.object({
  event: z.string(),
  data: TrengoWebhookDataSchema,
}).passthrough();

export const TrengoWebhookResponseSchema = z.object({
  ok: z.boolean(),
}).strict();

export type TrengoWebhookContact = z.infer<typeof TrengoWebhookContactSchema>;
export type TrengoWebhookMessage = z.infer<typeof TrengoWebhookMessageSchema>;
export type TrengoWebhookData = z.infer<typeof TrengoWebhookDataSchema>;
export type TrengoWebhookPayload = z.infer<typeof TrengoWebhookPayloadSchema>;
export type TrengoWebhookResponse = z.infer<typeof TrengoWebhookResponseSchema>;
