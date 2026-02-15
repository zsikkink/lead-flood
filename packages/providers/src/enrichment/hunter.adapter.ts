export interface HunterEnrichmentRequest {
  email?: string;
  domain?: string;
  companyName?: string;
  correlationId?: string;
}

export interface HunterEnrichedLead {
  provider: 'hunter';
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companySize: number | null;
  industry: string | null;
  locationCountry: string | null;
  raw: unknown;
}

export interface HunterFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type HunterEnrichmentResult =
  | {
      status: 'success';
      normalized: HunterEnrichedLead;
      raw: unknown;
    }
  | {
      status: 'retryable_error';
      failure: HunterFailure;
    }
  | {
      status: 'terminal_error';
      failure: HunterFailure;
    };

export interface HunterAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.hunter.io/v2';
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

function classifyStatus(statusCode: number): 'retryable' | 'terminal' {
  if (statusCode === 429 || statusCode >= 500) {
    return 'retryable';
  }

  return 'terminal';
}

function domainFromEmail(email?: string): string | null {
  if (!email || !email.includes('@')) {
    return null;
  }

  const [, domain] = email.split('@');
  return domain?.toLowerCase() ?? null;
}

export class HunterAdapter {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: HunterAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async enrichLead(request: HunterEnrichmentRequest): Promise<HunterEnrichmentResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'HUNTER_API_KEY is not configured',
          raw: null,
        },
      };
    }

    const domain = request.domain ?? domainFromEmail(request.email) ?? null;
    if (!request.email && !domain) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'Hunter enrichment requires email or domain',
          raw: null,
        },
      };
    }

    await this.waitForRateLimit();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    let lookupMode: 'email_verifier' | 'domain_search';
    try {
      if (request.email) {
        lookupMode = 'email_verifier';
        const params = new URLSearchParams({
          api_key: this.apiKey,
          email: request.email,
        });
        response = await this.fetchImpl(`${this.baseUrl}/email-verifier?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
        });
      } else {
        lookupMode = 'domain_search';
        const params = new URLSearchParams({
          api_key: this.apiKey,
          domain: domain ?? '',
          limit: '1',
        });
        response = await this.fetchImpl(`${this.baseUrl}/domain-search?${params.toString()}`, {
          method: 'GET',
          signal: controller.signal,
        });
      }
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'Hunter request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    const rawText = await response.text();
    const raw = this.parseRaw(rawText);

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: HunterFailure = {
        classification,
        statusCode: response.status,
        message: `Hunter enrichment failed with status ${response.status}`,
        raw,
      };

      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    const normalized = this.normalize(raw, lookupMode, request, domain);
    return {
      status: 'success',
      normalized,
      raw,
    };
  }

  private parseRaw(rawText: string): unknown {
    if (!rawText) {
      return null;
    }

    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      return rawText;
    }
  }

  private normalize(
    raw: unknown,
    lookupMode: 'email_verifier' | 'domain_search',
    request: HunterEnrichmentRequest,
    domain: string | null,
  ): HunterEnrichedLead {
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const data = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : {};
    const firstDomainEmail =
      Array.isArray(data.emails) && data.emails.length > 0 && data.emails[0] && typeof data.emails[0] === 'object'
        ? (data.emails[0] as Record<string, unknown>)
        : null;

    const firstName =
      normalizeString(data.first_name) ??
      normalizeString(firstDomainEmail?.first_name);
    const lastName =
      normalizeString(data.last_name) ??
      normalizeString(firstDomainEmail?.last_name);

    const fullName =
      normalizeString(data.full_name) ??
      ([firstName, lastName].filter(Boolean).join(' ').trim() || null);

    const email =
      normalizeString(data.email) ??
      normalizeString(firstDomainEmail?.value) ??
      normalizeString(request.email);

    return {
      provider: 'hunter',
      fullName,
      firstName,
      lastName,
      email,
      title: normalizeString(firstDomainEmail?.position),
      linkedinUrl: null,
      companyName: normalizeString(data.organization) ?? normalizeString(request.companyName),
      companyDomain: domain,
      companySize: null,
      industry: null,
      locationCountry: null,
      raw: {
        mode: lookupMode,
        payload: raw,
      },
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.nextAllowedRequestAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
