import {
  AdminLeadDetailResponseSchema,
  AdminListLeadsQuerySchema,
  AdminListLeadsResponseSchema,
  AdminListSearchTasksQuerySchema,
  AdminListSearchTasksResponseSchema,
  AdminSearchTaskDetailResponseSchema,
  JobRunDetailResponseSchema,
  JobRunListQuerySchema,
  ListJobRunsResponseSchema,
  type AdminLeadDetailResponse,
  type AdminLeadRow,
  type AdminListLeadsQuery,
  type AdminListLeadsResponse,
  type AdminListSearchTasksQuery,
  type AdminListSearchTasksResponse,
  type AdminSearchTaskDetailResponse,
  type JobRunDetailResponse,
  type JobRunListQuery,
  type ListJobRunsResponse,
  type RunDiscoverySeedRequest,
  type RunDiscoveryTasksRequest,
} from '@lead-flood/contracts';

import { getSupabaseBrowserClient } from './supabase-client.js';

export type JobRequestType = 'DISCOVERY_SEED' | 'DISCOVERY_RUN';
export type JobRequestStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';

export interface JobRequestRow {
  id: number;
  requestType: JobRequestType;
  status: JobRequestStatus;
  paramsJson: unknown;
  requestedBy: string;
  claimedBy: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorText: string | null;
  jobRunId: string | null;
  idempotencyKey: string | null;
}

export interface JobRequestListQuery {
  page: number;
  pageSize: number;
  status?: JobRequestStatus;
  requestType?: JobRequestType;
}

export interface JobRequestListResponse {
  items: JobRequestRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TriggerJobRequestResponse {
  jobRequestId: number;
  status: JobRequestStatus;
  requestType: JobRequestType;
  jobRunId: string | null;
}

const SCORE_WEIGHTS = {
  hasWhatsapp: 0.2,
  hasInstagram: 0.1,
  acceptsOnlinePayments: 0.15,
  reviewCount: 0.2,
  followerCount: 0.1,
  physicalAddressPresent: 0.1,
  recentActivity: 0.15,
} as const;

type ScoreTier = 'LOW' | 'MEDIUM' | 'HIGH';

function toTier(score: number): ScoreTier {
  if (score >= 0.67) {
    return 'HIGH';
  }
  if (score >= 0.34) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function round(value: number): number {
  return Number(value.toFixed(6));
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

function parseQueryString(query: string): Record<string, string> {
  const search = query.startsWith('?') ? query.slice(1) : query;
  return Object.fromEntries(new URLSearchParams(search));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapLeadRow(row: {
  id: string;
  name: string;
  country_code: string;
  city: string | null;
  category: string | null;
  deterministic_score: number;
  score_band: ScoreTier | null;
  has_whatsapp: boolean;
  has_instagram: boolean;
  accepts_online_payments: boolean;
  review_count: number | null;
  follower_count: number | null;
  physical_address_present: boolean;
  recent_activity: boolean;
  website_domain: string | null;
  phone_e164: string | null;
  instagram_handle: string | null;
  created_at: string;
  updated_at: string;
}): AdminLeadRow {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    city: row.city,
    category: row.category,
    score: row.deterministic_score,
    scoreTier: row.score_band ?? toTier(row.deterministic_score),
    hasWhatsapp: row.has_whatsapp,
    hasInstagram: row.has_instagram,
    acceptsOnlinePayments: row.accepts_online_payments,
    reviewCount: row.review_count,
    followerCount: row.follower_count,
    physicalAddressPresent: row.physical_address_present,
    recentActivity: row.recent_activity,
    websiteDomain: row.website_domain,
    phoneE164: row.phone_e164,
    instagramHandle: row.instagram_handle,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function computeBusinessScore(row: {
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  acceptsOnlinePayments: boolean;
  reviewCount: number | null;
  followerCount: number | null;
  physicalAddressPresent: boolean;
  recentActivity: boolean;
}) {
  const reviewCount = row.reviewCount ?? 0;
  const followerCount = row.followerCount ?? 0;

  const contributions = [
    {
      code: 'HAS_WHATSAPP',
      label: 'Has WhatsApp',
      value: row.hasWhatsapp,
      weight: SCORE_WEIGHTS.hasWhatsapp,
      contribution: row.hasWhatsapp ? SCORE_WEIGHTS.hasWhatsapp : 0,
    },
    {
      code: 'HAS_INSTAGRAM',
      label: 'Has Instagram',
      value: row.hasInstagram,
      weight: SCORE_WEIGHTS.hasInstagram,
      contribution: row.hasInstagram ? SCORE_WEIGHTS.hasInstagram : 0,
    },
    {
      code: 'ACCEPTS_ONLINE_PAYMENTS',
      label: 'Accepts Online Payments',
      value: row.acceptsOnlinePayments,
      weight: SCORE_WEIGHTS.acceptsOnlinePayments,
      contribution: row.acceptsOnlinePayments ? SCORE_WEIGHTS.acceptsOnlinePayments : 0,
    },
    {
      code: 'REVIEW_COUNT',
      label: 'Review Count',
      value: reviewCount,
      weight: SCORE_WEIGHTS.reviewCount,
      contribution: Math.min(reviewCount / 200, 1) * SCORE_WEIGHTS.reviewCount,
    },
    {
      code: 'FOLLOWER_COUNT',
      label: 'Follower Count',
      value: followerCount,
      weight: SCORE_WEIGHTS.followerCount,
      contribution: Math.min(followerCount / 5000, 1) * SCORE_WEIGHTS.followerCount,
    },
    {
      code: 'PHYSICAL_ADDRESS_PRESENT',
      label: 'Physical Address Present',
      value: row.physicalAddressPresent,
      weight: SCORE_WEIGHTS.physicalAddressPresent,
      contribution: row.physicalAddressPresent ? SCORE_WEIGHTS.physicalAddressPresent : 0,
    },
    {
      code: 'RECENT_ACTIVITY',
      label: 'Recent Activity',
      value: row.recentActivity,
      weight: SCORE_WEIGHTS.recentActivity,
      contribution: row.recentActivity ? SCORE_WEIGHTS.recentActivity : 0,
    },
  ].map((entry) => ({
    ...entry,
    contribution: round(entry.contribution),
  }));

  const total = round(contributions.reduce((sum, entry) => sum + entry.contribution, 0));
  return {
    total,
    tier: toTier(total),
    contributions,
  };
}

function toStableJsonString(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => toStableJsonString(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${toStableJsonString(entry)}`);

  return `{${entries.join(',')}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function buildIdempotencyKey(requestType: JobRequestType, params: unknown): string {
  return `web:${requestType}:${hashString(toStableJsonString(params))}`;
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

export function queryFromJobRequestFilters(query: JobRequestListQuery): string {
  return toQuery({
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    requestType: query.requestType,
  });
}

export async function fetchAdminLeads(query: string): Promise<AdminListLeadsResponse> {
  const supabase = getSupabaseBrowserClient();
  const parsed = AdminListLeadsQuerySchema.parse(parseQueryString(query));
  const fromIndex = (parsed.page - 1) * parsed.pageSize;
  const toIndex = fromIndex + parsed.pageSize - 1;

  let builder = supabase
    .from('businesses')
    .select(
      'id,name,country_code,city,category,deterministic_score,score_band,has_whatsapp,has_instagram,accepts_online_payments,review_count,follower_count,physical_address_present,recent_activity,website_domain,phone_e164,instagram_handle,created_at,updated_at',
      { count: 'exact' },
    )
    .range(fromIndex, toIndex);

  if (parsed.scoreMin !== undefined) {
    builder = builder.gte('deterministic_score', parsed.scoreMin);
  }
  if (parsed.scoreMax !== undefined) {
    builder = builder.lte('deterministic_score', parsed.scoreMax);
  }
  if (parsed.countries && parsed.countries.length > 0) {
    builder = builder.in(
      'country_code',
      parsed.countries.map((country) => country.toUpperCase()),
    );
  }
  if (parsed.city) {
    builder = builder.ilike('city', `%${parsed.city}%`);
  }
  if (parsed.industries && parsed.industries.length > 0) {
    builder = builder.in('category', parsed.industries);
  }
  if (parsed.hasWhatsapp !== undefined) {
    builder = builder.eq('has_whatsapp', parsed.hasWhatsapp);
  }
  if (parsed.hasInstagram !== undefined) {
    builder = builder.eq('has_instagram', parsed.hasInstagram);
  }
  if (parsed.acceptsOnlinePayments !== undefined) {
    builder = builder.eq('accepts_online_payments', parsed.acceptsOnlinePayments);
  }
  if (parsed.recentlyActive !== undefined) {
    builder = builder.eq('recent_activity', parsed.recentlyActive);
  }
  if (parsed.minReviewCount !== undefined) {
    builder = builder.gte('review_count', parsed.minReviewCount);
  }
  if (parsed.minFollowerCount !== undefined) {
    builder = builder.gte('follower_count', parsed.minFollowerCount);
  }
  if (parsed.from) {
    builder = builder.gte('updated_at', parsed.from);
  }
  if (parsed.to) {
    builder = builder.lte('updated_at', parsed.to);
  }

  switch (parsed.sortBy) {
    case 'recent':
      builder = builder.order('updated_at', { ascending: false });
      break;
    case 'review_count':
      builder = builder.order('review_count', { ascending: false, nullsFirst: false });
      builder = builder.order('updated_at', { ascending: false });
      break;
    case 'score_desc':
    default:
      builder = builder.order('deterministic_score', { ascending: false });
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  const { data, error, count } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return AdminListLeadsResponseSchema.parse({
    items: (data ?? []).map((row) =>
      mapLeadRow(
        row as {
          id: string;
          name: string;
          country_code: string;
          city: string | null;
          category: string | null;
          deterministic_score: number;
          score_band: ScoreTier | null;
          has_whatsapp: boolean;
          has_instagram: boolean;
          accepts_online_payments: boolean;
          review_count: number | null;
          follower_count: number | null;
          physical_address_present: boolean;
          recent_activity: boolean;
          website_domain: string | null;
          phone_e164: string | null;
          instagram_handle: string | null;
          created_at: string;
          updated_at: string;
        },
      ),
    ),
    page: parsed.page,
    pageSize: parsed.pageSize,
    total: count ?? 0,
  });
}

export async function fetchAdminLeadDetail(id: string): Promise<AdminLeadDetailResponse> {
  const supabase = getSupabaseBrowserClient();

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select(
      'id,name,country_code,city,category,deterministic_score,score_band,has_whatsapp,has_instagram,accepts_online_payments,review_count,follower_count,physical_address_present,recent_activity,website_domain,phone_e164,instagram_handle,created_at,updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (businessError) {
    throw new Error(businessError.message);
  }
  if (!business) {
    throw new Error('Lead not found');
  }

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('business_evidence')
    .select(
      'id,source_type,source_url,serpapi_result_id,raw_json,created_at,search_task:search_tasks(id,task_type,query_text,country_code,city,language,page,time_bucket,params_json,updated_at)',
    )
    .eq('business_id', id)
    .order('created_at', { ascending: false });

  if (evidenceError) {
    throw new Error(evidenceError.message);
  }

  const lead = mapLeadRow(
    business as {
      id: string;
      name: string;
      country_code: string;
      city: string | null;
      category: string | null;
      deterministic_score: number;
      score_band: ScoreTier | null;
      has_whatsapp: boolean;
      has_instagram: boolean;
      accepts_online_payments: boolean;
      review_count: number | null;
      follower_count: number | null;
      physical_address_present: boolean;
      recent_activity: boolean;
      website_domain: string | null;
      phone_e164: string | null;
      instagram_handle: string | null;
      created_at: string;
      updated_at: string;
    },
  );

  const scoreBreakdown = computeBusinessScore({
    hasWhatsapp: lead.hasWhatsapp,
    hasInstagram: lead.hasInstagram,
    acceptsOnlinePayments: lead.acceptsOnlinePayments,
    reviewCount: lead.reviewCount,
    followerCount: lead.followerCount,
    physicalAddressPresent: lead.physicalAddressPresent,
    recentActivity: lead.recentActivity,
  });

  const evidenceTimeline = (evidenceRows ?? []).map((row) => {
    const item = row as {
      id: string;
      source_type: string;
      source_url: string;
      serpapi_result_id: string | null;
      raw_json: unknown;
      created_at: string;
      search_task:
        | {
            id: string;
            task_type: 'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL';
            query_text: string;
            country_code: string;
            city: string | null;
            language: string;
            page: number;
            time_bucket: string;
            params_json: unknown;
            updated_at: string;
          }
        | Array<{
            id: string;
            task_type: 'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL';
            query_text: string;
            country_code: string;
            city: string | null;
            language: string;
            page: number;
            time_bucket: string;
            params_json: unknown;
            updated_at: string;
          }>
        | null;
    };

    const rawTask = Array.isArray(item.search_task)
      ? item.search_task[0] ?? null
      : item.search_task;

    return {
      id: item.id,
      sourceType: item.source_type,
      sourceUrl: item.source_url,
      serpapiResultId: item.serpapi_result_id,
      rawJson: item.raw_json,
      createdAt: toIsoString(item.created_at),
      searchTask: rawTask
        ? {
            id: rawTask.id,
            taskType: rawTask.task_type,
            queryText: rawTask.query_text,
            countryCode: rawTask.country_code,
            city: rawTask.city,
            language: rawTask.language,
            page: rawTask.page,
            timeBucket: rawTask.time_bucket,
            paramsJson: rawTask.params_json,
            updatedAt: toIsoString(rawTask.updated_at),
          }
        : null,
    };
  });

  return AdminLeadDetailResponseSchema.parse({
    lead,
    scoreBreakdown,
    evidenceTimeline,
    dedupeKeys: {
      websiteDomain: lead.websiteDomain,
      phoneE164: lead.phoneE164,
      instagramHandle: lead.instagramHandle,
    },
  });
}

export async function fetchAdminSearchTasks(query: string): Promise<AdminListSearchTasksResponse> {
  const supabase = getSupabaseBrowserClient();
  const parsed = AdminListSearchTasksQuerySchema.parse(parseQueryString(query));
  const fromIndex = (parsed.page - 1) * parsed.pageSize;
  const toIndex = fromIndex + parsed.pageSize - 1;

  let builder = supabase
    .from('search_tasks')
    .select(
      'id,task_type,status,country_code,city,language,query_text,time_bucket,attempts,run_after,last_result_hash,error,updated_at,created_at',
      { count: 'exact' },
    )
    .range(fromIndex, toIndex);

  if (parsed.status) {
    builder = builder.eq('status', parsed.status);
  }
  if (parsed.taskType) {
    builder = builder.eq('task_type', parsed.taskType);
  }
  if (parsed.countryCode) {
    builder = builder.eq('country_code', parsed.countryCode.toUpperCase());
  }
  if (parsed.timeBucket) {
    builder = builder.ilike('time_bucket', `%${parsed.timeBucket}%`);
  }

  switch (parsed.sortBy) {
    case 'run_after_asc':
      builder = builder.order('run_after', { ascending: true });
      break;
    case 'attempts_desc':
      builder = builder.order('attempts', { ascending: false });
      builder = builder.order('updated_at', { ascending: false });
      break;
    case 'updated_desc':
    default:
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  const { data, error, count } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return AdminListSearchTasksResponseSchema.parse({
    items: (data ?? []).map((row) => {
      const item = row as {
        id: string;
        task_type: 'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL';
        status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
        country_code: string;
        city: string | null;
        language: string;
        query_text: string;
        time_bucket: string;
        attempts: number;
        run_after: string;
        last_result_hash: string | null;
        error: string | null;
        updated_at: string;
        created_at: string;
      };

      return {
        id: item.id,
        taskType: item.task_type,
        status: item.status,
        countryCode: item.country_code,
        city: item.city,
        language: item.language,
        queryText: item.query_text,
        timeBucket: item.time_bucket,
        attempts: item.attempts,
        runAfter: toIsoString(item.run_after),
        lastResultHash: item.last_result_hash,
        error: item.error,
        updatedAt: toIsoString(item.updated_at),
        createdAt: toIsoString(item.created_at),
      };
    }),
    page: parsed.page,
    pageSize: parsed.pageSize,
    total: count ?? 0,
  });
}

export async function fetchAdminSearchTaskDetail(id: string): Promise<AdminSearchTaskDetailResponse> {
  const supabase = getSupabaseBrowserClient();

  const { data: taskRow, error: taskError } = await supabase
    .from('search_tasks')
    .select(
      'id,task_type,status,country_code,city,language,query_text,time_bucket,attempts,run_after,last_result_hash,error,updated_at,created_at,params_json,page',
    )
    .eq('id', id)
    .maybeSingle();

  if (taskError) {
    throw new Error(taskError.message);
  }
  if (!taskRow) {
    throw new Error('Search task not found');
  }

  const task = taskRow as {
    id: string;
    task_type: 'SERP_GOOGLE' | 'SERP_GOOGLE_LOCAL' | 'SERP_MAPS_LOCAL';
    status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
    country_code: string;
    city: string | null;
    language: string;
    query_text: string;
    time_bucket: string;
    attempts: number;
    run_after: string;
    last_result_hash: string | null;
    error: string | null;
    updated_at: string;
    created_at: string;
    params_json: unknown;
    page: number;
  };

  const paramsRecord = asRecord(task.params_json) ?? {};

  const { data: leadRows, error: leadsError } = await supabase
    .from('business_evidence')
    .select('id,created_at,business:businesses(id,name,country_code,city,category,deterministic_score)')
    .eq('search_task_id', id)
    .order('created_at', { ascending: false });

  if (leadsError) {
    throw new Error(leadsError.message);
  }

  const linkedLeads = (leadRows ?? []).flatMap((row) => {
    const item = row as {
      id: string;
      created_at: string;
      business:
        | {
            id: string;
            name: string;
            country_code: string;
            city: string | null;
            category: string | null;
            deterministic_score: number;
          }
        | Array<{
            id: string;
            name: string;
            country_code: string;
            city: string | null;
            category: string | null;
            deterministic_score: number;
          }>
        | null;
    };

    const business = Array.isArray(item.business) ? item.business[0] ?? null : item.business;
    if (!business) {
      return [];
    }

    return [
      {
        businessId: business.id,
        name: business.name,
        countryCode: business.country_code,
        city: business.city,
        category: business.category,
        score: business.deterministic_score,
        evidenceId: item.id,
        evidenceCreatedAt: toIsoString(item.created_at),
      },
    ];
  });

  return AdminSearchTaskDetailResponseSchema.parse({
    task: {
      id: task.id,
      taskType: task.task_type,
      status: task.status,
      countryCode: task.country_code,
      city: task.city,
      language: task.language,
      queryText: task.query_text,
      timeBucket: task.time_bucket,
      attempts: task.attempts,
      runAfter: toIsoString(task.run_after),
      lastResultHash: task.last_result_hash,
      error: task.error,
      updatedAt: toIsoString(task.updated_at),
      createdAt: toIsoString(task.created_at),
      paramsJson: task.params_json,
      page: task.page,
      derivedParams: {
        engine: typeof paramsRecord.engine === 'string' ? paramsRecord.engine : null,
        q: typeof paramsRecord.q === 'string' ? paramsRecord.q : null,
        location: typeof paramsRecord.location === 'string' ? paramsRecord.location : null,
        gl: typeof paramsRecord.gl === 'string' ? paramsRecord.gl : null,
        hl: typeof paramsRecord.hl === 'string' ? paramsRecord.hl : null,
        z:
          typeof paramsRecord.z === 'string' || typeof paramsRecord.z === 'number'
            ? paramsRecord.z
            : null,
        m:
          typeof paramsRecord.m === 'string' || typeof paramsRecord.m === 'number'
            ? paramsRecord.m
            : null,
        start:
          typeof paramsRecord.start === 'string' || typeof paramsRecord.start === 'number'
            ? paramsRecord.start
            : null,
      },
    },
    linkedLeads,
  });
}

export async function fetchJobRuns(query: string): Promise<ListJobRunsResponse> {
  const supabase = getSupabaseBrowserClient();
  const parsed = JobRunListQuerySchema.parse(parseQueryString(query));
  const fromIndex = (parsed.page - 1) * parsed.pageSize;
  const toIndex = fromIndex + parsed.pageSize - 1;

  let builder = supabase
    .from('job_runs')
    .select(
      'id,job_name,started_at,finished_at,duration_ms,status,params_json,counters_json,resource_json,error_text,created_at,updated_at',
      { count: 'exact' },
    )
    .range(fromIndex, toIndex)
    .order('started_at', { ascending: false });

  if (parsed.status) {
    builder = builder.eq('status', parsed.status);
  }
  if (parsed.jobName) {
    builder = builder.ilike('job_name', `%${parsed.jobName}%`);
  }

  const { data, error, count } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return ListJobRunsResponseSchema.parse({
    items: (data ?? []).map((row) => {
      const item = row as {
        id: string;
        job_name: string;
        started_at: string;
        finished_at: string | null;
        duration_ms: number | null;
        status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
        params_json: unknown;
        counters_json: unknown;
        resource_json: unknown;
        error_text: string | null;
        created_at: string;
        updated_at: string;
      };

      return {
        id: item.id,
        jobName: item.job_name,
        startedAt: toIsoString(item.started_at),
        finishedAt: item.finished_at ? toIsoString(item.finished_at) : null,
        durationMs: item.duration_ms,
        status: item.status,
        paramsJson: item.params_json,
        countersJson: item.counters_json,
        resourceJson: item.resource_json,
        errorText: item.error_text,
        createdAt: toIsoString(item.created_at),
        updatedAt: toIsoString(item.updated_at),
      };
    }),
    page: parsed.page,
    pageSize: parsed.pageSize,
    total: count ?? 0,
  });
}

export async function fetchJobRunDetail(id: string): Promise<JobRunDetailResponse> {
  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('job_runs')
    .select(
      'id,job_name,started_at,finished_at,duration_ms,status,params_json,counters_json,resource_json,error_text,created_at,updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error('Job run not found');
  }

  const run = data as {
    id: string;
    job_name: string;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
    status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
    params_json: unknown;
    counters_json: unknown;
    resource_json: unknown;
    error_text: string | null;
    created_at: string;
    updated_at: string;
  };

  return JobRunDetailResponseSchema.parse({
    run: {
      id: run.id,
      jobName: run.job_name,
      startedAt: toIsoString(run.started_at),
      finishedAt: run.finished_at ? toIsoString(run.finished_at) : null,
      durationMs: run.duration_ms,
      status: run.status,
      paramsJson: run.params_json,
      countersJson: run.counters_json,
      resourceJson: run.resource_json,
      errorText: run.error_text,
      createdAt: toIsoString(run.created_at),
      updatedAt: toIsoString(run.updated_at),
    },
  });
}

export async function fetchJobRequests(query: string): Promise<JobRequestListResponse> {
  const supabase = getSupabaseBrowserClient();
  const parsed = parseQueryString(query);
  const page = Number.parseInt(parsed.page ?? '1', 10) || 1;
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(parsed.pageSize ?? '20', 10) || 20));
  const fromIndex = (page - 1) * pageSize;
  const toIndex = fromIndex + pageSize - 1;

  let builder = supabase
    .from('job_requests')
    .select(
      'id,request_type,status,params_json,requested_by,claimed_by,created_at,updated_at,claimed_at,started_at,finished_at,error_text,job_run_id,idempotency_key',
      { count: 'exact' },
    )
    .range(fromIndex, toIndex)
    .order('created_at', { ascending: false });

  const status = parsed.status as JobRequestStatus | undefined;
  if (status) {
    builder = builder.eq('status', status);
  }

  const requestType = parsed.requestType as JobRequestType | undefined;
  if (requestType) {
    builder = builder.eq('request_type', requestType);
  }

  const { data, error, count } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return {
    items: (data ?? []).map((row) => {
      const item = row as {
        id: number;
        request_type: JobRequestType;
        status: JobRequestStatus;
        params_json: unknown;
        requested_by: string;
        claimed_by: string | null;
        created_at: string;
        updated_at: string;
        claimed_at: string | null;
        started_at: string | null;
        finished_at: string | null;
        error_text: string | null;
        job_run_id: string | null;
        idempotency_key: string | null;
      };

      return {
        id: item.id,
        requestType: item.request_type,
        status: item.status,
        paramsJson: item.params_json,
        requestedBy: item.requested_by,
        claimedBy: item.claimed_by,
        createdAt: toIsoString(item.created_at),
        updatedAt: toIsoString(item.updated_at),
        claimedAt: item.claimed_at ? toIsoString(item.claimed_at) : null,
        startedAt: item.started_at ? toIsoString(item.started_at) : null,
        finishedAt: item.finished_at ? toIsoString(item.finished_at) : null,
        errorText: item.error_text,
        jobRunId: item.job_run_id,
        idempotencyKey: item.idempotency_key,
      };
    }),
    page,
    pageSize,
    total: count ?? 0,
  };
}

async function createJobRequest(
  requestType: JobRequestType,
  paramsJson: unknown,
): Promise<TriggerJobRequestResponse> {
  const supabase = getSupabaseBrowserClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }
  if (!userData.user) {
    throw new Error('Not authenticated');
  }

  const idempotencyKey = buildIdempotencyKey(requestType, paramsJson);

  const { data, error } = await supabase
    .from('job_requests')
    .insert({
      request_type: requestType,
      requested_by: userData.user.id,
      params_json: paramsJson,
      idempotency_key: idempotencyKey,
    })
    .select('id,status,request_type,job_run_id')
    .single();

  if (error && error.code === '23505') {
    const { data: existing, error: existingError } = await supabase
      .from('job_requests')
      .select('id,status,request_type,job_run_id')
      .eq('idempotency_key', idempotencyKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingError) {
      throw new Error(existingError.message);
    }

    return {
      jobRequestId: existing.id as number,
      status: existing.status as JobRequestStatus,
      requestType: existing.request_type as JobRequestType,
      jobRunId: (existing.job_run_id as string | null) ?? null,
    };
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    jobRequestId: data.id as number,
    status: data.status as JobRequestStatus,
    requestType: data.request_type as JobRequestType,
    jobRunId: (data.job_run_id as string | null) ?? null,
  };
}

export async function triggerDiscoverySeed(
  payload: RunDiscoverySeedRequest,
): Promise<TriggerJobRequestResponse> {
  return createJobRequest('DISCOVERY_SEED', payload);
}

export async function triggerDiscoveryRun(
  payload: RunDiscoveryTasksRequest,
): Promise<TriggerJobRequestResponse> {
  return createJobRequest('DISCOVERY_RUN', payload);
}
