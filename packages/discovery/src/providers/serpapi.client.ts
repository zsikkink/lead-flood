import { setTimeout as delay } from 'node:timers/promises';

import type {
  DiscoveryCountryCode,
  DiscoveryProvider,
  NormalizedLocalBusiness,
  NormalizedProviderResponse,
  NormalizedSearchResult,
  SerpApiCommonRequest,
} from './types.js';

interface SerpApiResponseRoot {
  error?: unknown;
  organic_results?: unknown[];
  local_results?: unknown[] | { places?: unknown[]; [key: string]: unknown };
  local_map?: { places?: unknown[]; [key: string]: unknown } | unknown;
  places_results?: unknown[];
  place_results?: { local_results?: unknown[]; [key: string]: unknown } | unknown;
  [key: string]: unknown;
}

export interface SerpApiClientConfig {
  apiKey: string;
  baseUrl?: string;
  rps: number;
  enableCache: boolean;
  mapsZoom?: number;
  maxAttempts?: number;
  backoffBaseSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface SerpApiRequestContext {
  engine: 'google' | 'google_local' | 'google_maps';
  q: string | null;
  location: string | null;
  gl: string | null;
  hl: string | null;
  z: string | null;
  m: string | null;
}

interface RequestExecutionConfig {
  maxAttempts: number;
  backoffBaseSeconds: number;
  timeoutMs: number;
}

const DEFAULT_BASE_URL = 'https://serpapi.com/search.json';
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_BASE_SECONDS = 30;
const DEFAULT_TIMEOUT_MS = 30000;
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);

class GlobalRpsLimiter {
  private nextAllowedAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly intervalMs: number;

  constructor(rps: number) {
    const normalized = Number.isFinite(rps) && rps > 0 ? rps : 1;
    this.intervalMs = Math.ceil(1000 / normalized);
  }

  async waitTurn(): Promise<void> {
    const ticket = this.queue.then(async () => {
      const now = Date.now();
      const waitMs = this.nextAllowedAt - now;
      if (waitMs > 0) {
        await delay(waitMs);
      }
      this.nextAllowedAt = Date.now() + this.intervalMs;
    });

    this.queue = ticket.catch(() => undefined);
    await ticket;
  }
}

const limiterByKey = new Map<string, GlobalRpsLimiter>();

function getGlobalLimiter(key: string, rps: number): GlobalRpsLimiter {
  const existing = limiterByKey.get(key);
  if (existing) {
    return existing;
  }
  const limiter = new GlobalRpsLimiter(rps);
  limiterByKey.set(key, limiter);
  return limiter;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCountryName(countryCode: DiscoveryCountryCode): string {
  switch (countryCode) {
    case 'JO':
      return 'Jordan';
    case 'SA':
      return 'Saudi Arabia';
    case 'AE':
      return 'United Arab Emirates';
    case 'EG':
      return 'Egypt';
    default:
      return countryCode;
  }
}

function buildLocation(city: string | null | undefined, countryCode: DiscoveryCountryCode): string {
  const countryName = toCountryName(countryCode);
  if (!city) {
    return countryName;
  }
  return `${city}, ${countryName}`;
}

function buildRequestParams(
  engine: 'google' | 'google_local' | 'google_maps',
  input: SerpApiCommonRequest,
  enableCache: boolean,
  mapsZoom: number,
): URLSearchParams {
  const start = Math.max(0, (input.page - 1) * 10);
  const params = new URLSearchParams({
    engine,
    q: input.query,
    gl: input.countryCode.toLowerCase(),
    hl: input.language,
    location: buildLocation(input.city, input.countryCode),
    start: `${start}`,
  });

  if (engine === 'google_maps') {
    params.set('type', 'search');
    if (params.get('location') && !params.has('z') && !params.has('m')) {
      params.set('z', `${mapsZoom}`);
    }
  }

  if (!enableCache) {
    params.set('no_cache', 'true');
  }

  return params;
}

function toRequestContext(
  engine: 'google' | 'google_local' | 'google_maps',
  params: URLSearchParams,
): SerpApiRequestContext {
  return {
    engine,
    q: params.get('q'),
    location: params.get('location'),
    gl: params.get('gl'),
    hl: params.get('hl'),
    z: params.get('z'),
    m: params.get('m'),
  };
}

function formatRequestContext(context: SerpApiRequestContext): string {
  return [
    `engine=${context.engine}`,
    `q=${context.q ?? ''}`,
    `location=${context.location ?? ''}`,
    `gl=${context.gl ?? ''}`,
    `hl=${context.hl ?? ''}`,
    `z=${context.z ?? ''}`,
    `m=${context.m ?? ''}`,
  ].join(' ');
}

function parseSerpApiError(body: string | null): string | null {
  if (!body) {
    return null;
  }
  try {
    const json = JSON.parse(body) as unknown;
    if (!json || typeof json !== 'object') {
      return null;
    }
    return normalizeString((json as Record<string, unknown>).error);
  } catch {
    return null;
  }
}

function normalizeDomainFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function parseInstagramHandle(value: unknown): string | null {
  const input = normalizeString(value);
  if (!input) {
    return null;
  }

  const fromPath = input.match(/instagram\.com\/([^/?#]+)/i);
  if (fromPath?.[1]) {
    return fromPath[1].replace(/^@/, '');
  }

  if (input.startsWith('@')) {
    return input.slice(1);
  }

  return null;
}

function toUrlCandidate(value: unknown): string | null {
  const input = normalizeString(value);
  if (!input) {
    return null;
  }

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(input)) {
    return `https://${input}`;
  }

  return null;
}

function normalizeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isGoogleMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.includes('google.')) {
      return false;
    }
    return parsed.pathname.startsWith('/maps/');
  } catch {
    return false;
  }
}

function isSocialProfileUrl(url: string): boolean {
  const hostname = normalizeHost(url);
  if (!hostname) {
    return false;
  }
  return hostname === 'instagram.com' || hostname === 'facebook.com' || hostname === 'tiktok.com';
}

function pickWebsiteCandidate(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const normalized = toUrlCandidate(candidate);
    if (!normalized) {
      continue;
    }
    if (isGoogleMapsUrl(normalized)) {
      continue;
    }
    if (isSocialProfileUrl(normalized)) {
      continue;
    }
    return normalized;
  }
  return null;
}

function collectLinkCandidates(value: unknown): string[] {
  const candidates: string[] = [];

  if (!value) {
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const linkEntry = entry as Record<string, unknown>;
      const linkCandidate =
        normalizeString(linkEntry.website) ??
        normalizeString(linkEntry.link) ??
        normalizeString(linkEntry.url);
      if (linkCandidate) {
        candidates.push(linkCandidate);
      }
    }
    return candidates;
  }

  if (typeof value === 'object') {
    const linkMap = value as Record<string, unknown>;
    const directCandidates = [
      normalizeString(linkMap.website),
      normalizeString(linkMap.link),
      normalizeString(linkMap.url),
      normalizeString(linkMap.instagram),
      normalizeString(linkMap.profile),
    ];
    for (const candidate of directCandidates) {
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function extractInstagramHandleFromCandidates(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const handle = parseInstagramHandle(candidate);
    if (handle) {
      return handle;
    }
  }
  return null;
}

function normalizeOrganicResults(payload: SerpApiResponseRoot): NormalizedSearchResult[] {
  const organic = Array.isArray(payload.organic_results) ? payload.organic_results : [];
  const results: NormalizedSearchResult[] = [];

  for (const raw of organic) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const value = raw as Record<string, unknown>;
    const url = normalizeString(value.link);
    if (!url) {
      continue;
    }

    const id =
      normalizeString(value.result_id) ??
      normalizeString(value.cache_id) ??
      normalizeString(value.position?.toString()) ??
      url;

    results.push({
      id,
      title: normalizeString(value.title),
      url,
      snippet: normalizeString(value.snippet),
      displayedLink: normalizeString(value.displayed_link),
      position: normalizeNumber(value.position),
      raw,
    });
  }

  return results;
}

function collectLocalCollections(payload: SerpApiResponseRoot): unknown[] {
  const collections: unknown[] = [];

  if (Array.isArray(payload.local_results)) {
    collections.push(...payload.local_results);
  } else if (payload.local_results && typeof payload.local_results === 'object') {
    const localResults = payload.local_results as Record<string, unknown>;
    if (Array.isArray(localResults.places)) {
      collections.push(...localResults.places);
    }
  }

  if (payload.local_map && typeof payload.local_map === 'object') {
    const localMap = payload.local_map as Record<string, unknown>;
    if (Array.isArray(localMap.places)) {
      collections.push(...localMap.places);
    }
    if (Array.isArray(localMap.results)) {
      collections.push(...localMap.results);
    }
  }

  if (Array.isArray(payload.places_results)) {
    collections.push(...payload.places_results);
  }

  if (payload.place_results && typeof payload.place_results === 'object') {
    const placeResults = payload.place_results as Record<string, unknown>;
    if (Array.isArray(placeResults.local_results)) {
      collections.push(...placeResults.local_results);
    }
  }

  return collections;
}

function normalizeLocalBusinesses(
  payload: SerpApiResponseRoot,
  countryCode: DiscoveryCountryCode,
): NormalizedLocalBusiness[] {
  const localEntries = collectLocalCollections(payload);
  const businesses: NormalizedLocalBusiness[] = [];

  for (const raw of localEntries) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const value = raw as Record<string, unknown>;
    const title =
      normalizeString(value.title) ??
      normalizeString(value.name);
    if (!title) {
      continue;
    }

    const linkCandidates = collectLinkCandidates(value.links);
    const websiteFromLinks = pickWebsiteCandidate(linkCandidates);
    const websiteUrl =
      pickWebsiteCandidate([value.website, websiteFromLinks, value.link, value.domain]);
    const resultUrl =
      normalizeString(value.place_link) ??
      normalizeString(value.gps_coordinates && typeof value.gps_coordinates === 'object'
        ? (value.gps_coordinates as Record<string, unknown>).google_maps
        : null) ??
      websiteUrl;

    const gps =
      value.gps_coordinates && typeof value.gps_coordinates === 'object'
        ? (value.gps_coordinates as Record<string, unknown>)
        : null;

    const reviewCount =
      normalizeNumber(value.reviews) ??
      normalizeNumber(value.reviews_original) ??
      normalizeNumber(value.rating_count);

    const id =
      normalizeString(value.data_id) ??
      normalizeString(value.data_cid) ??
      normalizeString(value.place_id) ??
      resultUrl ??
      `${title}:${businesses.length + 1}`;

    const cityFromAddress = (() => {
      const address = normalizeString(value.address);
      if (!address) {
        return null;
      }
      const parts = address.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
      if (parts.length < 2) {
        return null;
      }
      return parts[parts.length - 2] ?? null;
    })();

    const instagramFromLinks = extractInstagramHandleFromCandidates([
      value.instagram,
      value.website,
      value.link,
      value.domain,
      ...linkCandidates,
    ]);

    businesses.push({
      id,
      name: title,
      url: resultUrl,
      websiteUrl,
      address: normalizeString(value.address),
      phone: normalizeString(value.phone),
      city: cityFromAddress,
      countryCode,
      category: normalizeString(value.type) ?? normalizeString(value.category),
      rating: normalizeNumber(value.rating),
      reviewCount: reviewCount !== null ? Math.floor(reviewCount) : null,
      latitude: normalizeNumber(gps?.latitude),
      longitude: normalizeNumber(gps?.longitude),
      instagramHandle: instagramFromLinks,
      raw,
    });
  }

  return businesses;
}

function randomJitterMs(maxExclusive: number): number {
  if (maxExclusive <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function isTransientStatus(statusCode: number): boolean {
  return TRANSIENT_STATUSES.has(statusCode);
}

async function readResponseText(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export class SerpApiRequestError extends Error {
  readonly statusCode: number | null;
  readonly body: string | null;
  readonly url: string;
  readonly requestContext: SerpApiRequestContext | null;
  readonly serpApiError: string | null;
  override readonly cause: unknown;

  constructor(
    message: string,
    options: {
      statusCode: number | null;
      body: string | null;
      url: string;
      requestContext?: SerpApiRequestContext | null;
      serpApiError?: string | null;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'SerpApiRequestError';
    this.statusCode = options.statusCode;
    this.body = options.body;
    this.url = options.url;
    this.requestContext = options.requestContext ?? null;
    this.serpApiError = options.serpApiError ?? null;
    this.cause = options.cause;
  }
}

export class SerpApiDiscoveryProvider implements DiscoveryProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly enableCache: boolean;
  private readonly executionConfig: RequestExecutionConfig;
  private readonly limiter: GlobalRpsLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly mapsZoom: number;

  constructor(config: SerpApiClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.enableCache = config.enableCache;
    this.mapsZoom = config.mapsZoom ?? 13;
    this.executionConfig = {
      maxAttempts: config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      backoffBaseSeconds: config.backoffBaseSeconds ?? DEFAULT_BACKOFF_BASE_SECONDS,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
    this.limiter = getGlobalLimiter('serpapi-global', config.rps);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async searchGoogle(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse> {
    return this.executeEngineRequest('google', params);
  }

  async searchGoogleLocal(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse> {
    return this.executeEngineRequest('google_local', params);
  }

  async searchMapsLocal(params: SerpApiCommonRequest): Promise<NormalizedProviderResponse> {
    return this.executeEngineRequest('google_maps', params);
  }

  private async executeEngineRequest(
    engine: 'google' | 'google_local' | 'google_maps',
    input: SerpApiCommonRequest,
  ): Promise<NormalizedProviderResponse> {
    const params = buildRequestParams(engine, input, this.enableCache, this.mapsZoom);
    const requestContext = toRequestContext(engine, params);
    params.set('api_key', this.apiKey);
    const requestUrl = `${this.baseUrl}?${params.toString()}`;

    const payload = await this.requestWithRetry(requestUrl, requestContext);
    return {
      engine,
      organicResults: normalizeOrganicResults(payload),
      localBusinesses: normalizeLocalBusinesses(payload, input.countryCode),
      raw: payload,
    };
  }

  private async requestWithRetry(
    requestUrl: string,
    requestContext: SerpApiRequestContext,
  ): Promise<SerpApiResponseRoot> {
    let lastError: SerpApiRequestError | null = null;

    for (let attempt = 1; attempt <= this.executionConfig.maxAttempts; attempt += 1) {
      await this.limiter.waitTurn();

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.executionConfig.timeoutMs);

      try {
        const response = await this.fetchImpl(requestUrl, {
          method: 'GET',
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await readResponseText(response);
          const serpApiError = parseSerpApiError(body);
          const error = new SerpApiRequestError(
            `SerpAPI request failed: status=${response.status} ${formatRequestContext(
              requestContext,
            )}${serpApiError ? ` error=${serpApiError}` : ''}`,
            {
              statusCode: response.status,
              body,
              url: requestUrl,
              requestContext,
              serpApiError,
            },
          );

          if (isTransientStatus(response.status) && attempt < this.executionConfig.maxAttempts) {
            await this.waitBackoff(attempt);
            lastError = error;
            continue;
          }

          throw error;
        }

        const json = (await response.json()) as unknown;
        if (!json || typeof json !== 'object') {
          throw new SerpApiRequestError('SerpAPI response is not a JSON object', {
            statusCode: response.status,
            body: JSON.stringify(json),
            url: requestUrl,
            requestContext,
          });
        }
        const payload = json as SerpApiResponseRoot;
        const serpApiError = normalizeString(payload.error);
        if (serpApiError) {
          throw new SerpApiRequestError(
            `SerpAPI request failed: status=${response.status} ${formatRequestContext(
              requestContext,
            )} error=${serpApiError}`,
            {
              statusCode: response.status,
              body: JSON.stringify(payload),
              url: requestUrl,
              requestContext,
              serpApiError,
            },
          );
        }
        return payload;
      } catch (error: unknown) {
        const wrapped =
          error instanceof SerpApiRequestError
            ? error
            : new SerpApiRequestError(
                `SerpAPI request failed before response completion: ${formatRequestContext(
                  requestContext,
                )}`,
                {
                  statusCode: null,
                  body: null,
                  url: requestUrl,
                  requestContext,
                  cause: error,
                },
              );

        if (attempt < this.executionConfig.maxAttempts) {
          await this.waitBackoff(attempt);
          lastError = wrapped;
          continue;
        }

        throw wrapped;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new SerpApiRequestError('SerpAPI request failed', {
      statusCode: null,
      body: null,
      url: requestUrl,
      requestContext,
    });
  }

  private async waitBackoff(attempt: number): Promise<void> {
    const baseMs = this.executionConfig.backoffBaseSeconds * 1000;
    const exponential = baseMs * (2 ** Math.max(0, attempt - 1));
    const jitter = randomJitterMs(baseMs);
    await delay(exponential + jitter);
  }
}

export async function searchGoogle(
  params: SerpApiCommonRequest,
  config: SerpApiClientConfig,
): Promise<NormalizedProviderResponse> {
  const provider = new SerpApiDiscoveryProvider(config);
  return provider.searchGoogle(params);
}

export async function searchGoogleLocal(
  params: SerpApiCommonRequest,
  config: SerpApiClientConfig,
): Promise<NormalizedProviderResponse> {
  const provider = new SerpApiDiscoveryProvider(config);
  return provider.searchGoogleLocal(params);
}

export async function searchMapsLocal(
  params: SerpApiCommonRequest,
  config: SerpApiClientConfig,
): Promise<NormalizedProviderResponse> {
  const provider = new SerpApiDiscoveryProvider(config);
  return provider.searchMapsLocal(params);
}

export function deriveRootDomainFromUrl(url: string | null): string | null {
  return normalizeDomainFromUrl(url);
}
