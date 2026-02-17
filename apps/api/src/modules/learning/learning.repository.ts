import type {
  ActivateModelRequest,
  CreateRetrainRunRequest,
  CreateRetrainRunResponse,
  ListModelEvaluationsQuery,
  ListModelEvaluationsResponse,
  ListModelVersionsQuery,
  ListModelVersionsResponse,
  ListTrainingRunsQuery,
  ListTrainingRunsResponse,
  ModelEvaluationResponse,
  ModelVersionResponse,
  TrainingRunResponse,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { LearningNotFoundError, LearningNotImplementedError } from './learning.errors.js';

export interface LearningRepository {
  createRetrainRun(input: CreateRetrainRunRequest): Promise<CreateRetrainRunResponse>;
  listTrainingRuns(query: ListTrainingRunsQuery): Promise<ListTrainingRunsResponse>;
  getTrainingRun(trainingRunId: string): Promise<TrainingRunResponse>;
  listModelVersions(query: ListModelVersionsQuery): Promise<ListModelVersionsResponse>;
  getModelVersion(modelVersionId: string): Promise<ModelVersionResponse>;
  listModelEvaluations(
    modelVersionId: string,
    query: ListModelEvaluationsQuery,
  ): Promise<ListModelEvaluationsResponse>;
  activateModel(modelVersionId: string, input: ActivateModelRequest): Promise<ModelVersionResponse>;
}

export class StubLearningRepository implements LearningRepository {
  async createRetrainRun(_input: CreateRetrainRunRequest): Promise<CreateRetrainRunResponse> {
    throw new LearningNotImplementedError('TODO: create retrain run persistence');
  }

  async listTrainingRuns(_query: ListTrainingRunsQuery): Promise<ListTrainingRunsResponse> {
    throw new LearningNotImplementedError('TODO: list training runs persistence');
  }

  async getTrainingRun(_trainingRunId: string): Promise<TrainingRunResponse> {
    throw new LearningNotImplementedError('TODO: get training run persistence');
  }

  async listModelVersions(_query: ListModelVersionsQuery): Promise<ListModelVersionsResponse> {
    throw new LearningNotImplementedError('TODO: list model versions persistence');
  }

  async getModelVersion(_modelVersionId: string): Promise<ModelVersionResponse> {
    throw new LearningNotImplementedError('TODO: get model version persistence');
  }

  async listModelEvaluations(
    _modelVersionId: string,
    _query: ListModelEvaluationsQuery,
  ): Promise<ListModelEvaluationsResponse> {
    throw new LearningNotImplementedError('TODO: list model evaluations persistence');
  }

  async activateModel(
    _modelVersionId: string,
    _input: ActivateModelRequest,
  ): Promise<ModelVersionResponse> {
    throw new LearningNotImplementedError('TODO: activate model persistence');
  }
}

function mapTrainingRunToResponse(run: {
  id: string;
  modelType: 'LOGISTIC_REGRESSION';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  trigger: 'MANUAL' | 'SCHEDULED' | 'FEEDBACK_THRESHOLD';
  triggeredByUserId: string | null;
  configJson: unknown;
  trainingWindowStart: Date;
  trainingWindowEnd: Date;
  datasetSize: number;
  positiveCount: number;
  negativeCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TrainingRunResponse {
  return {
    id: run.id,
    modelType: run.modelType,
    status: run.status,
    trigger: run.trigger,
    triggeredByUserId: run.triggeredByUserId,
    configJson: run.configJson,
    trainingWindowStart: run.trainingWindowStart.toISOString(),
    trainingWindowEnd: run.trainingWindowEnd.toISOString(),
    datasetSize: run.datasetSize,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function mapModelVersionToResponse(version: {
  id: string;
  trainingRunId: string;
  modelType: 'LOGISTIC_REGRESSION';
  versionTag: string;
  stage: 'SHADOW' | 'ACTIVE' | 'ARCHIVED';
  featureSchemaJson: unknown;
  coefficientsJson: unknown;
  intercept: number | null;
  deterministicWeightsJson: unknown;
  artifactUri: string | null;
  checksum: string;
  trainedAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ModelVersionResponse {
  return {
    id: version.id,
    trainingRunId: version.trainingRunId,
    modelType: version.modelType,
    versionTag: version.versionTag,
    stage: version.stage,
    featureSchemaJson: version.featureSchemaJson,
    coefficientsJson: version.coefficientsJson ?? null,
    intercept: version.intercept,
    deterministicWeightsJson: version.deterministicWeightsJson,
    artifactUri: version.artifactUri,
    checksum: version.checksum,
    trainedAt: version.trainedAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString() ?? null,
    retiredAt: version.retiredAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
  };
}

function mapModelEvaluationToResponse(evaluation: {
  id: string;
  modelVersionId: string;
  trainingRunId: string;
  split: 'TRAIN' | 'VALIDATION' | 'TEST';
  sampleSize: number;
  positiveRate: number;
  auc: number;
  prAuc: number;
  precision: number;
  recall: number;
  f1: number;
  brierScore: number;
  calibrationJson: unknown;
  confusionMatrixJson: unknown;
  evaluatedAt: Date;
  createdAt: Date;
}): ModelEvaluationResponse {
  return {
    id: evaluation.id,
    modelVersionId: evaluation.modelVersionId,
    trainingRunId: evaluation.trainingRunId,
    split: evaluation.split,
    sampleSize: evaluation.sampleSize,
    positiveRate: evaluation.positiveRate,
    auc: evaluation.auc,
    prAuc: evaluation.prAuc,
    precision: evaluation.precision,
    recall: evaluation.recall,
    f1: evaluation.f1,
    brierScore: evaluation.brierScore,
    calibrationJson: evaluation.calibrationJson ?? null,
    confusionMatrixJson: evaluation.confusionMatrixJson ?? null,
    evaluatedAt: evaluation.evaluatedAt.toISOString(),
    createdAt: evaluation.createdAt.toISOString(),
  };
}

export class PrismaLearningRepository extends StubLearningRepository {
  override async createRetrainRun(input: CreateRetrainRunRequest): Promise<CreateRetrainRunResponse> {
    const now = new Date();
    const trainingWindowEnd = now;
    const trainingWindowStart = new Date(now);
    trainingWindowStart.setDate(trainingWindowStart.getDate() - input.windowDays);

    const run = await prisma.trainingRun.create({
      data: {
        trigger: input.trigger,
        triggeredByUserId: input.requestedByUserId ?? null,
        configJson: {
          windowDays: input.windowDays,
          minSamples: input.minSamples,
          activateIfPass: input.activateIfPass,
        },
        trainingWindowStart,
        trainingWindowEnd,
      },
    });

    return {
      trainingRunId: run.id,
      status: run.status,
    };
  }

  override async listTrainingRuns(query: ListTrainingRunsQuery): Promise<ListTrainingRunsResponse> {
    const where = {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.modelType !== undefined ? { modelType: query.modelType } : {}),
      ...(query.trigger !== undefined ? { trigger: query.trigger } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            createdAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.trainingRun.count({ where }),
      prisma.trainingRun.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapTrainingRunToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getTrainingRun(trainingRunId: string): Promise<TrainingRunResponse> {
    const run = await prisma.trainingRun.findUnique({
      where: { id: trainingRunId },
    });
    if (!run) {
      throw new LearningNotFoundError('Training run not found');
    }
    return mapTrainingRunToResponse(run);
  }

  override async listModelVersions(query: ListModelVersionsQuery): Promise<ListModelVersionsResponse> {
    const where = {
      ...(query.modelType !== undefined ? { modelType: query.modelType } : {}),
      ...(query.stage !== undefined ? { stage: query.stage } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.modelVersion.count({ where }),
      prisma.modelVersion.findMany({
        where,
        orderBy: [{ trainedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapModelVersionToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getModelVersion(modelVersionId: string): Promise<ModelVersionResponse> {
    const version = await prisma.modelVersion.findUnique({
      where: { id: modelVersionId },
    });
    if (!version) {
      throw new LearningNotFoundError('Model version not found');
    }
    return mapModelVersionToResponse(version);
  }

  override async listModelEvaluations(
    modelVersionId: string,
    query: ListModelEvaluationsQuery,
  ): Promise<ListModelEvaluationsResponse> {
    const where = {
      modelVersionId,
      ...(query.split !== undefined ? { split: query.split } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.modelEvaluation.count({ where }),
      prisma.modelEvaluation.findMany({
        where,
        orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapModelEvaluationToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async activateModel(
    modelVersionId: string,
    input: ActivateModelRequest,
  ): Promise<ModelVersionResponse> {
    const existing = await prisma.modelVersion.findUnique({
      where: { id: modelVersionId },
    });
    if (!existing) {
      throw new LearningNotFoundError('Model version not found');
    }

    const activated = await prisma.$transaction(async (tx) => {
      if (input.retirePreviousActive) {
        await tx.modelVersion.updateMany({
          where: {
            modelType: existing.modelType,
            stage: 'ACTIVE',
            id: { not: modelVersionId },
          },
          data: {
            stage: 'ARCHIVED',
            retiredAt: new Date(),
          },
        });
      }

      return tx.modelVersion.update({
        where: { id: modelVersionId },
        data: {
          stage: 'ACTIVE',
          activatedAt: new Date(),
        },
      });
    });

    return mapModelVersionToResponse(activated);
  }
}
