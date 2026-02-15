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
import { prisma } from '@lead-flood/db';

import { ScoringNotImplementedError } from './scoring.errors.js';

export interface ScoringRepository {
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

export class StubScoringRepository implements ScoringRepository {
  async createScoringRun(_input: CreateScoringRunRequest): Promise<CreateScoringRunResponse> {
    throw new ScoringNotImplementedError('TODO: create scoring run persistence');
  }

  async getScoringRunStatus(_runId: string): Promise<ScoringRunStatusResponse> {
    throw new ScoringNotImplementedError('TODO: get scoring run status persistence');
  }

  async listScorePredictions(_query: ListScorePredictionsQuery): Promise<ListScorePredictionsResponse> {
    throw new ScoringNotImplementedError('TODO: list score predictions persistence');
  }

  async getLatestLeadScore(_leadId: string, _query: LatestLeadScoreQuery): Promise<LatestLeadScoreResponse> {
    throw new ScoringNotImplementedError('TODO: get latest lead score persistence');
  }

  async getLatestLeadFeatureSnapshot(
    _leadId: string,
    _query: LatestLeadScoreQuery,
  ): Promise<LatestLeadFeatureSnapshotResponse> {
    throw new ScoringNotImplementedError('TODO: get latest lead feature snapshot persistence');
  }

  async getLatestLeadDeterministicScore(
    _leadId: string,
    _query: LatestLeadScoreQuery,
  ): Promise<LatestLeadDeterministicScoreResponse> {
    throw new ScoringNotImplementedError('TODO: get latest lead deterministic score persistence');
  }
}

export class PrismaScoringRepository implements ScoringRepository {
  async createScoringRun(_input: CreateScoringRunRequest): Promise<CreateScoringRunResponse> {
    throw new ScoringNotImplementedError('TODO: create scoring run persistence');
  }

  async getScoringRunStatus(_runId: string): Promise<ScoringRunStatusResponse> {
    throw new ScoringNotImplementedError('TODO: get scoring run status persistence');
  }

  async listScorePredictions(query: ListScorePredictionsQuery): Promise<ListScorePredictionsResponse> {
    const where = {
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
      ...(query.modelVersionId ? { modelVersionId: query.modelVersionId } : {}),
      ...(query.scoreBand ? { scoreBand: query.scoreBand } : {}),
      ...(query.minBlendedScore !== undefined || query.maxBlendedScore !== undefined
        ? {
            blendedScore: {
              ...(query.minBlendedScore !== undefined ? { gte: query.minBlendedScore } : {}),
              ...(query.maxBlendedScore !== undefined ? { lte: query.maxBlendedScore } : {}),
            },
          }
        : {}),
      ...(query.from || query.to
        ? {
            predictedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.leadScorePrediction.count({ where }),
      prisma.leadScorePrediction.findMany({
        where,
        orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        icpProfileId: row.icpProfileId,
        featureSnapshotId: row.featureSnapshotId,
        modelVersionId: row.modelVersionId,
        deterministicScore: row.deterministicScore,
        logisticScore: row.logisticScore,
        blendedScore: row.blendedScore,
        scoreBand: row.scoreBand,
        reasonsJson: row.reasonsJson,
        predictedAt: row.predictedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getLatestLeadScore(leadId: string, query: LatestLeadScoreQuery): Promise<LatestLeadScoreResponse> {
    const prediction = await prisma.leadScorePrediction.findFirst({
      where: {
        leadId,
        ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
      },
      orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      leadId,
      prediction: prediction
        ? {
            id: prediction.id,
            leadId: prediction.leadId,
            icpProfileId: prediction.icpProfileId,
            featureSnapshotId: prediction.featureSnapshotId,
            modelVersionId: prediction.modelVersionId,
            deterministicScore: prediction.deterministicScore,
            logisticScore: prediction.logisticScore,
            blendedScore: prediction.blendedScore,
            scoreBand: prediction.scoreBand,
            reasonsJson: prediction.reasonsJson,
            predictedAt: prediction.predictedAt.toISOString(),
            createdAt: prediction.createdAt.toISOString(),
          }
        : null,
    };
  }

  async getLatestLeadFeatureSnapshot(
    leadId: string,
    query: LatestLeadScoreQuery,
  ): Promise<LatestLeadFeatureSnapshotResponse> {
    const snapshot = await prisma.leadFeatureSnapshot.findFirst({
      where: {
        leadId,
        ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
      },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      leadId,
      icpProfileId: query.icpProfileId ?? null,
      snapshot: snapshot
        ? {
            id: snapshot.id,
            leadId: snapshot.leadId,
            icpProfileId: snapshot.icpProfileId,
            discoveryRecordId: snapshot.discoveryRecordId ?? null,
            enrichmentRecordId: snapshot.enrichmentRecordId ?? null,
            snapshotVersion: snapshot.snapshotVersion,
            sourceVersion: snapshot.sourceVersion,
            featureVectorHash: snapshot.featureVectorHash,
            featuresJson: snapshot.featuresJson,
            ruleMatchCount: snapshot.ruleMatchCount,
            hardFilterPassed: snapshot.hardFilterPassed,
            computedAt: snapshot.computedAt.toISOString(),
            createdAt: snapshot.createdAt.toISOString(),
          }
        : null,
    };
  }

  async getLatestLeadDeterministicScore(
    leadId: string,
    query: LatestLeadScoreQuery,
  ): Promise<LatestLeadDeterministicScoreResponse> {
    const prediction = await prisma.leadScorePrediction.findFirst({
      where: {
        leadId,
        ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
      },
      orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const reasonsJson =
      prediction?.reasonsJson && typeof prediction.reasonsJson === 'object'
        ? (prediction.reasonsJson as Record<string, unknown>)
        : {};
    const reasonCodes = Array.isArray(reasonsJson.reasonCodes)
      ? reasonsJson.reasonCodes.filter((value): value is string => typeof value === 'string')
      : [];
    const ruleEvaluation = Array.isArray(prediction?.ruleEvaluationJson)
      ? prediction.ruleEvaluationJson
      : [];

    return {
      leadId,
      icpProfileId: query.icpProfileId ?? null,
      predictionId: prediction?.id ?? null,
      deterministicScore: prediction?.deterministicScore ?? null,
      reasonCodes,
      ruleEvaluation,
      predictedAt: prediction?.predictedAt.toISOString() ?? null,
    };
  }
}
