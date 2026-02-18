import type {
  FunnelQuery,
  FunnelResponse,
  ModelMetricsQuery,
  ModelMetricsResponse,
  RecomputeRollupRequest,
  RetrainStatusQuery,
  RetrainStatusResponse,
  ScoreDistributionQuery,
  ScoreDistributionResponse,
} from '@lead-flood/contracts';

import type { AnalyticsRepository } from './analytics.repository.js';

export interface AnalyticsRollupJobPayload {
  runId: string;
  day: string;
  icpProfileId?: string | undefined;
  fullRecompute?: boolean | undefined;
  requestedByUserId?: string | undefined;
  correlationId?: string | undefined;
}

export interface AnalyticsServiceDependencies {
  enqueueAnalyticsRollup?: ((payload: AnalyticsRollupJobPayload) => Promise<void>) | undefined;
}

export interface AnalyticsService {
  getFunnel(query: FunnelQuery): Promise<FunnelResponse>;
  getScoreDistribution(query: ScoreDistributionQuery): Promise<ScoreDistributionResponse>;
  getModelMetrics(query: ModelMetricsQuery): Promise<ModelMetricsResponse>;
  getRetrainStatus(query: RetrainStatusQuery): Promise<RetrainStatusResponse>;
  recomputeRollup(input: RecomputeRollupRequest): Promise<void>;
}

export function buildAnalyticsService(
  repository: AnalyticsRepository,
  dependencies?: AnalyticsServiceDependencies,
): AnalyticsService {
  return {
    async getFunnel(query) {
      return repository.getFunnel(query);
    },
    async getScoreDistribution(query) {
      return repository.getScoreDistribution(query);
    },
    async getModelMetrics(query) {
      return repository.getModelMetrics(query);
    },
    async getRetrainStatus(query) {
      return repository.getRetrainStatus(query);
    },
    async recomputeRollup(input) {
      if (dependencies?.enqueueAnalyticsRollup) {
        const runId = `rollup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await dependencies.enqueueAnalyticsRollup({
          runId,
          day: input.day,
          icpProfileId: input.icpProfileId,
          fullRecompute: input.fullRecompute,
          requestedByUserId: input.requestedByUserId ?? undefined,
        });
        return;
      }
      await repository.recomputeRollup(input);
    },
  };
}
