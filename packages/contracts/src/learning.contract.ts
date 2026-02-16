import { z } from 'zod';

export const TrainingRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);

export const TrainingTriggerSchema = z.enum([
  'MANUAL',
  'SCHEDULED',
  'FEEDBACK_THRESHOLD',
]);

export const ModelTypeSchema = z.enum(['LOGISTIC_REGRESSION']);

export const ModelStageSchema = z.enum(['SHADOW', 'ACTIVE', 'ARCHIVED']);

export const EvaluationSplitSchema = z.enum(['TRAIN', 'VALIDATION', 'TEST']);

export const TrainingRunIdParamsSchema = z
  .object({
    trainingRunId: z.string().min(1),
  })
  .strict();

export const ModelVersionIdParamsSchema = z
  .object({
    modelVersionId: z.string().min(1),
  })
  .strict();

export const CreateRetrainRunRequestSchema = z
  .object({
    windowDays: z.number().int().min(7).max(365).default(90),
    minSamples: z.number().int().min(20).default(100),
    trigger: TrainingTriggerSchema.default('MANUAL'),
    activateIfPass: z.boolean().default(true),
    requestedByUserId: z.string().min(1).optional(),
  })
  .strict();

export const CreateRetrainRunResponseSchema = z
  .object({
    trainingRunId: z.string(),
    status: TrainingRunStatusSchema,
  })
  .strict();

export const TrainingRunResponseSchema = z
  .object({
    id: z.string(),
    modelType: ModelTypeSchema,
    status: TrainingRunStatusSchema,
    trigger: TrainingTriggerSchema,
    triggeredByUserId: z.string().nullable(),
    configJson: z.unknown(),
    trainingWindowStart: z.string().datetime(),
    trainingWindowEnd: z.string().datetime(),
    datasetSize: z.number().int().min(0),
    positiveCount: z.number().int().min(0),
    negativeCount: z.number().int().min(0),
    startedAt: z.string().datetime().nullable(),
    endedAt: z.string().datetime().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListTrainingRunsQuerySchema = z
  .object({
    status: TrainingRunStatusSchema.optional(),
    modelType: ModelTypeSchema.optional(),
    trigger: TrainingTriggerSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListTrainingRunsResponseSchema = z
  .object({
    items: z.array(TrainingRunResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const ModelVersionResponseSchema = z
  .object({
    id: z.string(),
    trainingRunId: z.string(),
    modelType: ModelTypeSchema,
    versionTag: z.string(),
    stage: ModelStageSchema,
    featureSchemaJson: z.unknown(),
    coefficientsJson: z.unknown().nullable(),
    intercept: z.number().nullable(),
    deterministicWeightsJson: z.unknown(),
    artifactUri: z.string().nullable(),
    checksum: z.string(),
    trainedAt: z.string().datetime(),
    activatedAt: z.string().datetime().nullable(),
    retiredAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const ListModelVersionsQuerySchema = z
  .object({
    modelType: ModelTypeSchema.optional(),
    stage: ModelStageSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListModelVersionsResponseSchema = z
  .object({
    items: z.array(ModelVersionResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export const ActivateModelRequestSchema = z
  .object({
    activatedByUserId: z.string().min(1),
    retirePreviousActive: z.boolean().default(true),
  })
  .strict();

export const ModelEvaluationResponseSchema = z
  .object({
    id: z.string(),
    modelVersionId: z.string(),
    trainingRunId: z.string(),
    split: EvaluationSplitSchema,
    sampleSize: z.number().int().min(0),
    positiveRate: z.number(),
    auc: z.number(),
    prAuc: z.number(),
    precision: z.number(),
    recall: z.number(),
    f1: z.number(),
    brierScore: z.number(),
    calibrationJson: z.unknown().nullable(),
    confusionMatrixJson: z.unknown().nullable(),
    evaluatedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const ListModelEvaluationsQuerySchema = z
  .object({
    split: EvaluationSplitSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ListModelEvaluationsResponseSchema = z
  .object({
    items: z.array(ModelEvaluationResponseSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  })
  .strict();

export type TrainingRunStatus = z.infer<typeof TrainingRunStatusSchema>;
export type TrainingTrigger = z.infer<typeof TrainingTriggerSchema>;
export type ModelType = z.infer<typeof ModelTypeSchema>;
export type ModelStage = z.infer<typeof ModelStageSchema>;
export type EvaluationSplit = z.infer<typeof EvaluationSplitSchema>;
export type CreateRetrainRunRequest = z.infer<typeof CreateRetrainRunRequestSchema>;
export type CreateRetrainRunResponse = z.infer<typeof CreateRetrainRunResponseSchema>;
export type TrainingRunResponse = z.infer<typeof TrainingRunResponseSchema>;
export type ListTrainingRunsQuery = z.infer<typeof ListTrainingRunsQuerySchema>;
export type ListTrainingRunsResponse = z.infer<typeof ListTrainingRunsResponseSchema>;
export type ModelVersionResponse = z.infer<typeof ModelVersionResponseSchema>;
export type ListModelVersionsQuery = z.infer<typeof ListModelVersionsQuerySchema>;
export type ListModelVersionsResponse = z.infer<typeof ListModelVersionsResponseSchema>;
export type ActivateModelRequest = z.infer<typeof ActivateModelRequestSchema>;
export type ModelEvaluationResponse = z.infer<typeof ModelEvaluationResponseSchema>;
export type ListModelEvaluationsQuery = z.infer<typeof ListModelEvaluationsQuerySchema>;
export type ListModelEvaluationsResponse = z.infer<
  typeof ListModelEvaluationsResponseSchema
>;
