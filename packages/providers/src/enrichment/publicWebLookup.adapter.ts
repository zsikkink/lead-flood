import type { NormalizedEnrichmentPayload } from './normalized.types.js';

export interface PublicWebLookupEnrichmentRequest {
  email?: string;
  domain?: string;
  companyName?: string;
  correlationId?: string;
}

export interface PublicWebLookupFailure {
  classification: 'retryable' | 'terminal';
  statusCode: number | null;
  message: string;
  raw: unknown;
}

export type PublicWebLookupEnrichmentResult =
  | {
      status: 'success';
      normalized: NormalizedEnrichmentPayload;
      raw: unknown;
    }
  | {
      status: 'retryable_error';
      failure: PublicWebLookupFailure;
    }
  | {
      status: 'terminal_error';
      failure: PublicWebLookupFailure;
    };

export interface PublicWebLookupAdapterConfig {
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

export class PublicWebLookupAdapter {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: PublicWebLookupAdapterConfig) {
    this.enabled = config.enabled;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async enrichLead(request: PublicWebLookupEnrichmentRequest): Promise<PublicWebLookupEnrichmentResult> {
    if (!this.enabled) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'Public web lookup enrichment is disabled',
          raw: null,
        },
      };
    }

    const domain = request.domain ?? domainFromEmail(request.email) ?? null;
    const query = domain ?? request.companyName ?? null;
    if (!query) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'Public lookup requires domain, companyName, or email',
          raw: null,
        },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}?query=${encodeURIComponent(query)}`, {
        method: 'GET',
        signal: controller.signal,
      });
    } catch (error: unknown) {
      return {
        status: 'retryable_error',
        failure: {
          classification: 'retryable',
          statusCode: null,
          message: error instanceof Error ? error.message : 'Public lookup request failed',
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
      const failure: PublicWebLookupFailure = {
        classification,
        statusCode: response.status,
        message: `Public lookup failed with status ${response.status}`,
        raw,
      };

      return classification === 'retryable'
        ? { status: 'retryable_error', failure }
        : { status: 'terminal_error', failure };
    }

    const normalized = this.normalize(raw, request, domain);
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
    request: PublicWebLookupEnrichmentRequest,
    derivedDomain: string | null,
  ): NormalizedEnrichmentPayload {
    const list = Array.isArray(raw) ? raw : [];
    const first = list[0] && typeof list[0] === 'object' ? (list[0] as Record<string, unknown>) : {};

    const companyName = normalizeString(first.name) ?? normalizeString(request.companyName);
    const domain = normalizeString(first.domain) ?? derivedDomain;
    const email = normalizeString(request.email) ?? (domain ? `info@${domain}` : null);

    return {
      email,
      domain,
      companyName,
      industry: null,
      employeeCount: null,
      country: null,
      city: null,
      linkedinUrl: null,
      website:
        normalizeString(first.site?.toString()) ??
        (domain ? `https://${domain}` : null),
    };
  }
}
