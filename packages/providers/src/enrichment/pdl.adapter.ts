import type { NormalizedEnrichmentPayload } from './normalized.types.js';

export interface PdlEnrichmentRequest {
  email?: string;
  domain?: string;
  companyName?: string;
  correlationId?: string;
}

export interface PdlFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type PdlEnrichmentResult =
  | {
      status: 'success';
      normalized: NormalizedEnrichmentPayload;
      raw: unknown;
    }
  | {
      status: 'retryable_error';
      failure: PdlFailure;
    }
  | {
      status: 'terminal_error';
      failure: PdlFailure;
    };

export interface PdlEnrichmentAdapterConfig {
  apiKey: string;
  baseUrl?: string;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_PDL_BASE_URL = 'https://api.peopledatalabs.com';
const DEFAULT_PDL_MIN_REQUEST_INTERVAL_MS = 250;
const DEFAULT_PDL_TIMEOUT_MS = 10000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

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

export class PdlEnrichmentAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: PdlEnrichmentAdapterConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_PDL_BASE_URL;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_PDL_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_PDL_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async enrichLead(input: PdlEnrichmentRequest): Promise<PdlEnrichmentResult> {
    if (!input.email && !input.domain && !input.companyName) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'PDL enrichment requires at least one lookup key',
          raw: null,
        },
      };
    }

    await this.waitForRateLimit();

    const query = new URLSearchParams();
    query.set('api_key', this.apiKey);
    if (input.email) {
      query.set('email', input.email);
    }
    if (input.domain) {
      query.set('company_domain', input.domain);
    }
    if (input.companyName) {
      query.set('company', input.companyName);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v5/person/enrich?${query.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      });
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'PDL network request failed',
          raw: error,
        },
      };
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    const responseText = await response.text();
    const parsedBody = this.parseResponseBody(responseText);

    if (!response.ok) {
      const classification = classifyStatus(response.status);
      const failure: PdlFailure = {
        classification,
        statusCode: response.status,
        message: `PDL enrichment failed with status ${response.status}`,
        raw: parsedBody,
      };

      return classification === 'retryable'
        ? {
            status: 'retryable_error',
            failure,
          }
        : {
            status: 'terminal_error',
            failure,
          };
    }

    return {
      status: 'success',
      normalized: this.normalizePerson(parsedBody),
      raw: parsedBody,
    };
  }

  private parseResponseBody(responseText: string): unknown {
    if (!responseText) {
      return null;
    }

    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      return responseText;
    }
  }

  private normalizePerson(raw: unknown): NormalizedEnrichmentPayload {
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const experience =
      Array.isArray(value.experience) && value.experience.length > 0
        ? value.experience[0]
        : null;
    const primaryExperience =
      experience && typeof experience === 'object' ? (experience as Record<string, unknown>) : null;

    const domain = normalizeString(primaryExperience?.company_domain);

    return {
      email: normalizeString(value.work_email) ?? normalizeString(value.personal_email),
      domain,
      companyName: normalizeString(primaryExperience?.company),
      industry: normalizeString(primaryExperience?.industry),
      employeeCount: normalizeNumber(primaryExperience?.company_size),
      country: normalizeString(value.location_country),
      city: normalizeString(value.location_locality),
      phone: normalizeString(value.mobile_phone),
      linkedinUrl: normalizeString(value.linkedin_url),
      website:
        normalizeString(primaryExperience?.company_website) ??
        normalizeString(value.website) ??
        (domain ? `https://${domain}` : null),
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.nextAllowedRequestAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
