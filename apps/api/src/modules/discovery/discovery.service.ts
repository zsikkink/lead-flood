import type {
  CreateDiscoveryRunRequest,
  CreateDiscoveryRunResponse,
  DiscoveryRunStatusResponse,
  ListDiscoveryRecordsQuery,
  ListDiscoveryRecordsResponse,
} from '@lead-flood/contracts';

import type { DiscoveryRepository } from './discovery.repository.js';

export interface DiscoveryService {
  createDiscoveryRun(input: CreateDiscoveryRunRequest): Promise<CreateDiscoveryRunResponse>;
  getDiscoveryRunStatus(runId: string): Promise<DiscoveryRunStatusResponse>;
  listDiscoveryRecords(query: ListDiscoveryRecordsQuery): Promise<ListDiscoveryRecordsResponse>;
}

export function buildDiscoveryService(repository: DiscoveryRepository): DiscoveryService {
  return {
    async createDiscoveryRun(input) {
      // TODO: enqueue discovery.run and persist pipeline run metadata.
      return repository.createDiscoveryRun(input);
    },
    async getDiscoveryRunStatus(runId) {
      // TODO: enrich run status with queue telemetry.
      return repository.getDiscoveryRunStatus(runId);
    },
    async listDiscoveryRecords(query) {
      // TODO: add default time window constraints.
      return repository.listDiscoveryRecords(query);
    },
  };
}
