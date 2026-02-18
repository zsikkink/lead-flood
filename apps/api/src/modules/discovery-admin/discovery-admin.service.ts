import type {
  AdminLeadDetailResponse,
  AdminListLeadsQuery,
  AdminListLeadsResponse,
  AdminListSearchTasksQuery,
  AdminListSearchTasksResponse,
  AdminSearchTaskDetailResponse,
  JobRunDetailResponse,
  JobRunListQuery,
  ListJobRunsResponse,
  RunDiscoverySeedRequest,
  RunDiscoveryTasksRequest,
  TriggerJobRunResponse,
} from '@lead-flood/contracts';

import { DiscoveryAdminNotImplementedError } from './discovery-admin.errors.js';
import type { DiscoveryAdminRepository } from './discovery-admin.repository.js';

export interface DiscoveryAdminServiceDependencies {
  triggerDiscoverySeedJob?: (input: RunDiscoverySeedRequest) => Promise<TriggerJobRunResponse>;
  triggerDiscoveryTaskRun?: (input: RunDiscoveryTasksRequest) => Promise<TriggerJobRunResponse>;
}

export interface DiscoveryAdminService {
  listLeads(query: AdminListLeadsQuery): Promise<AdminListLeadsResponse>;
  getLeadById(id: string): Promise<AdminLeadDetailResponse>;
  listSearchTasks(query: AdminListSearchTasksQuery): Promise<AdminListSearchTasksResponse>;
  getSearchTaskById(id: string): Promise<AdminSearchTaskDetailResponse>;
  triggerDiscoverySeed(input: RunDiscoverySeedRequest): Promise<TriggerJobRunResponse>;
  triggerDiscoveryTaskRun(input: RunDiscoveryTasksRequest): Promise<TriggerJobRunResponse>;
  listJobRuns(query: JobRunListQuery): Promise<ListJobRunsResponse>;
  getJobRunById(id: string): Promise<JobRunDetailResponse>;
}

export function buildDiscoveryAdminService(
  repository: DiscoveryAdminRepository,
  dependencies: DiscoveryAdminServiceDependencies,
): DiscoveryAdminService {
  return {
    async listLeads(query) {
      return repository.listLeads(query);
    },
    async getLeadById(id) {
      return repository.getLeadById(id);
    },
    async listSearchTasks(query) {
      return repository.listSearchTasks(query);
    },
    async getSearchTaskById(id) {
      return repository.getSearchTaskById(id);
    },
    async triggerDiscoverySeed(input) {
      if (!dependencies.triggerDiscoverySeedJob) {
        throw new DiscoveryAdminNotImplementedError('Discovery seed trigger is not configured');
      }
      return dependencies.triggerDiscoverySeedJob(input);
    },
    async triggerDiscoveryTaskRun(input) {
      if (!dependencies.triggerDiscoveryTaskRun) {
        throw new DiscoveryAdminNotImplementedError('Discovery task run trigger is not configured');
      }
      return dependencies.triggerDiscoveryTaskRun(input);
    },
    async listJobRuns(query) {
      return repository.listJobRuns(query);
    },
    async getJobRunById(id) {
      return repository.getJobRunById(id);
    },
  };
}
