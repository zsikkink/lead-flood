import { z } from 'zod';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export const ReadyResponseSchema = z.object({
  status: z.union([z.literal('ready'), z.literal('not_ready')]),
  db: z.union([z.literal('ok'), z.literal('fail')]),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type ReadyResponse = z.infer<typeof ReadyResponseSchema>;
