import type {
  CreateDiscoveryRunRequest,
  CreateDiscoveryRunResponse,
  DiscoveryRunStatusResponse,
  ListDiscoveryRecordsQuery,
  ListDiscoveryRecordsResponse,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { DiscoveryNotImplementedError } from './discovery.errors.js';

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

    const [total, rows] = await Promise.all([
      prisma.leadDiscoveryRecord.count({ where }),
      prisma.leadDiscoveryRecord.findMany({
        where,
        orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

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
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
