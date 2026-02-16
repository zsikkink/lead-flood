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

import { LearningNotImplementedError } from './learning.errors.js';

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
