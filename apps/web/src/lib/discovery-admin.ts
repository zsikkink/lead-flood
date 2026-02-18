import {
  AdminLeadDetailResponseSchema,
  AdminListLeadsResponseSchema,
  AdminListSearchTasksResponseSchema,
  AdminSearchTaskDetailResponseSchema,
  JobRunDetailResponseSchema,
  ListJobRunsResponseSchema,
  TriggerJobRunResponseSchema,
  type AdminListLeadsQuery,
  type AdminListSearchTasksQuery,
  type JobRunListQuery,
  type RunDiscoverySeedRequest,
  type RunDiscoveryTasksRequest,
} from '@lead-flood/contracts';

function toQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}

async function requestJson<T>({
  path,
  method = 'GET',
  body,
  schema,
}: {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  schema: { parse: (input: unknown) => T };
}): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(path, init);

  const parsedBody = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      parsedBody && typeof parsedBody === 'object' && 'error' in parsedBody
        ? String((parsedBody as { error?: unknown }).error ?? 'Request failed')
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return schema.parse(parsedBody);
}

export function queryFromLeadFilters(query: AdminListLeadsQuery): string {
  return toQuery({
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    scoreMin: query.scoreMin,
    scoreMax: query.scoreMax,
    countries: query.countries?.join(','),
    city: query.city,
    industries: query.industries?.join(','),
    hasWhatsapp: query.hasWhatsapp,
    hasInstagram: query.hasInstagram,
    acceptsOnlinePayments: query.acceptsOnlinePayments,
    recentlyActive: query.recentlyActive,
    minReviewCount: query.minReviewCount,
    minFollowerCount: query.minFollowerCount,
    from: query.from,
    to: query.to,
  });
}

export function queryFromSearchTaskFilters(query: AdminListSearchTasksQuery): string {
  return toQuery({
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    status: query.status,
    taskType: query.taskType,
    countryCode: query.countryCode,
    timeBucket: query.timeBucket,
  });
}

export function queryFromJobRunFilters(query: JobRunListQuery): string {
  return toQuery({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    jobName: query.jobName,
  });
}

export async function fetchAdminLeads(
  query: string,
) {
  return requestJson({
    path: `/api/admin/leads${query}`,
    schema: AdminListLeadsResponseSchema,
  });
}

export async function fetchAdminLeadDetail(id: string) {
  return requestJson({
    path: `/api/admin/leads/${id}`,
    schema: AdminLeadDetailResponseSchema,
  });
}

export async function fetchAdminSearchTasks(
  query: string,
) {
  return requestJson({
    path: `/api/admin/search-tasks${query}`,
    schema: AdminListSearchTasksResponseSchema,
  });
}

export async function fetchAdminSearchTaskDetail(id: string) {
  return requestJson({
    path: `/api/admin/search-tasks/${id}`,
    schema: AdminSearchTaskDetailResponseSchema,
  });
}

export async function triggerDiscoverySeed(
  payload: RunDiscoverySeedRequest,
) {
  return requestJson({
    path: '/api/admin/jobs/discovery/seed',
    method: 'POST',
    body: payload,
    schema: TriggerJobRunResponseSchema,
  });
}

export async function triggerDiscoveryRun(
  payload: RunDiscoveryTasksRequest,
) {
  return requestJson({
    path: '/api/admin/jobs/discovery/run',
    method: 'POST',
    body: payload,
    schema: TriggerJobRunResponseSchema,
  });
}

export async function fetchJobRuns(query: string) {
  return requestJson({
    path: `/api/admin/jobs/runs${query}`,
    schema: ListJobRunsResponseSchema,
  });
}

export async function fetchJobRunDetail(id: string) {
  return requestJson({
    path: `/api/admin/jobs/runs/${id}`,
    schema: JobRunDetailResponseSchema,
  });
}
