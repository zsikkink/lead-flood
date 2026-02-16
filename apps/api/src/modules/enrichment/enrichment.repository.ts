import type {
  CreateEnrichmentRunRequest,
  CreateEnrichmentRunResponse,
  EnrichmentRunStatusResponse,
  ListEnrichmentRecordsQuery,
  ListEnrichmentRecordsResponse,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { EnrichmentNotImplementedError } from './enrichment.errors.js';

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

export interface EnrichmentRepository {
  createEnrichmentRun(input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse>;
  getEnrichmentRunStatus(runId: string): Promise<EnrichmentRunStatusResponse>;
  listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse>;
}

export class StubEnrichmentRepository implements EnrichmentRepository {
  async createEnrichmentRun(_input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse> {
    throw new EnrichmentNotImplementedError('TODO: create enrichment run persistence');
  }

  async getEnrichmentRunStatus(_runId: string): Promise<EnrichmentRunStatusResponse> {
    throw new EnrichmentNotImplementedError('TODO: get enrichment run status persistence');
  }

  async listEnrichmentRecords(_query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse> {
    throw new EnrichmentNotImplementedError('TODO: list enrichment records persistence');
  }
}

export class PrismaEnrichmentRepository implements EnrichmentRepository {
  async createEnrichmentRun(_input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse> {
    throw new EnrichmentNotImplementedError('TODO: create enrichment run persistence');
  }

  async getEnrichmentRunStatus(_runId: string): Promise<EnrichmentRunStatusResponse> {
    throw new EnrichmentNotImplementedError('TODO: get enrichment run status persistence');
  }

  async listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse> {
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
