import type {
  CreateDiscoveryRunRequest,
  CreateDiscoveryRunResponse,
  DiscoveryRunStatusResponse,
  ListDiscoveryRecordsQuery,
  ListDiscoveryRecordsResponse,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { DiscoveryNotImplementedError } from './discovery.errors.js';

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

export interface DiscoveryRepository {
  createDiscoveryRun(input: CreateDiscoveryRunRequest): Promise<CreateDiscoveryRunResponse>;
  getDiscoveryRunStatus(runId: string): Promise<DiscoveryRunStatusResponse>;
  listDiscoveryRecords(query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse>;
}

export class StubDiscoveryRepository implements DiscoveryRepository {
  async createDiscoveryRun(_input: CreateDiscoveryRunRequest): Promise<CreateDiscoveryRunResponse> {
    throw new DiscoveryNotImplementedError('TODO: create discovery run persistence');
  }

  async getDiscoveryRunStatus(_runId: string): Promise<DiscoveryRunStatusResponse> {
    throw new DiscoveryNotImplementedError('TODO: get discovery run status persistence');
  }

  async listDiscoveryRecords(_query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse> {
    throw new DiscoveryNotImplementedError('TODO: list discovery records persistence');
  }
}

export class PrismaDiscoveryRepository implements DiscoveryRepository {
  async createDiscoveryRun(_input: CreateDiscoveryRunRequest): Promise<CreateDiscoveryRunResponse> {
    throw new DiscoveryNotImplementedError('TODO: create discovery run persistence');
  }

  async getDiscoveryRunStatus(_runId: string): Promise<DiscoveryRunStatusResponse> {
    throw new DiscoveryNotImplementedError('TODO: get discovery run status persistence');
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
        providerRecordId: row.providerRecordId,
        providerCursor: row.providerCursor,
        queryHash: row.queryHash,
        status: row.status,
        rawPayload: row.rawPayload,
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
