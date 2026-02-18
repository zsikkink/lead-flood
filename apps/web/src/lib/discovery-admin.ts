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

const ADMIN_KEY_STORAGE_KEY = 'lead-flood.admin-api-key';

export function readStoredAdminApiKey(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) ?? '';
}

export function writeStoredAdminApiKey(value: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, value);
}

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
  baseUrl,
  path,
  adminKey,
  method = 'GET',
  body,
  schema,
}: {
  baseUrl: string;
  path: string;
  adminKey: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  schema: { parse: (input: unknown) => T };
}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

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
  baseUrl: string,
  adminKey: string,
  query: string,
) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/leads${query}`,
    adminKey,
    schema: AdminListLeadsResponseSchema,
  });
}

export async function fetchAdminLeadDetail(baseUrl: string, adminKey: string, id: string) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/leads/${id}`,
    adminKey,
    schema: AdminLeadDetailResponseSchema,
  });
}

export async function fetchAdminSearchTasks(
  baseUrl: string,
  adminKey: string,
  query: string,
) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/search-tasks${query}`,
    adminKey,
    schema: AdminListSearchTasksResponseSchema,
  });
}

export async function fetchAdminSearchTaskDetail(baseUrl: string, adminKey: string, id: string) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/search-tasks/${id}`,
    adminKey,
    schema: AdminSearchTaskDetailResponseSchema,
  });
}

export async function triggerDiscoverySeed(
  baseUrl: string,
  adminKey: string,
  payload: RunDiscoverySeedRequest,
) {
  return requestJson({
    baseUrl,
    path: '/v1/admin/jobs/discovery/seed',
    adminKey,
    method: 'POST',
    body: payload,
    schema: TriggerJobRunResponseSchema,
  });
}

export async function triggerDiscoveryRun(
  baseUrl: string,
  adminKey: string,
  payload: RunDiscoveryTasksRequest,
) {
  return requestJson({
    baseUrl,
    path: '/v1/admin/jobs/discovery/run',
    adminKey,
    method: 'POST',
    body: payload,
    schema: TriggerJobRunResponseSchema,
  });
}

export async function fetchJobRuns(baseUrl: string, adminKey: string, query: string) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/jobs/runs${query}`,
    adminKey,
    schema: ListJobRunsResponseSchema,
  });
}

export async function fetchJobRunDetail(baseUrl: string, adminKey: string, id: string) {
  return requestJson({
    baseUrl,
    path: `/v1/admin/jobs/runs/${id}`,
    adminKey,
    schema: JobRunDetailResponseSchema,
  });
}
