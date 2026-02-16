import { randomUUID } from 'node:crypto';
import type {
  CreateDiscoveryRunRequest,
  CreateDiscoveryRunResponse,
  DiscoveryRunStatusResponse,
  ListDiscoveryRecordsQuery,
  ListDiscoveryRecordsResponse,
  PipelineRunStatus,
} from '@lead-flood/contracts';

import type { DiscoveryRepository } from './discovery.repository.js';

export interface DiscoveryRunJobPayload
  extends Pick<
    CreateDiscoveryRunRequest,
    'icpProfileId' | 'provider' | 'limit' | 'cursor' | 'requestedByUserId'
  > {
  runId: string;
}

export interface DiscoveryServiceDependencies {
  enqueueDiscoveryRun: (payload: DiscoveryRunJobPayload) => Promise<void>;
}

export interface DiscoveryService {
  createDiscoveryRun(input: CreateDiscoveryRunRequest): Promise<CreateDiscoveryRunResponse>;
  getDiscoveryRunStatus(runId: string): Promise<DiscoveryRunStatusResponse>;
  listDiscoveryRecords(query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse>;
}

export function buildDiscoveryService(
  repository: DiscoveryRepository,
  dependencies: DiscoveryServiceDependencies,
): DiscoveryService {
  const queuedStatus: PipelineRunStatus = 'QUEUED';

  return {
    async createDiscoveryRun(input) {
      const runId = randomUUID();
      const payload: DiscoveryRunJobPayload = {
        runId,
        icpProfileId: input.icpProfileId,
        provider: input.provider,
        limit: input.limit,
        cursor: input.cursor,
        requestedByUserId: input.requestedByUserId,
      };

      await repository.createDiscoveryRun(runId, input, payload);

      try {
        await dependencies.enqueueDiscoveryRun(payload);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to enqueue discovery.run job';
        await repository.markDiscoveryRunFailed(runId, errorMessage);
        throw error;
      }

      return {
        runId,
        status: queuedStatus,
      };
    },
    async getDiscoveryRunStatus(runId) {
      return repository.getDiscoveryRunStatus(runId);
    },
    async listDiscoveryRecords(query) {
      return repository.listDiscoveryRecords(query);
    },
  };
}
