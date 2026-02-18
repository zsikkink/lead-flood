import type { GoogleSearchIcpFilters } from './googleSearch.adapter.js';

export interface GooglePlacesDiscoveryRequest {
  icpProfileId?: string;
  limit: number;
  cursor?: string;
  correlationId?: string;
  query?: string;
  filters?: GoogleSearchIcpFilters;
}

export interface GooglePlacesDiscoveredLead {
  provider: 'google_places';
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

export interface GooglePlacesDiscoveryResult {
  leads: GooglePlacesDiscoveredLead[];
  nextCursor: string | null;
  source: 'google_places_api' | 'stub';
}

export interface GooglePlacesAdapterConfig {
  enabled: boolean;
  apiKey: string | undefined;
  baseUrl?: string;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface GooglePlacesResponse {
  places?: unknown[];
  nextPageToken?: string;
}

const DEFAULT_BASE_URL = 'https://places.googleapis.com/v1/places:searchText';
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

function uniqueTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function quoteTerm(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
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

export function buildGooglePlacesQuery(
  input: Pick<GooglePlacesDiscoveryRequest, 'query' | 'filters'>,
): string {
  if (input.query && input.query.trim().length > 0) {
    return input.query.trim();
  }

  const industries = uniqueTerms(input.filters?.industries ?? []);
  const countries = uniqueTerms(input.filters?.countries ?? []);
  const includeTerms = uniqueTerms(input.filters?.includeTerms ?? []);

  const terms = [
    ...industries.slice(0, 2).map((term) => quoteTerm(term)),
    ...countries.slice(0, 2).map((term) => quoteTerm(term)),
    ...includeTerms.slice(0, 2).map((term) => quoteTerm(term)),
    '"contact us"',
    '"WhatsApp"',
  ];

  if (terms.length > 2) {
    return terms.join(' ');
  }

  return 'small business "contact us" "WhatsApp"';
}

function extractCountryFromAddress(place: Record<string, unknown>): string | null {
  const addressComponents = Array.isArray(place.addressComponents)
    ? place.addressComponents
    : [];

  for (const component of addressComponents) {
    if (!component || typeof component !== 'object') {
      continue;
    }

    const typed = component as Record<string, unknown>;
    const types = Array.isArray(typed.types) ? typed.types : [];
    if (types.includes('country')) {
      const shortText = normalizeString(typed.shortText);
      if (shortText) {
        return shortText;
      }
      const longText = normalizeString(typed.longText);
      if (longText) {
        return longText;
      }
    }
  }

  return null;
}

export class GooglePlacesRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'GooglePlacesRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface GooglePlacesRequestErrorContext {
  statusCode: number | null;
  responseBody: string | null;
  url: string;
}

export class GooglePlacesRequestError extends Error {
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly url: string;
  override readonly cause: unknown;

  constructor(message: string, context: GooglePlacesRequestErrorContext, cause?: unknown) {
    super(message);
    this.name = 'GooglePlacesRequestError';
    this.statusCode = context.statusCode;
    this.responseBody = context.responseBody;
    this.url = context.url;
    this.cause = cause;
  }
}

export class GooglePlacesAdapter {
  private readonly enabled: boolean;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly minRequestIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextAllowedRequestAt = 0;

  constructor(config: GooglePlacesAdapterConfig) {
    this.enabled = config.enabled;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async discoverLeads(input: GooglePlacesDiscoveryRequest): Promise<GooglePlacesDiscoveryResult> {
    if (!this.enabled || !this.apiKey) {
      return {
        leads: [],
        nextCursor: null,
        source: 'stub',
      };
    }

    await this.waitForRateLimit();

    const query = buildGooglePlacesQuery(input);
    const maxResultCount = Math.min(Math.max(input.limit, 1), 20);

    const requestBody: Record<string, unknown> = {
      textQuery: query,
      maxResultCount,
    };
    if (input.cursor) {
      requestBody.pageToken = input.cursor;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
          'x-goog-fieldmask':
            'places.id,places.displayName,places.websiteUri,places.googleMapsUri,places.addressComponents,nextPageToken',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      throw new GooglePlacesRequestError(
        'Google Places request failed before receiving a response',
        {
          statusCode: null,
          responseBody: null,
          url: this.baseUrl,
        },
        error,
      );
    } finally {
      clearTimeout(timeout);
      this.nextAllowedRequestAt = Date.now() + this.minRequestIntervalMs;
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
      throw new GooglePlacesRateLimitError('Google Places request rate limited', retryAfterSeconds);
    }

    if (!response.ok) {
      const body = await this.readResponseBody(response);
      throw new GooglePlacesRequestError(
        `Google Places request failed with status ${response.status}`,
        {
          statusCode: response.status,
          responseBody: body,
          url: this.baseUrl,
        },
      );
    }

    const payload = (await response.json()) as GooglePlacesResponse;
    const rawPlaces = Array.isArray(payload.places) ? payload.places : [];
    const leads: GooglePlacesDiscoveredLead[] = [];

    for (const rawPlace of rawPlaces) {
      if (!rawPlace || typeof rawPlace !== 'object') {
        continue;
      }

      const place = rawPlace as Record<string, unknown>;
      const website =
        normalizeString(place.websiteUri) ??
        normalizeString(place.googleMapsUri);
      const domain = parseDomain(website);
      if (!domain) {
        continue;
      }

      const displayName =
        place.displayName && typeof place.displayName === 'object'
          ? (place.displayName as Record<string, unknown>)
          : null;

      const companyName =
        normalizeString(displayName?.text) ??
        normalizeString(place.name) ??
        domainToName(domain);
      const providerRecordId = normalizeString(place.id) ?? `places:${domain}`;

      // TODO(provider-places): Replace inferred contacts with place details + contact parsing.
      leads.push({
        provider: 'google_places',
        providerRecordId,
        firstName: companyName,
        lastName: '',
        email: `info@${domain}`,
        title: null,
        companyName,
        companyDomain: domain,
        companySize: null,
        country: extractCountryFromAddress(place),
        raw: rawPlace,
      });
    }

    return {
      leads,
      nextCursor: normalizeString(payload.nextPageToken),
      source: 'google_places_api',
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
