import type { GoogleSearchIcpFilters } from './googleSearch.adapter.js';

export interface CompanySearchDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  query?: string;
  filters?: GoogleSearchIcpFilters;
}

export interface CompanySearchDiscoveredLead {
  provider: 'company_search_free';
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

export interface CompanySearchDiscoveryResult {
  leads: CompanySearchDiscoveredLead[];
  nextCursor: string | null;
  source: 'company_autocomplete' | 'stub';
}

export interface CompanySearchAdapterConfig {
  enabled: boolean;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://autocomplete.clearbit.com/v1/companies/suggest';
const DEFAULT_TIMEOUT_MS = 10000;

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function domainToName(domain: string): string {
  const [name] = domain.split('.');
  if (!name) {
    return 'Company';
  }

  return name.slice(0, 1).toUpperCase() + name.slice(1);
}

function deriveQuery(input: CompanySearchDiscoveryRequest): string | null {
  if (input.query) {
    return input.query;
  }

  if (input.filters?.industries?.length) {
    return input.filters.industries[0] ?? null;
  }

  return null;
}

export class CompanySearchAdapter {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CompanySearchAdapterConfig) {
    this.enabled = config.enabled;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(input: CompanySearchDiscoveryRequest): Promise<CompanySearchDiscoveryResult> {
    const query = deriveQuery(input);

    if (!this.enabled || !query) {
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
      const url = `${this.baseUrl}?query=${encodeURIComponent(query)}`;
      response = await this.fetchImpl(url, {
        method: 'GET',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Company search request failed: status=${response.status} body=${body}`);
    }

    const payload = (await response.json()) as unknown;
    const items = Array.isArray(payload) ? payload : [];
    const leads: CompanySearchDiscoveredLead[] = [];

    for (const item of items.slice(0, Math.max(1, input.limit))) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const value = item as Record<string, unknown>;
      const domain = normalizeString(value.domain);
      if (!domain) {
        continue;
      }

      const companyName = normalizeString(value.name) ?? domainToName(domain);
      leads.push({
        provider: 'company_search_free',
        providerRecordId: domain,
        firstName: companyName,
        lastName: '',
        email: `info@${domain.toLowerCase()}`,
        title: null,
        companyName,
        companyDomain: domain.toLowerCase(),
        companySize: null,
        country: null,
        raw: item,
      });
    }

    return {
      leads,
      nextCursor: null,
      source: 'company_autocomplete',
    };
  }
}
