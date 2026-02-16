import type {
  CreateEnrichmentRunRequest,
  CreateEnrichmentRunResponse,
  EnrichmentRunStatusResponse,
  ListEnrichmentRecordsQuery,
  ListEnrichmentRecordsResponse,
} from '@lead-flood/contracts';

import type { EnrichmentRepository } from './enrichment.repository.js';

export interface EnrichmentService {
  createEnrichmentRun(input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse>;
  getEnrichmentRunStatus(runId: string): Promise<EnrichmentRunStatusResponse>;
  listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse>;
}

export function buildEnrichmentService(repository: EnrichmentRepository): EnrichmentService {
  return {
    async createEnrichmentRun(input) {
      // TODO: enqueue enrichment.run and track progress.
      return repository.createEnrichmentRun(input);
    },
    async getEnrichmentRunStatus(runId) {
      // TODO: include provider health context.
      return repository.getEnrichmentRunStatus(runId);
    },
    async listEnrichmentRecords(query) {
      // TODO: include enrichment freshness indicators.
      return repository.listEnrichmentRecords(query);
    },
  };
}
