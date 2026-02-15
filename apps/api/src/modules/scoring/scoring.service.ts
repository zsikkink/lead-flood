import type {
  CreateScoringRunRequest,
  CreateScoringRunResponse,
  LatestLeadDeterministicScoreResponse,
  LatestLeadFeatureSnapshotResponse,
  LatestLeadScoreResponse,
  LatestLeadScoreQuery,
  ListScorePredictionsQuery,
  ListScorePredictionsResponse,
  ScoringRunStatusResponse,
} from '@lead-flood/contracts';

import type { ScoringRepository } from './scoring.repository.js';

export interface ScoringService {
  createScoringRun(input: CreateScoringRunRequest): Promise<CreateScoringRunResponse>;
  getScoringRunStatus(runId: string): Promise<ScoringRunStatusResponse>;
  listScorePredictions(query: ListScorePredictionsQuery): Promise<ListScorePredictionsResponse>;
  getLatestLeadScore(leadId: string, query: LatestLeadScoreQuery): Promise<LatestLeadScoreResponse>;
  getLatestLeadFeatureSnapshot(
    leadId: string,
    query: LatestLeadScoreQuery,
  ): Promise<LatestLeadFeatureSnapshotResponse>;
  getLatestLeadDeterministicScore(
    leadId: string,
    query: LatestLeadScoreQuery,
  ): Promise<LatestLeadDeterministicScoreResponse>;
}

export function buildScoringService(repository: ScoringRepository): ScoringService {
  return {
    async createScoringRun(input) {
      // TODO: validate active model availability before enqueueing.
      return repository.createScoringRun(input);
    },
    async getScoringRunStatus(runId) {
      // TODO: include model version metadata.
      return repository.getScoringRunStatus(runId);
    },
    async listScorePredictions(query) {
      // TODO: add default sorting by predictedAt desc.
      return repository.listScorePredictions(query);
    },
    async getLatestLeadScore(leadId, query) {
      // TODO: support fallback to deterministic score.
      return repository.getLatestLeadScore(leadId, query);
    },
    async getLatestLeadFeatureSnapshot(leadId, query) {
      return repository.getLatestLeadFeatureSnapshot(leadId, query);
    },
    async getLatestLeadDeterministicScore(leadId, query) {
      return repository.getLatestLeadDeterministicScore(leadId, query);
    },
  };
}
