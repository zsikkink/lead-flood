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

export interface AnalyticsService {
  getFunnel(query: FunnelQuery): Promise<FunnelResponse>;
  getScoreDistribution(query: ScoreDistributionQuery): Promise<ScoreDistributionResponse>;
  getModelMetrics(query: ModelMetricsQuery): Promise<ModelMetricsResponse>;
  getRetrainStatus(query: RetrainStatusQuery): Promise<RetrainStatusResponse>;
  recomputeRollup(input: RecomputeRollupRequest): Promise<void>;
}

export function buildAnalyticsService(repository: AnalyticsRepository): AnalyticsService {
  return {
    async getFunnel(query) {
      // TODO: merge live counters with daily rollups.
      return repository.getFunnel(query);
    },
    async getScoreDistribution(query) {
      // TODO: support distribution bucketing config.
      return repository.getScoreDistribution(query);
    },
    async getModelMetrics(query) {
      // TODO: include model version metadata in metrics.
      return repository.getModelMetrics(query);
    },
    async getRetrainStatus(query) {
      // TODO: include scheduler and backlog status.
      return repository.getRetrainStatus(query);
    },
    async recomputeRollup(input) {
      // TODO: enqueue analytics rollup recompute job.
      await repository.recomputeRollup(input);
    },
  };
}
