import { randomUUID } from 'node:crypto';

import type {
  CreateEnrichmentRunRequest,
  CreateEnrichmentRunResponse,
  EnrichmentRunStatusResponse,
  ListEnrichmentRecordsQuery,
  ListEnrichmentRecordsResponse,
  PipelineRunStatus,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { Prisma } from '@lead-flood/db';

import { EnrichmentNotImplementedError, EnrichmentRunNotFoundError } from './enrichment.errors.js';

const ENRICHMENT_RUN_JOB_TYPE = 'enrichment.run';

interface EnrichmentRunProgress {
  totalItems: number;
  processedItems: number;
  failedItems: number;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return 0;
}

function readRunProgress(result: unknown): EnrichmentRunProgress {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
    };
  }

  const payload = result as Record<string, unknown>;
  return {
    totalItems: toCount(payload.totalItems),
    processedItems: toCount(payload.processedItems),
    failedItems: toCount(payload.failedItems),
  };
}

function mapJobStatusToPipelineStatus(
  status: 'queued' | 'running' | 'completed' | 'failed',
  failedItems: number,
): PipelineRunStatus {
  switch (status) {
    case 'queued':
      return 'QUEUED';
    case 'running':
      return 'RUNNING';
    case 'failed':
      return 'FAILED';
    case 'completed':
    default:
      return failedItems > 0 ? 'PARTIAL' : 'SUCCEEDED';
  }
}

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

export interface EnrichmentRepository {
  createEnrichmentRun(input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse>;
  markEnrichmentRunFailed(runId: string, errorMessage: string): Promise<void>;
  getEnrichmentRunStatus(runId: string): Promise<EnrichmentRunStatusResponse>;
  listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse>;
}

export class StubEnrichmentRepository implements EnrichmentRepository {
  async createEnrichmentRun(_input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse> {
    throw new EnrichmentNotImplementedError('TODO: create enrichment run persistence');
  }

  async markEnrichmentRunFailed(_runId: string, _errorMessage: string): Promise<void> {
    throw new EnrichmentNotImplementedError('TODO: mark enrichment run failed persistence');
  }

  async getEnrichmentRunStatus(_runId: string): Promise<EnrichmentRunStatusResponse> {
    throw new EnrichmentNotImplementedError('TODO: get enrichment run status persistence');
  }

  async listEnrichmentRecords(_query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse> {
    throw new EnrichmentNotImplementedError('TODO: list enrichment records persistence');
  }
}

export class PrismaEnrichmentRepository extends StubEnrichmentRepository {
  override async createEnrichmentRun(input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse> {
    const runId = randomUUID();

    await prisma.jobExecution.create({
      data: {
        id: runId,
        type: ENRICHMENT_RUN_JOB_TYPE,
        status: 'queued',
        attempts: 0,
        payload: toInputJson(input),
        result: toInputJson({
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
        }),
        error: null,
      },
    });

    return { runId, status: 'QUEUED' };
  }

  override async markEnrichmentRunFailed(runId: string, errorMessage: string): Promise<void> {
    await prisma.jobExecution.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: errorMessage,
        finishedAt: new Date(),
      },
    });
  }

  override async getEnrichmentRunStatus(runId: string): Promise<EnrichmentRunStatusResponse> {
    const run = await prisma.jobExecution.findFirst({
      where: {
        id: runId,
        type: ENRICHMENT_RUN_JOB_TYPE,
      },
    });

    if (!run) {
      throw new EnrichmentRunNotFoundError();
    }

    const progress = readRunProgress(run.result);
    const status = mapJobStatusToPipelineStatus(run.status, progress.failedItems);

    return {
      runId: run.id,
      runType: 'ENRICHMENT',
      status,
      totalItems: progress.totalItems,
      processedItems: progress.processedItems,
      failedItems: progress.failedItems,
      startedAt: run.startedAt?.toISOString() ?? null,
      endedAt: run.finishedAt?.toISOString() ?? null,
      errorMessage: run.error,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  override async listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse> {
    const where = {
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows, icpIds, qualityRows] = await Promise.all([
      prisma.leadEnrichmentRecord.count({ where }),
      prisma.leadEnrichmentRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      query.includeQualityMetrics
        ? prisma.leadDiscoveryRecord.findMany({
            where: {
              ...(query.leadId ? { leadId: query.leadId } : {}),
              ...(query.from || query.to
                ? {
                    discoveredAt: {
                      ...(query.from ? { gte: new Date(query.from) } : {}),
                      ...(query.to ? { lte: new Date(query.to) } : {}),
                    },
                  }
                : {}),
            },
            select: {
              icpProfileId: true,
            },
          })
        : Promise.resolve([]),
      Promise.resolve([] as Array<{
        discoveredCount: number;
        validEmailCount: number;
        validDomainCount: number;
        industryMatchRate: number;
        geoMatchRate: number;
      }>),
    ]);

    let computedQualityRows = qualityRows;
    if (query.includeQualityMetrics) {
      const uniqueIcpIds = Array.from(new Set(icpIds.map((row) => row.icpProfileId)));
      computedQualityRows =
        uniqueIcpIds.length === 0
          ? []
          : await prisma.analyticsDailyRollup.findMany({
              where: {
                icpProfileId: {
                  in: uniqueIcpIds,
                },
                ...(query.from || query.to
                  ? {
                      day: {
                        ...(query.from ? { gte: toDayStart(query.from) } : {}),
                        ...(query.to ? { lte: toDayStart(query.to) } : {}),
                      },
                    }
                  : {}),
              },
              select: {
                discoveredCount: true,
                validEmailCount: true,
                validDomainCount: true,
                industryMatchRate: true,
                geoMatchRate: true,
              },
            });
    }

    const qualityDenominator = computedQualityRows.reduce((sum, row) => sum + row.discoveredCount, 0);
    const qualityMetrics = query.includeQualityMetrics
      ? {
          validEmailCount: computedQualityRows.reduce((sum, row) => sum + row.validEmailCount, 0),
          validDomainCount: computedQualityRows.reduce((sum, row) => sum + row.validDomainCount, 0),
          industryMatchRate:
            qualityDenominator > 0
              ? Number(
                  (
                    computedQualityRows.reduce(
                      (sum, row) => sum + row.industryMatchRate * row.discoveredCount,
                      0,
                    ) / qualityDenominator
                  ).toFixed(6),
                )
              : 0,
          geoMatchRate:
            qualityDenominator > 0
              ? Number(
                  (
                    computedQualityRows.reduce(
                      (sum, row) => sum + row.geoMatchRate * row.discoveredCount,
                      0,
                    ) / qualityDenominator
                  ).toFixed(6),
                )
              : 0,
        }
      : undefined;

    return {
      items: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        provider: row.provider,
        status: row.status,
        attempt: row.attempt,
        providerRecordId: row.providerRecordId,
        normalizedPayload: row.normalizedPayload,
        rawPayload: row.rawPayload,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        enrichedAt: row.enrichedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      qualityMetrics,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
