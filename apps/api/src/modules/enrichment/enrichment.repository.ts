import type {
  CreateEnrichmentRunRequest,
  CreateEnrichmentRunResponse,
  EnrichmentRunStatusResponse,
  ListEnrichmentRecordsQuery,
  ListEnrichmentRecordsResponse,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { EnrichmentNotImplementedError } from './enrichment.errors.js';

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

    const [total, rows] = await Promise.all([
      prisma.leadEnrichmentRecord.count({ where }),
      prisma.leadEnrichmentRecord.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

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
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
