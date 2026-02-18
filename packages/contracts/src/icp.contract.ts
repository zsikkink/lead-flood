import { z } from 'zod';

export const QualificationRuleTypeSchema = z.enum(['WEIGHTED', 'HARD_FILTER']);
export const QualificationLogicSchema = z.enum(['WEIGHTED']);

export const QualificationOperatorSchema = z.enum([
  'EQ',
  'NEQ',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'NOT_IN',
  'CONTAINS',
]);

export const IcpIdParamsSchema = z
  .object({
    icpId: z.string().min(1),
  })
  .strict();

export const IcpRuleParamsSchema = z
  .object({
    icpId: z.string().min(1),
    ruleId: z.string().min(1),
  })
  .strict();

export const IcpDebugSampleParamsSchema = z
  .object({
    icpProfileId: z.string().min(1),
  })
  .strict();

export const IcpDebugSampleQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const CreateIcpProfileRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    qualificationLogic: QualificationLogicSchema.optional(),
    metadataJson: z.record(z.unknown()).optional(),
    targetIndustries: z.array(z.string().min(1)).optional(),
    targetCountries: z.array(z.string().min(1)).optional(),
    minCompanySize: z.number().int().positive().optional(),
    maxCompanySize: z.number().int().positive().optional(),
    requiredTechnologies: z.array(z.string().min(1)).optional(),
    excludedDomains: z.array(z.string().min(1)).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.minCompanySize === undefined ||
      v.maxCompanySize === undefined ||
      v.minCompanySize <= v.maxCompanySize,
    {
      message: 'minCompanySize must be <= maxCompanySize',
      path: ['minCompanySize'],
    },
  );

export const UpdateIcpProfileRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    qualificationLogic: QualificationLogicSchema.optional(),
    metadataJson: z.record(z.unknown()).nullable().optional(),
    targetIndustries: z.array(z.string().min(1)).optional(),
    targetCountries: z.array(z.string().min(1)).optional(),
    minCompanySize: z.number().int().positive().nullable().optional(),
    maxCompanySize: z.number().int().positive().nullable().optional(),
    requiredTechnologies: z.array(z.string().min(1)).optional(),
    excludedDomains: z.array(z.string().min(1)).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const CreateQualificationRuleRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    ruleType: QualificationRuleTypeSchema.optional(),
    isRequired: z.boolean().optional(),
    fieldKey: z.string().min(1).max(120),
    operator: QualificationOperatorSchema,
    valueJson: z.unknown(),
    weight: z.number().min(-10).max(10).optional(),
    isActive: z.boolean().optional(),
    orderIndex: z.number().int().min(1).max(5000).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export const UpdateQualificationRuleRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    ruleType: QualificationRuleTypeSchema.optional(),
    isRequired: z.boolean().optional(),
    fieldKey: z.string().min(1).max(120).optional(),
    operator: QualificationOperatorSchema.optional(),
    valueJson: z.unknown().optional(),
    weight: z.number().min(-10).max(10).nullable().optional(),
    isActive: z.boolean().optional(),
    orderIndex: z.number().int().min(1).max(5000).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export const ReplaceQualificationRuleInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    ruleType: QualificationRuleTypeSchema.optional(),
    isRequired: z.boolean().optional(),
    fieldKey: z.string().min(1).max(120),
    operator: QualificationOperatorSchema,
    valueJson: z.unknown(),
    weight: z.number().min(-10).max(10).nullable().optional(),
    isActive: z.boolean().optional(),
    orderIndex: z.number().int().min(1).max(5000),
    priority: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export const ReplaceIcpRulesRequestSchema = z
  .object({
    rules: z.array(ReplaceQualificationRuleInputSchema).max(200),
  })
  .strict();

export const QualificationRuleResponseSchema = z
  .object({
    id: z.string(),
    icpProfileId: z.string(),
    name: z.string(),
    ruleType: QualificationRuleTypeSchema,
    isRequired: z.boolean(),
    fieldKey: z.string(),
    operator: QualificationOperatorSchema,
    valueJson: z.unknown(),
    weight: z.number().nullable(),
    orderIndex: z.number().int(),
    isActive: z.boolean(),
    priority: z.number().int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListIcpRulesResponseSchema = z
  .object({
    items: z.array(QualificationRuleResponseSchema),
  })
  .strict();

export const IcpProfileResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    qualificationLogic: QualificationLogicSchema,
    metadataJson: z.record(z.unknown()).nullable(),
    targetIndustries: z.array(z.string()),
    targetCountries: z.array(z.string()),
    minCompanySize: z.number().int().nullable(),
    maxCompanySize: z.number().int().nullable(),
    requiredTechnologies: z.array(z.string()),
    excludedDomains: z.array(z.string()),
    isActive: z.boolean(),
    createdByUserId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    qualificationRules: z.array(QualificationRuleResponseSchema).optional(),
  })
  .strict();

export const ListIcpProfilesQuerySchema = z
  .object({
    isActive: z.coerce.boolean().optional(),
    q: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListIcpProfilesResponseSchema = z
  .object({
    items: z.array(IcpProfileResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const IcpStatusResponseSchema = z
  .object({
    icpId: z.string(),
    isActive: z.boolean(),
    totalRules: z.number().int().min(0),
    activeRules: z.number().int().min(0),
    hardFilterRules: z.number().int().min(0),
    weightedRules: z.number().int().min(0),
    lastDiscoveryAt: z.string().datetime().nullable(),
    lastScoredAt: z.string().datetime().nullable(),
  })
  .strict();

const IcpDebugDiscoveryProviderSchema = z.enum([
  'BRAVE_SEARCH',
  'GOOGLE_PLACES',
  'GOOGLE_SEARCH',
  'LINKEDIN_SCRAPE',
  'COMPANY_SEARCH_FREE',
  'APOLLO',
]);

export const IcpDebugRuleEvaluationSchema = z
  .object({
    ruleId: z.string(),
    fieldKey: z.string(),
    operator: QualificationOperatorSchema,
    matched: z.boolean(),
  })
  .strict();

export const IcpDebugNormalizedSampleSchema = z
  .object({
    email: z.string().nullable(),
    domain: z.string().nullable(),
    companyName: z.string().nullable(),
    industry: z.string().nullable(),
    employeeCount: z.number().nullable(),
    country: z.string().nullable(),
    city: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    website: z.string().nullable(),
  })
  .strict();

export const IcpDebugSampleItemSchema = z
  .object({
    leadId: z.string(),
    discoveryRecordId: z.string(),
    provider: IcpDebugDiscoveryProviderSchema,
    rawPayload: z.unknown(),
    normalizedPayload: IcpDebugNormalizedSampleSchema.nullable(),
    ruleEvaluations: z.array(IcpDebugRuleEvaluationSchema),
  })
  .strict();

export const IcpDebugSampleResponseSchema = z
  .object({
    icpProfileId: z.string(),
    providerQueries: z.array(
      z
        .object({
          provider: IcpDebugDiscoveryProviderSchema,
          query: z.unknown(),
        })
        .strict(),
    ),
    samples: z.array(IcpDebugSampleItemSchema),
  })
  .strict();

export type QualificationRuleType = z.infer<typeof QualificationRuleTypeSchema>;
export type QualificationLogic = z.infer<typeof QualificationLogicSchema>;
export type QualificationOperator = z.infer<typeof QualificationOperatorSchema>;
export type CreateIcpProfileRequest = z.infer<typeof CreateIcpProfileRequestSchema>;
export type UpdateIcpProfileRequest = z.infer<typeof UpdateIcpProfileRequestSchema>;
export type IcpProfileResponse = z.infer<typeof IcpProfileResponseSchema>;
export type ListIcpProfilesQuery = z.infer<typeof ListIcpProfilesQuerySchema>;
export type ListIcpProfilesResponse = z.infer<typeof ListIcpProfilesResponseSchema>;
export type CreateQualificationRuleRequest = z.infer<
  typeof CreateQualificationRuleRequestSchema
>;
export type UpdateQualificationRuleRequest = z.infer<
  typeof UpdateQualificationRuleRequestSchema
>;
export type QualificationRuleResponse = z.infer<typeof QualificationRuleResponseSchema>;
export type ListIcpRulesResponse = z.infer<typeof ListIcpRulesResponseSchema>;
export type ReplaceQualificationRuleInput = z.infer<typeof ReplaceQualificationRuleInputSchema>;
export type ReplaceIcpRulesRequest = z.infer<typeof ReplaceIcpRulesRequestSchema>;
export type IcpStatusResponse = z.infer<typeof IcpStatusResponseSchema>;
export type IcpDebugSampleQuery = z.infer<typeof IcpDebugSampleQuerySchema>;
export type IcpDebugSampleResponse = z.infer<typeof IcpDebugSampleResponseSchema>;
