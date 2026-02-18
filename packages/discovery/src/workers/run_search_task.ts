import { createHash } from 'node:crypto';

import { Prisma, prisma } from '@lead-flood/db';

import type { DiscoveryRuntimeConfig } from '../config.js';
import { normalizeQuery } from '../dedupe/normalize.js';
import { incrementMetric } from '../metrics.js';
import { deriveRootDomainFromUrl } from '../providers/serpapi.client.js';
import type {
  DiscoveryCountryCode,
  DiscoveryProvider,
  NormalizedLocalBusiness,
  NormalizedProviderResponse,
  SearchTaskType,
} from '../providers/types.js';

type SearchTaskStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
type SourceType = 'DIRECTORY' | 'SMB_SITE' | 'SOCIAL' | 'MARKETPLACE' | 'UNKNOWN';

type DiscoveryPrismaDelegates = Pick<
  typeof prisma,
  'source' | 'business' | 'businessEvidence' | 'searchTask'
>;

const discoveryPrisma: DiscoveryPrismaDelegates = prisma;

interface SearchTaskRow {
  id: string;
  task_type: SearchTaskType;
  country_code: DiscoveryCountryCode;
  city: string | null;
  language: 'en' | 'ar';
  query_text: string;
  normalized_query_key: string;
  query_hash: string;
  params_json: Prisma.JsonValue;
  page: number;
  time_bucket: string;
  status: SearchTaskStatus;
  attempts: number;
  run_after: Date;
  last_result_hash: string | null;
}

interface TaskProcessStats {
  newBusinesses: number;
  newSources: number;
  localBusinessCount: number;
  organicResultCount: number;
}

export interface RunSearchTaskResult {
  taskId: string | null;
  status: 'EMPTY' | 'DONE' | 'FAILED' | 'SKIPPED';
  queryHash?: string;
  taskType?: SearchTaskType;
  countryCode?: DiscoveryCountryCode;
  language?: 'en' | 'ar';
  durationMs: number;
  newBusinesses: number;
  newSources: number;
  localBusinessCount: number;
  organicResultCount: number;
  attempts?: number;
  error?: string | null;
}

export interface RunSearchTaskOptions {
  timeBucket?: string;
}

const SOCIAL_DOMAINS = new Set([
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'tiktok.com',
  'x.com',
  'twitter.com',
  'youtube.com',
  'snapchat.com',
]);

const DIRECTORY_DOMAINS = new Set([
  'yellowpages.com',
  'yelp.com',
  'foursquare.com',
  'tripadvisor.com',
  'zomato.com',
  'talabat.com',
  'google.com',
  'bing.com',
]);

const MARKETPLACE_DOMAINS = new Set([
  'amazon.sa',
  'amazon.ae',
  'noon.com',
  'etsy.com',
  'opensooq.com',
  'haraj.com.sa',
]);

const SCORE_WEIGHTS = {
  hasWhatsapp: 0.2,
  hasInstagram: 0.1,
  acceptsOnlinePayments: 0.15,
  reviewCount: 0.2,
  followerCount: 0.1,
  physicalAddressPresent: 0.1,
  recentActivity: 0.15,
} as const;

function normalizePhoneE164(value: string | null): string | null {
  if (!value) {
    return null;
  }

  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  normalized = normalized.replace(/\s+/g, '');
  normalized = normalized.replace(/[().-]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+')) {
    normalized = `+${normalized.replace(/\D/g, '')}`;
  } else {
    normalized = `+${normalized.slice(1).replace(/\D/g, '')}`;
  }

  if (normalized.length < 8 || normalized.length > 16) {
    return null;
  }

  return normalized;
}

function normalizeCity(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeAddress(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableString(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toScoreBand(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= 0.67) {
    return 'HIGH';
  }
  if (score >= 0.34) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function normalizeNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function inferFollowerCount(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const queue: unknown[] = [raw];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.includes('follower')) {
        const numeric = normalizeNumeric(value);
        if (numeric !== null && numeric >= 0) {
          return Math.floor(numeric);
        }
      }
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return null;
}

function deriveBusinessSignals(local: NormalizedLocalBusiness): {
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  acceptsOnlinePayments: boolean;
  followerCount: number | null;
  physicalAddressPresent: boolean;
  recentActivity: boolean;
  deterministicScore: number;
  scoreBand: 'LOW' | 'MEDIUM' | 'HIGH';
} {
  const rawText =
    local.raw && typeof local.raw === 'object'
      ? JSON.stringify(local.raw).toLowerCase()
      : String(local.raw ?? '').toLowerCase();
  const followerCount = inferFollowerCount(local.raw);
  const reviewCount = local.reviewCount ?? 0;
  const hasInstagram = Boolean(local.instagramHandle) || rawText.includes('instagram');
  const hasWhatsapp =
    rawText.includes('whatsapp') || rawText.includes('wa.me') || rawText.includes('واتساب');
  const acceptsOnlinePayments =
    rawText.includes('pay now') ||
    rawText.includes('payment link') ||
    rawText.includes('online payment') ||
    rawText.includes('order online') ||
    (local.websiteUrl ? local.websiteUrl.toLowerCase().includes('shop') : false);
  const physicalAddressPresent = normalizeAddress(local.address) !== null;
  const recentActivity =
    reviewCount > 0 || rawText.includes('open now') || rawText.includes('recent');

  const deterministicScore = Number(
    Math.min(
      1,
      (hasWhatsapp ? SCORE_WEIGHTS.hasWhatsapp : 0) +
        (hasInstagram ? SCORE_WEIGHTS.hasInstagram : 0) +
        (acceptsOnlinePayments ? SCORE_WEIGHTS.acceptsOnlinePayments : 0) +
        Math.min(reviewCount / 200, 1) * SCORE_WEIGHTS.reviewCount +
        Math.min((followerCount ?? 0) / 5000, 1) * SCORE_WEIGHTS.followerCount +
        (physicalAddressPresent ? SCORE_WEIGHTS.physicalAddressPresent : 0) +
        (recentActivity ? SCORE_WEIGHTS.recentActivity : 0),
    ).toFixed(6),
  );

  return {
    hasWhatsapp,
    hasInstagram,
    acceptsOnlinePayments,
    followerCount,
    physicalAddressPresent,
    recentActivity,
    deterministicScore,
    scoreBand: toScoreBand(deterministicScore),
  };
}

function classifySourceType(url: string): SourceType {
  const domain = deriveRootDomainFromUrl(url);
  if (!domain) {
    return 'UNKNOWN';
  }

  const normalizedDomain = domain.toLowerCase();
  if (SOCIAL_DOMAINS.has(normalizedDomain)) {
    return 'SOCIAL';
  }
  if (DIRECTORY_DOMAINS.has(normalizedDomain)) {
    return 'DIRECTORY';
  }
  if (MARKETPLACE_DOMAINS.has(normalizedDomain)) {
    return 'MARKETPLACE';
  }
  return 'SMB_SITE';
}

function sourceScoreFromOrganic(position: number | null): number {
  if (!position || position <= 0) {
    return 0.3;
  }
  return Math.max(0.1, Number((1 / position).toFixed(4)));
}

function confidenceFromBusinessSignal(local: NormalizedLocalBusiness): number {
  let score = 0.3;
  if (local.websiteUrl) {
    score += 0.2;
  }
  if (local.phone) {
    score += 0.2;
  }
  if (local.rating !== null) {
    score += 0.1;
  }
  if (local.reviewCount !== null) {
    score += 0.1;
  }
  if (local.address) {
    score += 0.1;
  }
  return Number(Math.min(1, score).toFixed(3));
}

function hashResultSet(result: NormalizedProviderResponse): string {
  const topKeys: string[] = [];
  for (const organic of result.organicResults.slice(0, 20)) {
    topKeys.push(normalizeQuery(organic.url));
  }
  for (const local of result.localBusinesses.slice(0, 20)) {
    topKeys.push(normalizeQuery(local.id));
    if (local.url) {
      topKeys.push(normalizeQuery(local.url));
    }
    if (local.websiteUrl) {
      topKeys.push(normalizeQuery(local.websiteUrl));
    }
  }

  const payload = topKeys.join('|');
  return createHash('sha256').update(payload).digest('hex');
}

function computeBackoffDate(
  attempt: number,
  baseSeconds: number,
): Date {
  const exponential = baseSeconds * (2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, baseSeconds));
  const delaySeconds = exponential + jitter;
  return new Date(Date.now() + delaySeconds * 1000);
}

function addRefreshInterval(now: Date, refreshBucket: 'daily' | 'weekly'): Date {
  const next = new Date(now.getTime());
  if (refreshBucket === 'daily') {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

function toRuntimeParams(
  task: SearchTaskRow,
  enableCache: boolean,
  mapsZoom: number,
): Record<string, unknown> {
  const engine =
    task.task_type === 'SERP_GOOGLE'
      ? 'google'
      : task.task_type === 'SERP_GOOGLE_LOCAL'
        ? 'google_local'
        : 'google_maps';

  const start = Math.max(0, (task.page - 1) * 10);
  const params: Record<string, unknown> = {
    engine,
    q: task.query_text,
    gl: task.country_code.toLowerCase(),
    hl: task.language,
    location: task.city,
    start,
  };

  if (engine === 'google_maps') {
    params.type = 'search';
    if (params.location && !('z' in params) && !('m' in params)) {
      params.z = mapsZoom;
    }
  }

  if (!enableCache) {
    params.no_cache = true;
  }

  return params;
}

async function lockNextRunnableTask(
  config: DiscoveryRuntimeConfig,
  options: RunSearchTaskOptions = {},
): Promise<SearchTaskRow | null> {
  return prisma.$transaction(async (tx) => {
    const timeBucketFilter = options.timeBucket
      ? Prisma.sql`AND "time_bucket" = ${options.timeBucket}`
      : Prisma.empty;
    const rows = await tx.$queryRaw<SearchTaskRow[]>`
      SELECT
        id,
        task_type,
        country_code,
        city,
        language,
        query_text,
        normalized_query_key,
        query_hash,
        params_json,
        page,
        time_bucket,
        status,
        attempts,
        run_after,
        last_result_hash
      FROM "search_tasks"
      WHERE "status" IN ('PENDING', 'FAILED')
        AND "run_after" <= NOW()
        ${timeBucketFilter}
      ORDER BY "run_after" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const task = rows[0] ?? null;
    if (!task) {
      return null;
    }

    await tx.$executeRaw`
      UPDATE "search_tasks"
      SET
        "status" = 'RUNNING',
        "attempts" = "attempts" + 1,
        "params_json" = ${toRuntimeParams(task, config.enableCache, config.mapsZoom)}::jsonb,
        "error" = NULL,
        "updated_at" = NOW()
      WHERE "id" = ${task.id}
    `;

    return {
      ...task,
      attempts: task.attempts + 1,
      params_json: toRuntimeParams(task, config.enableCache, config.mapsZoom) as Prisma.JsonValue,
      status: 'RUNNING',
    };
  });
}

async function upsertSource(
  url: string,
  countryCode: DiscoveryCountryCode,
  taskId: string,
  score: number,
): Promise<boolean> {
  const existing = await discoveryPrisma.source.findUnique({
    where: { url },
    select: { id: true, score: true },
  });

  const sourceType = classifySourceType(url);
  const rootDomain = deriveRootDomainFromUrl(url) ?? 'unknown';

  if (existing) {
    await discoveryPrisma.source.update({
      where: { id: existing.id },
      data: {
        type: sourceType,
        rootDomain,
        countryHint: countryCode,
        discoveredFromTaskId: taskId,
        score: Math.max(existing.score, score),
      },
    });
    return false;
  }

  await discoveryPrisma.source.create({
    data: {
      type: sourceType,
      rootDomain,
      url,
      countryHint: countryCode,
      discoveredFromTaskId: taskId,
      score,
    },
  });
  return true;
}

async function upsertBusinessFromLocalResult(
  task: SearchTaskRow,
  local: NormalizedLocalBusiness,
): Promise<{ businessId: string; created: boolean }> {
  const websiteDomain = deriveRootDomainFromUrl(local.websiteUrl ?? local.url);
  const phoneE164 = normalizePhoneE164(local.phone);
  const confidence = confidenceFromBusinessSignal(local);
  const signals = deriveBusinessSignals(local);

  let existing =
    websiteDomain
      ? await discoveryPrisma.business.findFirst({
          where: { websiteDomain },
          select: {
            id: true,
            confidence: true,
            hasWhatsapp: true,
            hasInstagram: true,
            acceptsOnlinePayments: true,
            followerCount: true,
            physicalAddressPresent: true,
            recentActivity: true,
            deterministicScore: true,
          },
        })
      : null;

  if (!existing && phoneE164) {
    existing = await discoveryPrisma.business.findFirst({
      where: { phoneE164 },
      select: {
        id: true,
        confidence: true,
        hasWhatsapp: true,
        hasInstagram: true,
        acceptsOnlinePayments: true,
        followerCount: true,
        physicalAddressPresent: true,
        recentActivity: true,
        deterministicScore: true,
      },
    });
  }

  if (existing) {
    const mergedFollowerCount =
      existing.followerCount !== null && existing.followerCount !== undefined
        ? Math.max(existing.followerCount, signals.followerCount ?? 0)
        : signals.followerCount;
    const mergedScore = Math.max(existing.deterministicScore, signals.deterministicScore);

    const updateData: Prisma.BusinessUpdateInput = {
      name: local.name,
      countryCode: task.country_code,
      city: normalizeCity(local.city ?? task.city),
      address: normalizeAddress(local.address),
      instagramHandle: normalizeNullableString(local.instagramHandle),
      category: normalizeNullableString(local.category),
      confidence: Math.max(existing.confidence, confidence),
      hasWhatsapp: existing.hasWhatsapp || signals.hasWhatsapp,
      hasInstagram: existing.hasInstagram || signals.hasInstagram,
      acceptsOnlinePayments:
        existing.acceptsOnlinePayments || signals.acceptsOnlinePayments,
      physicalAddressPresent:
        existing.physicalAddressPresent || signals.physicalAddressPresent,
      recentActivity: existing.recentActivity || signals.recentActivity,
      deterministicScore: mergedScore,
      scoreBand: toScoreBand(mergedScore),
    };

    if (phoneE164 !== null) {
      updateData.phoneE164 = phoneE164;
    }
    if (websiteDomain !== null) {
      updateData.websiteDomain = websiteDomain;
    }
    if (local.rating !== null) {
      updateData.rating = local.rating;
    }
    if (local.reviewCount !== null) {
      updateData.reviewCount = local.reviewCount;
    }
    if (local.latitude !== null) {
      updateData.lat = local.latitude;
    }
    if (local.longitude !== null) {
      updateData.lng = local.longitude;
    }
    if (mergedFollowerCount !== null && mergedFollowerCount !== undefined) {
      updateData.followerCount = mergedFollowerCount;
    }

    await discoveryPrisma.business.update({
      where: { id: existing.id },
      data: updateData,
    });

    return {
      businessId: existing.id,
      created: false,
    };
  }

  const created = await discoveryPrisma.business.create({
    data: {
      name: local.name,
      countryCode: task.country_code,
      city: normalizeCity(local.city ?? task.city),
      address: normalizeAddress(local.address),
      phoneE164,
      websiteDomain,
      instagramHandle: normalizeNullableString(local.instagramHandle),
      category: normalizeNullableString(local.category),
      rating: local.rating ?? null,
      reviewCount: local.reviewCount ?? null,
      lat: local.latitude ?? null,
      lng: local.longitude ?? null,
      confidence,
      hasWhatsapp: signals.hasWhatsapp,
      hasInstagram: signals.hasInstagram,
      acceptsOnlinePayments: signals.acceptsOnlinePayments,
      followerCount: signals.followerCount ?? null,
      physicalAddressPresent: signals.physicalAddressPresent,
      recentActivity: signals.recentActivity,
      deterministicScore: signals.deterministicScore,
      scoreBand: signals.scoreBand,
    },
    select: {
      id: true,
    },
  });

  return {
    businessId: created.id,
    created: true,
  };
}

async function insertEvidence(
  businessId: string,
  searchTaskId: string,
  sourceUrl: string,
  sourceType: string,
  serpapiResultId: string | null,
  raw: unknown,
): Promise<void> {
  await discoveryPrisma.businessEvidence.create({
    data: {
      businessId,
      searchTaskId,
      sourceUrl,
      sourceType,
      serpapiResultId,
      rawJson: raw as Prisma.InputJsonValue,
    },
  });
}

async function persistProviderResults(
  task: SearchTaskRow,
  providerResponse: NormalizedProviderResponse,
): Promise<TaskProcessStats> {
  let newSources = 0;
  let newBusinesses = 0;

  for (const result of providerResponse.organicResults) {
    const created = await upsertSource(
      result.url,
      task.country_code,
      task.id,
      sourceScoreFromOrganic(result.position),
    );
    if (created) {
      newSources += 1;
      incrementMetric('new_sources');
    }
  }

  for (const local of providerResponse.localBusinesses) {
    if (local.websiteUrl) {
      const created = await upsertSource(local.websiteUrl, task.country_code, task.id, 0.8);
      if (created) {
        newSources += 1;
        incrementMetric('new_sources');
      }
    } else if (local.url) {
      const created = await upsertSource(local.url, task.country_code, task.id, 0.6);
      if (created) {
        newSources += 1;
        incrementMetric('new_sources');
      }
    }

    const businessUpsert = await upsertBusinessFromLocalResult(task, local);
    if (businessUpsert.created) {
      newBusinesses += 1;
      incrementMetric('new_businesses');
    }

    const evidenceSourceUrl = local.url ?? local.websiteUrl ?? `serpapi://${task.task_type}/${task.id}`;
    await insertEvidence(
      businessUpsert.businessId,
      task.id,
      evidenceSourceUrl,
      providerResponse.engine === 'google'
        ? 'serp_organic'
        : providerResponse.engine === 'google_local'
          ? 'google_local'
          : 'maps_local',
      local.id,
      local.raw,
    );
  }

  return {
    newBusinesses,
    newSources,
    localBusinessCount: providerResponse.localBusinesses.length,
    organicResultCount: providerResponse.organicResults.length,
  };
}

async function executeTaskWithProvider(
  task: SearchTaskRow,
  provider: DiscoveryProvider,
): Promise<NormalizedProviderResponse> {
  const request = {
    query: task.query_text,
    countryCode: task.country_code,
    language: task.language,
    city: task.city,
    page: task.page,
  } as const;

  if (task.task_type === 'SERP_GOOGLE') {
    return provider.searchGoogle(request);
  }
  if (task.task_type === 'SERP_GOOGLE_LOCAL') {
    return provider.searchGoogleLocal(request);
  }
  return provider.searchMapsLocal(request);
}

function toSerializableError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

async function markTaskDone(
  task: SearchTaskRow,
  status: 'DONE' | 'SKIPPED',
  resultHash: string | null,
  nextRunAfter: Date,
): Promise<void> {
  await discoveryPrisma.searchTask.update({
    where: { id: task.id },
    data: {
      status,
      lastResultHash: resultHash,
      runAfter: nextRunAfter,
      error: null,
    },
  });
}

async function markTaskFailed(
  task: SearchTaskRow,
  config: DiscoveryRuntimeConfig,
  errorMessage: string,
): Promise<void> {
  const shouldRetry = task.attempts < config.maxTaskAttempts;
  const runAfter = shouldRetry
    ? computeBackoffDate(task.attempts, config.backoffBaseSeconds)
    : new Date();

  await discoveryPrisma.searchTask.update({
    where: { id: task.id },
    data: {
      status: 'FAILED',
      runAfter,
      error: errorMessage,
    },
  });
}

export async function runSearchTask(
  provider: DiscoveryProvider,
  config: DiscoveryRuntimeConfig,
  options: RunSearchTaskOptions = {},
): Promise<RunSearchTaskResult> {
  const startedAt = Date.now();
  const task = await lockNextRunnableTask(config, options);
  if (!task) {
    incrementMetric('tasks_skipped');
    return {
      taskId: null,
      status: 'EMPTY',
      durationMs: Date.now() - startedAt,
      newBusinesses: 0,
      newSources: 0,
      localBusinessCount: 0,
      organicResultCount: 0,
    };
  }

  try {
    const providerResponse = await executeTaskWithProvider(task, provider);
    const resultHash = hashResultSet(providerResponse);
    const unchanged = task.last_result_hash !== null && task.last_result_hash === resultHash;

    const stats = await persistProviderResults(task, providerResponse);
    const isEmpty = stats.localBusinessCount === 0 && stats.organicResultCount === 0;

    const status: 'DONE' | 'SKIPPED' = isEmpty ? 'SKIPPED' : 'DONE';
    const nextRunAfter = unchanged
      ? addRefreshInterval(new Date(), config.refreshBucket)
      : new Date();

    await markTaskDone(task, status, resultHash, nextRunAfter);
    incrementMetric('tasks_run');
    if (status === 'SKIPPED') {
      incrementMetric('tasks_skipped');
    }

    return {
      taskId: task.id,
      status,
      queryHash: task.query_hash,
      taskType: task.task_type,
      countryCode: task.country_code,
      language: task.language,
      attempts: task.attempts,
      durationMs: Date.now() - startedAt,
      newBusinesses: stats.newBusinesses,
      newSources: stats.newSources,
      localBusinessCount: stats.localBusinessCount,
      organicResultCount: stats.organicResultCount,
      error: null,
    };
  } catch (error: unknown) {
    const errorMessage = toSerializableError(error);
    await markTaskFailed(task, config, errorMessage);
    incrementMetric('tasks_failed');

    return {
      taskId: task.id,
      status: 'FAILED',
      queryHash: task.query_hash,
      taskType: task.task_type,
      countryCode: task.country_code,
      language: task.language,
      attempts: task.attempts,
      durationMs: Date.now() - startedAt,
      newBusinesses: 0,
      newSources: 0,
      localBusinessCount: 0,
      organicResultCount: 0,
      error: errorMessage,
    };
  }
}
