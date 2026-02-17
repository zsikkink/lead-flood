import type {
  CreateEnrichmentRunRequest,
  CreateEnrichmentRunResponse,
  EnrichmentRunStatusResponse,
  ListEnrichmentRecordsQuery,
  ListEnrichmentRecordsResponse,
} from '@lead-flood/contracts';

import type { EnrichmentRepository } from './enrichment.repository.js';

export interface EnrichmentRunJobPayload {
  runId: string;
  leadIds?: string[] | undefined;
  icpProfileId?: string | undefined;
  provider?: string | undefined;
  requestedByUserId?: string | undefined;
}

export interface EnrichmentServiceDependencies {
  enqueueEnrichmentRun: (payload: EnrichmentRunJobPayload) => Promise<void>;
}

export interface EnrichmentService {
  createEnrichmentRun(input: CreateEnrichmentRunRequest): Promise<CreateEnrichmentRunResponse>;
  getEnrichmentRunStatus(runId: string): Promise<EnrichmentRunStatusResponse>;
  listEnrichmentRecords(query: ListEnrichmentRecordsQuery): Promise<ListEnrichmentRecordsResponse>;
}

export function buildEnrichmentService(
  repository: EnrichmentRepository,
  dependencies: EnrichmentServiceDependencies,
): EnrichmentService {
  return {
    async createEnrichmentRun(input) {
      const result = await repository.createEnrichmentRun(input);

      const payload: EnrichmentRunJobPayload = {
        runId: result.runId,
        leadIds: input.leadIds,
        icpProfileId: input.icpProfileId,
        provider: input.provider,
        requestedByUserId: input.requestedByUserId,
      };

      try {
        await dependencies.enqueueEnrichmentRun(payload);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to enqueue enrichment.run job';
        await repository.markEnrichmentRunFailed(result.runId, errorMessage);
        throw error;
      }

      return result;
    },
    async getEnrichmentRunStatus(runId) {
      return repository.getEnrichmentRunStatus(runId);
    },
    async listEnrichmentRecords(query) {
      return repository.listEnrichmentRecords(query);
    },
  };
}
