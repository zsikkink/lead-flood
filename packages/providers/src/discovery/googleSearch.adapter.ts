export interface GoogleSearchIcpFilters {
  industries?: string[];
  countries?: string[];
  requiredTechnologies?: string[];
  excludedDomains?: string[];
  minCompanySize?: number;
  maxCompanySize?: number;
  includeTerms?: string[];
  excludeTerms?: string[];
}

export interface GoogleSearchDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  query?: string;
  filters?: GoogleSearchIcpFilters;
}

export interface GoogleSearchDiscoveredLead {
  provider: 'google_search';
  providerRecordId: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companySize: number | null;
  country: string | null;
  raw: unknown;
}

export interface GoogleSearchDiscoveryResult {
  leads: GoogleSearchDiscoveredLead[];
  nextCursor: string | null;
  source: 'google_custom_search' | 'stub';
}

export interface GoogleSearchAdapterConfig {
  apiKey: string | undefined;
  searchEngineId: string | undefined;
  baseUrl?: string;
  maxPageSize?: number;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GoogleSearchResponse {
  items?: unknown[];
  queries?: {
    nextPage?: Array<{
      startIndex?: number;
    }>;
  };
}

const DEFAULT_BASE_URL = 'https://www.googleapis.com/customsearch/v1';
const DEFAULT_MAX_PAGE_SIZE = 10;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function parseCursor(cursor?: string): number {
  if (!cursor) {
    return 1;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseDomain(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function quoteTerm(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

function uniqueTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function buildGoogleSearchQuery(input: Pick<GoogleSearchDiscoveryRequest, 'query' | 'filters'>): string {
  if (input.query && input.query.trim().length > 0) {
    return input.query.trim();
  }

  const includeTerms = uniqueTerms([
    ...(input.filters?.industries ?? []),
    ...(input.filters?.countries ?? []),
    ...(input.filters?.requiredTechnologies ?? []),
    ...(input.filters?.includeTerms ?? []),
  ]);
  const excludeTerms = uniqueTerms(input.filters?.excludeTerms ?? []);
  const excludedDomains = uniqueTerms(input.filters?.excludedDomains ?? []);

  if (
    input.filters?.minCompanySize !== undefined ||
    input.filters?.maxCompanySize !== undefined
  ) {
    const min = input.filters?.minCompanySize;
    const max = input.filters?.maxCompanySize;
    if (min !== undefined && max !== undefined) {
      includeTerms.push(`${min}-${max} employees`);
    } else if (min !== undefined) {
      includeTerms.push(`${min}+ employees`);
    } else if (max !== undefined) {
      includeTerms.push(`up to ${max} employees`);
    }
  }

  const parts: string[] = [];
  if (includeTerms.length > 0) {
    parts.push(includeTerms.map((term) => quoteTerm(term)).join(' '));
  } else {
    parts.push('B2B companies');
  }

  for (const domain of excludedDomains) {
    parts.push(`-site:${domain}`);
  }
  for (const term of excludeTerms) {
    parts.push(`-${quoteTerm(term)}`);
  }

  return parts.join(' ').trim();
}

function deriveLeadName(companyName: string | null): { firstName: string; lastName: string } {
  if (!companyName) {
    return {
      firstName: 'Info',
      lastName: '',
    };
  }

  const [first, ...rest] = companyName.split(' ');
  return {
    firstName: first || 'Info',
    lastName: rest.join(' ').trim(),
  };
}

export class GoogleSearchRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'GoogleSearchRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface GoogleSearchRequestErrorContext {
  statusCode: number | null;
  responseBody: string | null;
  url: string;
}

export class GoogleSearchRequestError extends Error {
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly url: string;
  override readonly cause: unknown;

  constructor(message: string, context: GoogleSearchRequestErrorContext, cause?: unknown) {
    super(message);
    this.name = 'GoogleSearchRequestError';
    this.statusCode = context.statusCode;
    this.responseBody = context.responseBody;
    this.url = context.url;
    this.cause = cause;
  }
}

async function readResponseBody(response: Response): Promise<string | null> {
  try {
    const body = await response.text();
    return body.length > 0 ? body : null;
  } catch {
    return null;
  }
}

export class GoogleSearchAdapter {
  private readonly apiKey: string | undefined;
  private readonly searchEngineId: string | undefined;
  private readonly baseUrl: string;
  private readonly maxPageSize: number;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: GoogleSearchAdapterConfig) {
    this.apiKey = config.apiKey;
    this.searchEngineId = config.searchEngineId;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.maxPageSize = config.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(request: GoogleSearchDiscoveryRequest): Promise<GoogleSearchDiscoveryResult> {
    if (!this.apiKey || !this.searchEngineId) {
      return {
        leads: [],
        nextCursor: null,
        source: 'stub',
      };
    }

    await this.waitForRateLimit();

    const start = parseCursor(request.cursor);
    const num = Math.min(Math.max(request.limit, 1), this.maxPageSize);
    const query = buildGoogleSearchQuery(request);

    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query,
      start: String(start),
      num: String(num),
    });
    const requestUrl = `${this.baseUrl}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      try {
        response = await this.fetchImpl(requestUrl, {
          method: 'GET',
          signal: controller.signal,
        });
      } catch (error: unknown) {
        throw new GoogleSearchRequestError(
          `Google Custom Search fetch failed: ${
            error instanceof Error ? error.message : 'unknown fetch failure'
          }`,
          {
            statusCode: null,
            responseBody: null,
            url: requestUrl,
          },
          error,
        );
      }
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '30', 10);
      const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30;
      this.nextAllowedRequestAt = Date.now() + retryAfterSeconds * 1000;
      throw new GoogleSearchRateLimitError('Google Custom Search rate limited', retryAfterSeconds);
    }

    if (!response.ok) {
      const body = await readResponseBody(response);
      throw new GoogleSearchRequestError(
        `Google Custom Search failed: status=${response.status}`,
        {
          statusCode: response.status,
          responseBody: body,
          url: requestUrl,
        },
      );
    }

    const payload = (await response.json()) as GoogleSearchResponse;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const leads: GoogleSearchDiscoveredLead[] = [];

    for (const item of rawItems) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const value = item as Record<string, unknown>;
      const link = normalizeString(value.link);
      const domain = parseDomain(link);
      if (!domain) {
        continue;
      }

      if (
        request.filters?.excludedDomains?.some((excluded) => excluded.toLowerCase() === domain.toLowerCase())
      ) {
        continue;
      }

      const companyName = normalizeString(value.title);
      const leadName = deriveLeadName(companyName);
      const providerRecordId = normalizeString(value.cacheId) ?? link ?? domain;

      leads.push({
        provider: 'google_search',
        providerRecordId,
        firstName: leadName.firstName,
        lastName: leadName.lastName,
        email: `info@${domain}`,
        title: null,
        companyName,
        companyDomain: domain,
        companySize: null,
        country: null,
        raw: item,
      });
    }

    const nextCursor = payload.queries?.nextPage?.[0]?.startIndex;

    return {
      leads,
      nextCursor: typeof nextCursor === 'number' ? String(nextCursor) : null,
      source: 'google_custom_search',
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.nextAllowedRequestAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
