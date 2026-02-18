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

export interface ScoringRunJobPayload {
  runId: string;
  mode?: string | undefined;
  icpProfileId?: string | undefined;
  leadIds?: string[] | undefined;
  modelVersionId?: string | undefined;
  requestedByUserId?: string | undefined;
}

export interface ScoringServiceDependencies {
  enqueueScoringRun: (payload: ScoringRunJobPayload) => Promise<void>;
}

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

export function buildScoringService(
  repository: ScoringRepository,
  dependencies: ScoringServiceDependencies,
): ScoringService {
  return {
    async createScoringRun(input) {
      const result = await repository.createScoringRun(input);

      const payload: ScoringRunJobPayload = {
        runId: result.runId,
        mode: input.mode,
        icpProfileId: input.icpProfileId,
        leadIds: input.leadIds,
        modelVersionId: input.modelVersionId,
        requestedByUserId: input.requestedByUserId,
      };

      try {
        await dependencies.enqueueScoringRun(payload);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to enqueue scoring.compute job';
        await repository.markScoringRunFailed(result.runId, errorMessage);
        throw error;
      }

      return result;
    },
    async getScoringRunStatus(runId) {
      return repository.getScoringRunStatus(runId);
    },
    async listScorePredictions(query) {
      return repository.listScorePredictions(query);
    },
    async getLatestLeadScore(leadId, query) {
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
