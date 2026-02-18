import { prisma } from '@lead-flood/db';
import type { Prisma } from '@lead-flood/db';
import type {
  CreateDiscoveryRunRequest,
  DiscoveryRunStatusResponse,
  ListDiscoveryRecordsQuery,
  ListDiscoveryRecordsResponse,
  PipelineRunStatus,
} from '@lead-flood/contracts';

import { DiscoveryNotImplementedError, DiscoveryRunNotFoundError } from './discovery.errors.js';
import type { DiscoveryRunJobPayload } from './discovery.service.js';

const DISCOVERY_RUN_JOB_TYPE = 'discovery.run';

interface DiscoveryRunProgress {
  totalItems: number;
  processedItems: number;
  failedItems: number;
}

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
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

function readRunProgress(result: unknown): DiscoveryRunProgress {
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

export interface DiscoveryRepository {
  createDiscoveryRun(
    runId: string,
    input: CreateDiscoveryRunRequest,
    payload: DiscoveryRunJobPayload,
  ): Promise<void>;
  markDiscoveryRunFailed(runId: string, message: string): Promise<void>;
  getDiscoveryRunStatus(runId: string): Promise<DiscoveryRunStatusResponse>;
  listDiscoveryRecords(query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse>;
}

export class StubDiscoveryRepository implements DiscoveryRepository {
  async createDiscoveryRun(
    _runId: string,
    _input: CreateDiscoveryRunRequest,
    _payload: DiscoveryRunJobPayload,
  ): Promise<void> {
    throw new DiscoveryNotImplementedError('TODO: create discovery run persistence');
  }

  async markDiscoveryRunFailed(_runId: string, _message: string): Promise<void> {
    throw new DiscoveryNotImplementedError('TODO: mark discovery run failed persistence');
  }

  async getDiscoveryRunStatus(_runId: string): Promise<DiscoveryRunStatusResponse> {
    throw new DiscoveryNotImplementedError('TODO: get discovery run status persistence');
  }

  async listDiscoveryRecords(_query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse> {
    throw new DiscoveryNotImplementedError('TODO: list discovery records persistence');
  }
}

export class PrismaDiscoveryRepository implements DiscoveryRepository {
  async createDiscoveryRun(
    runId: string,
    _input: CreateDiscoveryRunRequest,
    payload: DiscoveryRunJobPayload,
  ): Promise<void> {
    await prisma.jobExecution.create({
      data: {
        id: runId,
        type: DISCOVERY_RUN_JOB_TYPE,
        status: 'queued',
        attempts: 0,
        payload: toInputJson(payload),
        result: toInputJson({
          totalItems: 0,
          processedItems: 0,
          failedItems: 0,
        }),
        error: null,
      },
    });
  }

  async markDiscoveryRunFailed(runId: string, message: string): Promise<void> {
    await prisma.jobExecution.update({
      where: { id: runId },
      data: {
        status: 'failed',
        error: message,
        finishedAt: new Date(),
      },
    });
  }

  async getDiscoveryRunStatus(runId: string): Promise<DiscoveryRunStatusResponse> {
    const run = await prisma.jobExecution.findFirst({
      where: {
        id: runId,
        type: DISCOVERY_RUN_JOB_TYPE,
      },
    });

    if (!run) {
      throw new DiscoveryRunNotFoundError();
    }

    const progress = readRunProgress(run.result);
    const status = mapJobStatusToPipelineStatus(run.status, progress.failedItems);

    return {
      runId: run.id,
      runType: 'DISCOVERY',
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

  async listDiscoveryRecords(query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse> {
    const where = {
      ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            discoveredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows, qualityRows] = await Promise.all([
      prisma.leadDiscoveryRecord.count({ where }),
      prisma.leadDiscoveryRecord.findMany({
        where,
        orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      query.includeQualityMetrics
        ? prisma.analyticsDailyRollup.findMany({
            where: {
              ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
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
          })
        : Promise.resolve([]),
    ]);

    const qualityDenominator = qualityRows.reduce((sum, row) => sum + row.discoveredCount, 0);
    const qualityMetrics = query.includeQualityMetrics
      ? {
          validEmailCount: qualityRows.reduce((sum, row) => sum + row.validEmailCount, 0),
          validDomainCount: qualityRows.reduce((sum, row) => sum + row.validDomainCount, 0),
          industryMatchRate:
            qualityDenominator > 0
              ? Number(
                  (
                    qualityRows.reduce(
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
                    qualityRows.reduce((sum, row) => sum + row.geoMatchRate * row.discoveredCount, 0) /
                    qualityDenominator
                  ).toFixed(6),
                )
              : 0,
        }
      : undefined;

    return {
      items: rows.map((row) => ({
        id: row.id,
        leadId: row.leadId,
        icpProfileId: row.icpProfileId,
        provider: row.provider,
        providerSource: row.providerSource,
        providerConfidence: row.providerConfidence,
        providerRecordId: row.providerRecordId,
        providerCursor: row.providerCursor,
        queryHash: row.queryHash,
        status: row.status,
        rawPayload: row.rawPayload,
        provenanceJson: row.provenanceJson,
        errorMessage: row.errorMessage,
        discoveredAt: row.discoveredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      qualityMetrics,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
