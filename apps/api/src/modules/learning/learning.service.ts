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
  ModelVersionResponse,
  TrainingRunResponse,
} from '@lead-flood/contracts';

import type { LearningRepository } from './learning.repository.js';

export interface LearningService {
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

export function buildLearningService(repository: LearningRepository): LearningService {
  return {
    async createRetrainRun(input) {
      // TODO: validate minimum sample constraints before scheduling.
      return repository.createRetrainRun(input);
    },
    async listTrainingRuns(query) {
      // TODO: add default ordering by createdAt desc.
      return repository.listTrainingRuns(query);
    },
    async getTrainingRun(trainingRunId) {
      // TODO: include downstream scoring trigger details.
      return repository.getTrainingRun(trainingRunId);
    },
    async listModelVersions(query) {
      // TODO: include activation eligibility metadata.
      return repository.listModelVersions(query);
    },
    async getModelVersion(modelVersionId) {
      // TODO: include model artifact metadata.
      return repository.getModelVersion(modelVersionId);
    },
    async listModelEvaluations(modelVersionId, query) {
      // TODO: include baseline comparison metrics.
      return repository.listModelEvaluations(modelVersionId, query);
    },
    async activateModel(modelVersionId, input) {
      // TODO: ensure only one active model per model type.
      return repository.activateModel(modelVersionId, input);
    },
  };
}
