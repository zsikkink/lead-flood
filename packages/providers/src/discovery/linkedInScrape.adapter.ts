import type { GoogleSearchIcpFilters } from './googleSearch.adapter.js';

export interface LinkedInScrapeDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  query?: string;
  filters?: GoogleSearchIcpFilters;
}

export interface LinkedInScrapedLead {
  provider: 'linkedin_scrape';
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

export interface LinkedInScrapeResult {
  leads: LinkedInScrapedLead[];
  nextCursor: string | null;
  source: 'scrape_api' | 'stub';
}

export interface LinkedInScrapeAdapterConfig {
  enabled: boolean;
  scrapeEndpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface LinkedInScrapeResponse {
  profiles?: unknown[];
  nextCursor?: string | null;
}

const DEFAULT_TIMEOUT_MS = 15000;

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export class LinkedInScrapeRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'LinkedInScrapeRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LinkedInScrapeAdapter {
  private readonly enabled: boolean;
  private readonly scrapeEndpoint: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LinkedInScrapeAdapterConfig) {
    this.enabled = config.enabled;
    this.scrapeEndpoint = config.scrapeEndpoint;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(request: LinkedInScrapeDiscoveryRequest): Promise<LinkedInScrapeResult> {
    if (!this.enabled || !this.scrapeEndpoint) {
      return {
        leads: [],
        nextCursor: null,
        source: 'stub',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.scrapeEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '60', 10);
      const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
      throw new LinkedInScrapeRateLimitError('LinkedIn scrape endpoint rate limited', retryAfterSeconds);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LinkedIn scrape request failed: status=${response.status} body=${body}`);
    }

    const payload = (await response.json()) as LinkedInScrapeResponse;
    const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];
    const leads: LinkedInScrapedLead[] = [];

    for (const profile of profiles) {
      if (!profile || typeof profile !== 'object') {
        continue;
      }

      const value = profile as Record<string, unknown>;
      const email = normalizeString(value.email);
      const providerRecordId = normalizeString(value.id) ?? normalizeString(value.profileUrl);
      if (!email || !providerRecordId) {
        continue;
      }

      leads.push({
        provider: 'linkedin_scrape',
        providerRecordId,
        firstName: normalizeString(value.firstName) ?? 'Unknown',
        lastName: normalizeString(value.lastName) ?? '',
        email: email.toLowerCase(),
        title: normalizeString(value.title),
        companyName: normalizeString(value.companyName),
        companyDomain: normalizeString(value.companyDomain),
        companySize: typeof value.companySize === 'number' ? value.companySize : null,
        country: normalizeString(value.country),
        raw: profile,
      });
    }

    return {
      leads,
      nextCursor: payload.nextCursor ?? null,
      source: 'scrape_api',
    };
  }
}
