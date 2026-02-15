export interface ClearbitEnrichmentRequest {
  email?: string;
  domain?: string;
  companyName?: string;
  correlationId?: string;
}

export interface ClearbitEnrichedLead {
  provider: 'clearbit';
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

export interface ClearbitFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type ClearbitEnrichmentResult =
  | {
      status: 'success';
      normalized: ClearbitEnrichedLead;
      raw: unknown;
    }
  | {
      status: 'retryable_error';
      failure: ClearbitFailure;
    }
  | {
      status: 'terminal_error';
      failure: ClearbitFailure;
    };

export interface ClearbitAdapterConfig {
  apiKey: string | undefined;
  personBaseUrl?: string;
  companyBaseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_PERSON_BASE_URL = 'https://person.clearbit.com/v2/people/find';
const DEFAULT_COMPANY_BASE_URL = 'https://company.clearbit.com/v2/companies/find';
const DEFAULT_TIMEOUT_MS = 10000;

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

export class ClearbitAdapter {
  private readonly apiKey: string | undefined;
  private readonly personBaseUrl: string;
  private readonly companyBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ClearbitAdapterConfig) {
    this.apiKey = config.apiKey;
    this.personBaseUrl = config.personBaseUrl ?? DEFAULT_PERSON_BASE_URL;
    this.companyBaseUrl = config.companyBaseUrl ?? DEFAULT_COMPANY_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async enrichLead(request: ClearbitEnrichmentRequest): Promise<ClearbitEnrichmentResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'CLEARBIT_API_KEY is not configured',
          raw: null,
        },
      };
    }

    if (!request.email && !request.domain && !request.companyName) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'Clearbit enrichment requires email, domain, or companyName',
          raw: null,
        },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    let lookupTarget: 'person' | 'company';
    try {
      if (request.email) {
        lookupTarget = 'person';
        const params = new URLSearchParams({ email: request.email });
        response = await this.fetchImpl(`${this.personBaseUrl}?${params.toString()}`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });
      } else {
        lookupTarget = 'company';
        const params = new URLSearchParams();
        if (request.domain) {
          params.set('domain', request.domain);
        }
        if (!request.domain && request.companyName) {
          params.set('name', request.companyName);
        }

        response = await this.fetchImpl(`${this.companyBaseUrl}?${params.toString()}`, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });
      }
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'Clearbit request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
    }

    const rawText = await response.text();
    const raw = this.parseRaw(rawText);

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: ClearbitFailure = {
        classification,
        statusCode: response.status,
        message: `Clearbit enrichment failed with status ${response.status}`,
        raw,
      };

      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    const normalized = this.normalize(raw, lookupTarget, request);
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
    lookupTarget: 'person' | 'company',
    request: ClearbitEnrichmentRequest,
  ): ClearbitEnrichedLead {
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const company =
      value.company && typeof value.company === 'object' ? (value.company as Record<string, unknown>) : null;
    const geo = value.geo && typeof value.geo === 'object' ? (value.geo as Record<string, unknown>) : null;

    return {
      provider: 'clearbit',
      fullName: normalizeString(value.name?.toString()),
      firstName: normalizeString(value.name?.toString()?.split(' ')[0]),
      lastName: null,
      email: normalizeString(value.email) ?? normalizeString(request.email),
      title: normalizeString(value.title),
      linkedinUrl: normalizeString(value.linkedin?.toString()),
      companyName: normalizeString(company?.name) ?? normalizeString(value.name),
      companyDomain:
        normalizeString(company?.domain) ??
        normalizeString(request.domain) ??
        domainFromEmail(request.email),
      companySize: normalizeNumber(company?.metrics && (company.metrics as Record<string, unknown>).employees),
      industry: normalizeString(company?.category && (company.category as Record<string, unknown>).industry),
      locationCountry: normalizeString(geo?.country),
      raw: {
        target: lookupTarget,
        payload: raw,
      },
    };
  }
}
