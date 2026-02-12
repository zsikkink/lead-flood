import { z } from 'zod';

export const LeadStatusSchema = z.enum(['new', 'processing', 'enriched', 'failed']);
export const JobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const CreateLeadRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  source: z.string().min(1),
});

export const CreateLeadResponseSchema = z.object({
  leadId: z.string().min(1),
  jobId: z.string().min(1),
});

export const GetLeadResponseSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  source: z.string().min(1),
  status: LeadStatusSchema,
  enrichmentData: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const GetJobStatusResponseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  status: JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  leadId: z.string().nullable(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;
export type GetLeadResponse = z.infer<typeof GetLeadResponseSchema>;
export type GetJobStatusResponse = z.infer<typeof GetJobStatusResponseSchema>;
