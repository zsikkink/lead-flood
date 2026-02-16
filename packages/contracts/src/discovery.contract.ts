import { z } from 'zod';

export const DiscoveryProviderSchema = z.enum([
  'GOOGLE_SEARCH',
  'LINKEDIN_SCRAPE',
  'COMPANY_SEARCH_FREE',
  'APOLLO',
]);

export const DiscoveryRecordStatusSchema = z.enum([
  'DISCOVERED',
  'DUPLICATE',
  'REJECTED',
  'ERROR',
]);

export const DiscoveryPipelineRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'PARTIAL',
]);

export const DiscoveryRunIdParamsSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const CreateDiscoveryRunRequestSchema = z
  .object({
    icpProfileId: z.string().min(1),
    provider: DiscoveryProviderSchema.optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
    cursor: z.string().min(1).optional(),
    requestedByUserId: z.string().min(1).optional(),
  })
  .strict();

export const CreateDiscoveryRunResponseSchema = z
  .object({
    runId: z.string(),
    status: DiscoveryPipelineRunStatusSchema,
  })
  .strict();

export const DiscoveryRunStatusResponseSchema = z
  .object({
    runId: z.string(),
    runType: z.literal('DISCOVERY'),
    status: DiscoveryPipelineRunStatusSchema,
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

export const ListDiscoveryRecordsQuerySchema = z
  .object({
    icpProfileId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    provider: DiscoveryProviderSchema.optional(),
    status: DiscoveryRecordStatusSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    includeQualityMetrics: z.coerce.boolean().default(false),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const DiscoveryQualityMetricsSchema = z
  .object({
    validEmailCount: z.number().int().min(0),
    validDomainCount: z.number().int().min(0),
    industryMatchRate: z.number().min(0).max(1),
    geoMatchRate: z.number().min(0).max(1),
  })
  .strict();

export const LeadDiscoveryRecordResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    icpProfileId: z.string(),
    provider: DiscoveryProviderSchema,
    providerRecordId: z.string(),
    providerCursor: z.string().nullable(),
    queryHash: z.string(),
    status: DiscoveryRecordStatusSchema,
    rawPayload: z.unknown(),
    errorMessage: z.string().nullable(),
    discoveredAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ListDiscoveryRecordsResponseSchema = z
  .object({
    items: z.array(LeadDiscoveryRecordResponseSchema),
    qualityMetrics: DiscoveryQualityMetricsSchema.nullable().optional(),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export type DiscoveryProvider = z.infer<typeof DiscoveryProviderSchema>;
export type DiscoveryRecordStatus = z.infer<typeof DiscoveryRecordStatusSchema>;
export type PipelineRunStatus = z.infer<typeof DiscoveryPipelineRunStatusSchema>;
export type CreateDiscoveryRunRequest = z.infer<typeof CreateDiscoveryRunRequestSchema>;
export type CreateDiscoveryRunResponse = z.infer<typeof CreateDiscoveryRunResponseSchema>;
export type DiscoveryRunStatusResponse = z.infer<
  typeof DiscoveryRunStatusResponseSchema
>;
export type ListDiscoveryRecordsQuery = z.infer<typeof ListDiscoveryRecordsQuerySchema>;
export type LeadDiscoveryRecordResponse = z.infer<
  typeof LeadDiscoveryRecordResponseSchema
>;
export type DiscoveryQualityMetrics = z.infer<typeof DiscoveryQualityMetricsSchema>;
export type ListDiscoveryRecordsResponse = z.infer<
  typeof ListDiscoveryRecordsResponseSchema
>;
