import { z } from 'zod';

export const EnrichmentProviderSchema = z.enum([
  'HUNTER',
  'CLEARBIT',
  'OTHER_FREE',
  'PEOPLE_DATA_LABS',
]);

export const EnrichmentStatusSchema = z.enum(['PENDING', 'COMPLETED', 'FAILED']);

export const EnrichmentPipelineRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'PARTIAL',
]);

export const EnrichmentRunIdParamsSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const CreateEnrichmentRunRequestSchema = z
  .object({
    leadIds: z.array(z.string().min(1)).min(1).optional(),
    icpProfileId: z.string().min(1).optional(),
    provider: EnrichmentProviderSchema.optional(),
    requestedByUserId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => Boolean(v.icpProfileId || v.leadIds?.length), {
    message: 'leadIds or icpProfileId is required',
    path: ['leadIds'],
  });

export const CreateEnrichmentRunResponseSchema = z
  .object({
    runId: z.string(),
    status: EnrichmentPipelineRunStatusSchema,
  })
  .strict();

export const EnrichmentRunStatusResponseSchema = z
  .object({
    runId: z.string(),
    runType: z.literal('ENRICHMENT'),
    status: EnrichmentPipelineRunStatusSchema,
    totalItems: z.number().int().min(0),
    processedItems: z.number().int().min(0),
    failedItems: z.number().int().min(0),
    startedAt: z.string().datetime().nullable(),
    endedAt: z.string().datetime().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListEnrichmentRecordsQuerySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    provider: EnrichmentProviderSchema.optional(),
    status: EnrichmentStatusSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    includeQualityMetrics: z.coerce.boolean().default(false),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const EnrichmentQualityMetricsSchema = z
  .object({
    validEmailCount: z.number().int().min(0),
    validDomainCount: z.number().int().min(0),
    industryMatchRate: z.number().min(0).max(1),
    geoMatchRate: z.number().min(0).max(1),
  })
  .strict();

export const LeadEnrichmentRecordResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    provider: EnrichmentProviderSchema,
    status: EnrichmentStatusSchema,
    attempt: z.number().int().min(1),
    providerRecordId: z.string().nullable(),
    normalizedPayload: z.unknown().nullable(),
    rawPayload: z.unknown().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    enrichedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListEnrichmentRecordsResponseSchema = z
  .object({
    items: z.array(LeadEnrichmentRecordResponseSchema),
    qualityMetrics: EnrichmentQualityMetricsSchema.nullable().optional(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export type EnrichmentProvider = z.infer<typeof EnrichmentProviderSchema>;
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>;
export type CreateEnrichmentRunRequest = z.infer<typeof CreateEnrichmentRunRequestSchema>;
export type CreateEnrichmentRunResponse = z.infer<typeof CreateEnrichmentRunResponseSchema>;
export type EnrichmentRunStatusResponse = z.infer<
  typeof EnrichmentRunStatusResponseSchema
>;
export type ListEnrichmentRecordsQuery = z.infer<typeof ListEnrichmentRecordsQuerySchema>;
export type LeadEnrichmentRecordResponse = z.infer<
  typeof LeadEnrichmentRecordResponseSchema
>;
export type EnrichmentQualityMetrics = z.infer<typeof EnrichmentQualityMetricsSchema>;
export type ListEnrichmentRecordsResponse = z.infer<
  typeof ListEnrichmentRecordsResponseSchema
>;
