import type { GoogleSearchIcpFilters } from './googleSearch.adapter.js';

export interface BraveSearchDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  query?: string;
  filters?: GoogleSearchIcpFilters;
}

export interface BraveSearchDiscoveredLead {
  provider: 'brave_search';
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

export interface BraveSearchDiscoveryResult {
  leads: BraveSearchDiscoveredLead[];
  nextCursor: string | null;
  source: 'brave_search_api' | 'stub';
}

export interface BraveSearchAdapterConfig {
  enabled: boolean;
  apiKey: string | undefined;
  baseUrl?: string;
  maxPageSize?: number;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface BraveSearchResponse {
  web?: {
    results?: unknown[];
    next_offset?: number;
  };
}

const DEFAULT_BASE_URL = 'https://api.search.brave.com/res/v1/web/search';
const DEFAULT_MAX_PAGE_SIZE = 20;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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

function parseCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
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

function domainToName(domain: string): string {
  const [name] = domain.split('.');
  if (!name) {
    return 'Company';
  }

  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function parseRetryAfterSeconds(retryAfterHeader: string | null): number {
  if (!retryAfterHeader) {
    return 30;
  }

  const numeric = Number.parseInt(retryAfterHeader, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 30;
}

export function buildBraveSearchQuery(
  input: Pick<BraveSearchDiscoveryRequest, 'query' | 'filters'>,
): string {
  if (input.query && input.query.trim().length > 0) {
    return input.query.trim();
  }

  const includeTerms = uniqueTerms([
    ...(input.filters?.industries ?? []),
    ...(input.filters?.countries ?? []),
    ...(input.filters?.requiredTechnologies ?? []),
    ...(input.filters?.includeTerms ?? []),
  ]);
  const excludedDomains = uniqueTerms(input.filters?.excludedDomains ?? []);
  const excludeTerms = uniqueTerms(input.filters?.excludeTerms ?? []);

  const parts: string[] = [];
  if (includeTerms.length > 0) {
    parts.push(includeTerms.map((term) => quoteTerm(term)).join(' '));
  } else {
    parts.push('small business "contact us" "WhatsApp"');
  }

  for (const domain of excludedDomains) {
    parts.push(`-site:${domain}`);
  }
  for (const term of excludeTerms) {
    parts.push(`-${quoteTerm(term)}`);
  }

  return parts.join(' ').trim();
}

export class BraveSearchRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'BraveSearchRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface BraveSearchRequestErrorContext {
  statusCode: number | null;
  responseBody: string | null;
  url: string;
}

export class BraveSearchRequestError extends Error {
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly url: string;
  override readonly cause: unknown;

  constructor(message: string, context: BraveSearchRequestErrorContext, cause?: unknown) {
    super(message);
    this.name = 'BraveSearchRequestError';
    this.statusCode = context.statusCode;
    this.responseBody = context.responseBody;
    this.url = context.url;
    this.cause = cause;
  }
}

export class BraveSearchAdapter {
  private readonly enabled: boolean;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly maxPageSize: number;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: BraveSearchAdapterConfig) {
    this.enabled = config.enabled;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.maxPageSize = config.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(input: BraveSearchDiscoveryRequest): Promise<BraveSearchDiscoveryResult> {
    if (!this.enabled || !this.apiKey) {
      return {
        leads: [],
        nextCursor: null,
        source: 'stub',
      };
    }

    await this.waitForRateLimit();

    const query = buildBraveSearchQuery(input);
    const offset = parseCursor(input.cursor);
    const count = Math.min(Math.max(input.limit, 1), this.maxPageSize);

    const params = new URLSearchParams({
      q: query,
      count: String(count),
      offset: String(offset),
    });
    const requestUrl = `${this.baseUrl}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(requestUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-subscription-token': this.apiKey,
        },
        signal: controller.signal,
      });
    } catch (error: unknown) {
      throw new BraveSearchRequestError(
        'Brave Search request failed before receiving a response',
        {
          statusCode: null,
          responseBody: null,
          url: requestUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
      throw new BraveSearchRateLimitError('Brave Search request rate limited', retryAfterSeconds);
    }

    if (!response.ok) {
      const body = await this.readResponseBody(response);
      throw new BraveSearchRequestError(
        `Brave Search request failed with status ${response.status}`,
        {
          statusCode: response.status,
          responseBody: body,
          url: requestUrl,
        },
      );
    }

    const payload = (await response.json()) as BraveSearchResponse;
    const rawResults = Array.isArray(payload.web?.results) ? payload.web?.results ?? [] : [];
    const leads: BraveSearchDiscoveredLead[] = [];

    for (const entry of rawResults) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const value = entry as Record<string, unknown>;
      const url = normalizeString(value.url);
      const domain = parseDomain(url);
      if (!domain || !url) {
        continue;
      }

      const companyName = normalizeString(value.title) ?? domainToName(domain);
      // TODO(provider-brave): Replace guessed contacts with page extraction for real contact identities.
      leads.push({
        provider: 'brave_search',
        providerRecordId: url,
        firstName: companyName,
        lastName: '',
        email: `info@${domain}`,
        title: null,
        companyName,
        companyDomain: domain,
        companySize: null,
        country: null,
        raw: entry,
      });
    }

    const nextOffset = payload.web?.next_offset;
    const nextCursor = typeof nextOffset === 'number' && Number.isFinite(nextOffset) ? String(nextOffset) : null;

    return {
      leads,
      nextCursor,
      source: 'brave_search_api',
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.nextAllowedRequestAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private async readResponseBody(response: Response): Promise<string | null> {
    try {
      const body = await response.text();
      return body.length > 0 ? body : null;
    } catch {
      return null;
    }
  }
}
