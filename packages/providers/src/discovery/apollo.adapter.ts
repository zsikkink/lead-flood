export interface DiscoveryIcpFilters {
  industries?: string[];
  countries?: string[];
  requiredTechnologies?: string[];
  excludedDomains?: string[];
  minCompanySize?: number;
  maxCompanySize?: number;
}

export interface ApolloDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  filters?: DiscoveryIcpFilters;
}

export interface NormalizedDiscoveredLead {
  provider: 'apollo';
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

export interface ApolloDiscoveryResult {
  leads: NormalizedDiscoveredLead[];
  nextCursor: string | null;
  rateLimitedUntil: Date | null;
}

export interface ApolloDiscoveryAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  maxPageSize?: number;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ApolloPeopleSearchResponse {
  people?: unknown;
  pagination?: {
    page?: number;
    total_pages?: number;
    next_page?: number;
  };
}

const DEFAULT_APOLLO_BASE_URL = 'https://api.apollo.io';
const DEFAULT_APOLLO_MAX_PAGE_SIZE = 25;
const DEFAULT_APOLLO_MIN_REQUEST_INTERVAL_MS = 250;
const DEFAULT_APOLLO_TIMEOUT_MS = 10000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCompanySize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized || !normalized.includes('@')) {
    return null;
  }

  return normalized.toLowerCase();
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 1;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseRetryAfterSeconds(retryAfterHeader: string | null): number {
  if (!retryAfterHeader) {
    return 30;
  }

  const numeric = Number.parseInt(retryAfterHeader, 10);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 30;
}

export class ApolloRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'ApolloRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ApolloDiscoveryAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxPageSize: number;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: ApolloDiscoveryAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_APOLLO_BASE_URL;
    this.maxPageSize = config.maxPageSize ?? DEFAULT_APOLLO_MAX_PAGE_SIZE;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_APOLLO_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_APOLLO_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(input: ApolloDiscoveryRequest): Promise<ApolloDiscoveryResult> {
    await this.waitForRateLimit();

    const page = parseCursor(input.cursor);
    const perPage = Math.min(Math.max(input.limit, 1), this.maxPageSize);

    const requestBody: Record<string, unknown> = {
      page,
      per_page: perPage,
    };

    if (input.filters?.countries?.length) {
      requestBody.person_locations = input.filters.countries;
    }

    if (input.filters?.industries?.length) {
      requestBody.q_keywords = input.filters.industries.join(' ');
    }

    if (input.filters?.requiredTechnologies?.length) {
      requestBody.q_organization_technology_names = input.filters.requiredTechnologies;
    }

    if (input.filters?.minCompanySize !== undefined) {
      requestBody.q_organization_num_employees_gte = input.filters.minCompanySize;
    }

    if (input.filters?.maxCompanySize !== undefined) {
      requestBody.q_organization_num_employees_lte = input.filters.maxCompanySize;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/mixed_people/search`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
      this.nextAllowedRequestAt = Date.now() + retryAfterSeconds * 1000;
      throw new ApolloRateLimitError('Apollo request rate limited', retryAfterSeconds);
    }

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Apollo request failed: status=${response.status} body=${responseBody}`);
    }

    const payload = (await response.json()) as ApolloPeopleSearchResponse;
    const rawPeople = Array.isArray(payload.people) ? payload.people : [];

    const normalizedLeads = rawPeople
      .map((rawPerson) => this.normalizePerson(rawPerson))
      .filter((lead): lead is NormalizedDiscoveredLead => lead !== null)
      .filter((lead) => this.matchesIcpFilters(lead, input.filters));

    const pagination = payload.pagination ?? {};
    const currentPage = typeof pagination.page === 'number' ? pagination.page : page;
    const nextPage =
      typeof pagination.next_page === 'number'
        ? pagination.next_page
        : typeof pagination.total_pages === 'number' && currentPage < pagination.total_pages
          ? currentPage + 1
          : null;

    return {
      leads: normalizedLeads,
      nextCursor: nextPage ? String(nextPage) : null,
      rateLimitedUntil: null,
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.nextAllowedRequestAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private normalizePerson(rawPerson: unknown): NormalizedDiscoveredLead | null {
    if (!rawPerson || typeof rawPerson !== 'object') {
      return null;
    }

    const value = rawPerson as Record<string, unknown>;
    const organization =
      value.organization && typeof value.organization === 'object'
        ? (value.organization as Record<string, unknown>)
        : null;

    const email = normalizeEmail(value.email);
    const providerRecordId = normalizeString(value.id);

    if (!email || !providerRecordId) {
      return null;
    }

    return {
      provider: 'apollo',
      providerRecordId,
      firstName: normalizeString(value.first_name) ?? '',
      lastName: normalizeString(value.last_name) ?? '',
      email,
      title: normalizeString(value.title),
      companyName: normalizeString(organization?.name),
      companyDomain: normalizeString(organization?.primary_domain),
      companySize: normalizeCompanySize(organization?.estimated_num_employees),
      country: normalizeString(value.country),
      raw: rawPerson,
    };
  }

  private matchesIcpFilters(lead: NormalizedDiscoveredLead, filters?: DiscoveryIcpFilters): boolean {
    if (!filters) {
      return true;
    }

    if (filters.excludedDomains?.length && lead.companyDomain) {
      const normalizedDomain = lead.companyDomain.toLowerCase();
      if (filters.excludedDomains.some((domain) => domain.toLowerCase() === normalizedDomain)) {
        return false;
      }
    }

    if (filters.minCompanySize !== undefined && lead.companySize !== null) {
      if (lead.companySize < filters.minCompanySize) {
        return false;
      }
    }

    if (filters.maxCompanySize !== undefined && lead.companySize !== null) {
      if (lead.companySize > filters.maxCompanySize) {
        return false;
      }
    }

    if (filters.countries?.length && lead.country) {
      const countries = new Set(filters.countries.map((country) => country.toLowerCase()));
      if (!countries.has(lead.country.toLowerCase())) {
        return false;
      }
    }

    return true;
  }
}
