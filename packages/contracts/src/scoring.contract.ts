import { z } from 'zod';

export const ScoringPipelineRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'PARTIAL',
]);

export const ScoreBandSchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const ScoringRunModeSchema = z.enum(['ALL_ACTIVE_ICPS', 'BY_ICP', 'BY_LEAD_IDS']);

export const ScoringRunIdParamsSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const LeadIdParamsSchema = z
  .object({
    leadId: z.string().min(1),
  })
  .strict();

export const LatestLeadScoreQuerySchema = z
  .object({
    icpProfileId: z.string().min(1).optional(),
  })
  .strict();

export const CreateScoringRunRequestSchema = z
  .object({
    mode: ScoringRunModeSchema.default('ALL_ACTIVE_ICPS'),
    icpProfileId: z.string().min(1).optional(),
    leadIds: z.array(z.string().min(1)).min(1).optional(),
    modelVersionId: z.string().min(1).optional(),
    requestedByUserId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'BY_ICP' && !v.icpProfileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'icpProfileId is required when mode is BY_ICP',
        path: ['icpProfileId'],
      });
    }
    if (v.mode === 'BY_LEAD_IDS' && (!v.leadIds || v.leadIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'leadIds is required when mode is BY_LEAD_IDS',
        path: ['leadIds'],
      });
    }
  });

export const CreateScoringRunResponseSchema = z
  .object({
    runId: z.string(),
    status: ScoringPipelineRunStatusSchema,
  })
  .strict();

export const ScoringRunStatusResponseSchema = z
  .object({
    runId: z.string(),
    runType: z.literal('SCORING'),
    status: ScoringPipelineRunStatusSchema,
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

export const LeadScorePredictionResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    icpProfileId: z.string(),
    featureSnapshotId: z.string(),
    modelVersionId: z.string(),
    deterministicScore: z.number(),
    logisticScore: z.number(),
    blendedScore: z.number(),
    scoreBand: ScoreBandSchema,
    reasonsJson: z.unknown(),
    predictedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ListScorePredictionsQuerySchema = z
  .object({
    leadId: z.string().min(1).optional(),
    icpProfileId: z.string().min(1).optional(),
    modelVersionId: z.string().min(1).optional(),
    scoreBand: ScoreBandSchema.optional(),
    minBlendedScore: z.coerce.number().min(0).max(1).optional(),
    maxBlendedScore: z.coerce.number().min(0).max(1).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListScorePredictionsResponseSchema = z
  .object({
    items: z.array(LeadScorePredictionResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const LatestLeadScoreResponseSchema = z
  .object({
    leadId: z.string(),
    prediction: LeadScorePredictionResponseSchema.nullable(),
  })
  .strict();

export const LeadFeatureSnapshotResponseSchema = z
  .object({
    id: z.string(),
    leadId: z.string(),
    icpProfileId: z.string(),
    discoveryRecordId: z.string().nullable(),
    enrichmentRecordId: z.string().nullable(),
    snapshotVersion: z.number().int().min(1),
    sourceVersion: z.string(),
    featureVectorHash: z.string(),
    featuresJson: z.unknown(),
    ruleMatchCount: z.number().int().min(0),
    hardFilterPassed: z.boolean(),
    computedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const LatestLeadFeatureSnapshotResponseSchema = z
  .object({
    leadId: z.string(),
    icpProfileId: z.string().nullable(),
    snapshot: LeadFeatureSnapshotResponseSchema.nullable(),
  })
  .strict();

export const LatestLeadDeterministicScoreResponseSchema = z
  .object({
    leadId: z.string(),
    icpProfileId: z.string().nullable(),
    predictionId: z.string().nullable(),
    deterministicScore: z.number().min(0).max(1).nullable(),
    reasonCodes: z.array(z.string()),
    ruleEvaluation: z.array(z.unknown()),
    predictedAt: z.string().datetime().nullable(),
  })
  .strict();

export type ScoreBand = z.infer<typeof ScoreBandSchema>;
export type ScoringRunMode = z.infer<typeof ScoringRunModeSchema>;
export type CreateScoringRunRequest = z.infer<typeof CreateScoringRunRequestSchema>;
export type CreateScoringRunResponse = z.infer<typeof CreateScoringRunResponseSchema>;
export type ScoringRunStatusResponse = z.infer<typeof ScoringRunStatusResponseSchema>;
export type LeadScorePredictionResponse = z.infer<
  typeof LeadScorePredictionResponseSchema
>;
export type ListScorePredictionsQuery = z.infer<typeof ListScorePredictionsQuerySchema>;
export type ListScorePredictionsResponse = z.infer<
  typeof ListScorePredictionsResponseSchema
>;
export type LatestLeadScoreResponse = z.infer<typeof LatestLeadScoreResponseSchema>;
export type LatestLeadScoreQuery = z.infer<typeof LatestLeadScoreQuerySchema>;
export type LeadFeatureSnapshotResponse = z.infer<typeof LeadFeatureSnapshotResponseSchema>;
export type LatestLeadFeatureSnapshotResponse = z.infer<
  typeof LatestLeadFeatureSnapshotResponseSchema
>;
export type LatestLeadDeterministicScoreResponse = z.infer<
  typeof LatestLeadDeterministicScoreResponseSchema
>;
