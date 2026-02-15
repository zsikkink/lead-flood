import { z } from 'zod';

export const LeadStatusSchema = z.enum(['new', 'processing', 'enriched', 'failed']);
export const JobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export const LeadScoreBandSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

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

export const ListLeadsQuerySchema = z
  .object({
    icpProfileId: z.string().min(1).optional(),
    status: LeadStatusSchema.optional(),
    scoreBand: LeadScoreBandSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const LeadInspectionResponseSchema = z
  .object({
    id: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    source: z.string().min(1),
    status: LeadStatusSchema,
    error: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    latestIcpProfileId: z.string().nullable(),
    latestScoreBand: LeadScoreBandSchema.nullable(),
    latestBlendedScore: z.number().nullable(),
    latestDiscoveryRawPayload: z.unknown().nullable(),
    latestEnrichmentNormalizedPayload: z.unknown().nullable(),
    latestEnrichmentRawPayload: z.unknown().nullable(),
  })
  .strict();

export const ListLeadsResponseSchema = z
  .object({
    items: z.array(LeadInspectionResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type JobStatus = z.infer<typeof JobStatusSchema>;
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;
export type GetLeadResponse = z.infer<typeof GetLeadResponseSchema>;
export type GetJobStatusResponse = z.infer<typeof GetJobStatusResponseSchema>;
export type LeadScoreBand = z.infer<typeof LeadScoreBandSchema>;
export type ListLeadsQuery = z.infer<typeof ListLeadsQuerySchema>;
export type LeadInspectionResponse = z.infer<typeof LeadInspectionResponseSchema>;
export type ListLeadsResponse = z.infer<typeof ListLeadsResponseSchema>;
