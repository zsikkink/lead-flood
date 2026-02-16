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

import { AnalyticsNotImplementedError } from './analytics.errors.js';

export interface AnalyticsRepository {
  getFunnel(query: FunnelQuery): Promise<FunnelResponse>;
  getScoreDistribution(query: ScoreDistributionQuery): Promise<ScoreDistributionResponse>;
  getModelMetrics(query: ModelMetricsQuery): Promise<ModelMetricsResponse>;
  getRetrainStatus(query: RetrainStatusQuery): Promise<RetrainStatusResponse>;
  recomputeRollup(input: RecomputeRollupRequest): Promise<void>;
}

export class StubAnalyticsRepository implements AnalyticsRepository {
  async getFunnel(_query: FunnelQuery): Promise<FunnelResponse> {
    throw new AnalyticsNotImplementedError('TODO: get funnel analytics persistence');
  }

  async getScoreDistribution(_query: ScoreDistributionQuery): Promise<ScoreDistributionResponse> {
    throw new AnalyticsNotImplementedError('TODO: get score distribution persistence');
  }

  async getModelMetrics(_query: ModelMetricsQuery): Promise<ModelMetricsResponse> {
    throw new AnalyticsNotImplementedError('TODO: get model metrics persistence');
  }

  async getRetrainStatus(_query: RetrainStatusQuery): Promise<RetrainStatusResponse> {
    throw new AnalyticsNotImplementedError('TODO: get retrain status persistence');
  }

  async recomputeRollup(_input: RecomputeRollupRequest): Promise<void> {
    throw new AnalyticsNotImplementedError('TODO: recompute rollup trigger persistence');
  }
}
