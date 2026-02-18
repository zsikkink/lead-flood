import type {
  CreateDiscoveryRunRequest,
  DiscoveryProvider,
  EnrichmentProvider,
} from '@lead-flood/contracts';
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@lead-flood/db';
import {
  ApolloRateLimitError,
  BraveSearchRateLimitError,
  GooglePlacesRateLimitError,
  GoogleSearchRateLimitError,
  LinkedInScrapeRateLimitError,
} from '@lead-flood/providers';
import type {
  ApolloDiscoveryAdapter,
  ApolloDiscoveryRequest,
  BraveSearchAdapter,
  BraveSearchDiscoveryRequest,
  CompanySearchAdapter,
  CompanySearchDiscoveryRequest,
  GooglePlacesAdapter,
  GooglePlacesDiscoveryRequest,
  GoogleSearchAdapter,
  GoogleSearchDiscoveryRequest,
  LinkedInScrapeAdapter,
  LinkedInScrapeDiscoveryRequest,
} from '@lead-flood/providers';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  ENRICHMENT_RUN_JOB_NAME,
  ENRICHMENT_RUN_RETRY_OPTIONS,
  type EnrichmentRunJobPayload,
} from './enrichment.run.job.js';

export const DISCOVERY_RUN_JOB_NAME = 'discovery.run';
export const DISCOVERY_RUN_IDEMPOTENCY_KEY_PATTERN = 'discovery.run:${runId}';

export const DISCOVERY_RUN_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'discovery.run.dead_letter',
};

const DISCOVERY_RECORD_JOB_TYPE = 'lead.discovery';
const DEFAULT_DISCOVERY_LIMIT = 25;

export interface DiscoveryRunFilters {
  industries?: string[];
  countries?: string[];
  requiredTechnologies?: string[];
  excludedDomains?: string[];
  minCompanySize?: number;
  maxCompanySize?: number;
  includeTerms?: string[];
  excludeTerms?: string[];
}

export interface DiscoveryRunJobPayload
  extends Pick<CreateDiscoveryRunRequest, 'icpProfileId' | 'provider' | 'limit' | 'cursor' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
  filters?: DiscoveryRunFilters;
}

export interface DiscoveryRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface DiscoveryRunDependencies {
  boss: Pick<PgBoss, 'send'>;
  apolloAdapter: ApolloDiscoveryAdapter;
  braveSearchAdapter: BraveSearchAdapter;
  googlePlacesAdapter: GooglePlacesAdapter;
  googleSearchAdapter: GoogleSearchAdapter;
  linkedInScrapeAdapter: LinkedInScrapeAdapter;
  companySearchAdapter: CompanySearchAdapter;
  discoveryEnabled: boolean;
  apolloEnabled: boolean;
  braveSearchEnabled: boolean;
  googlePlacesEnabled: boolean;
  googleSearchEnabled: boolean;
  linkedInScrapeEnabled: boolean;
  companySearchEnabled: boolean;
  defaultProvider: DiscoveryProvider;
  providerOrder?: DiscoveryProvider[];
  defaultEnrichmentProvider: EnrichmentProvider;
  defaultLimit?: number;
}

interface DiscoveryLeadProvenance {
  provider: DiscoveryProvider;
  providerSource: string;
  providerRecordId: string;
  confidence: number | null;
}

interface NormalizedDiscoveredLead {
  provider: DiscoveryProvider;
  providerSource: string;
  providerConfidence: number | null;
  adapterProvider: string;
  provenance: DiscoveryLeadProvenance[];
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

interface DiscoveryExecutionResult {
  provider: DiscoveryProvider;
  source: string;
  leads: NormalizedDiscoveredLead[];
  nextCursor: string | null;
}

interface DiscoveryRunProgress {
  totalItems: number;
  processedItems: number;
  failedItems: number;
}

const PROVIDER_DEFAULT_CONFIDENCE: Record<DiscoveryProvider, number> = {
  BRAVE_SEARCH: 0.75,
  GOOGLE_PLACES: 0.85,
  GOOGLE_SEARCH: 0.7,
  LINKEDIN_SCRAPE: 0.65,
  COMPANY_SEARCH_FREE: 0.6,
  APOLLO: 0.9,
};

function deriveLeadName(email: string): { firstName: string; lastName: string } {
  const localPart = email.split('@')[0] ?? 'lead';
  const [first, ...rest] = localPart.split('.');

  return {
    firstName: first ? first.slice(0, 1).toUpperCase() + first.slice(1) : 'Lead',
    lastName: rest.join(' ').trim(),
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return 0;
}

function readRunProgress(result: unknown): DiscoveryRunProgress {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {
      totalItems: 0,
      processedItems: 0,
      failedItems: 0,
    };
  }

  const payload = result as Record<string, unknown>;
  return {
    totalItems: toCount(payload.totalItems),
    processedItems: toCount(payload.processedItems),
    failedItems: toCount(payload.failedItems),
  };
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const extendedError = error as Error & {
      statusCode?: unknown;
      responseBody?: unknown;
      body?: unknown;
      url?: unknown;
      code?: unknown;
      retryAfterSeconds?: unknown;
      cause?: unknown;
    };

    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: nonEmptyString(error.stack),
    };

    if (typeof extendedError.statusCode === 'number' && Number.isFinite(extendedError.statusCode)) {
      serialized.statusCode = extendedError.statusCode;
    }

    const url = nonEmptyString(extendedError.url);
    if (url) {
      serialized.url = url;
    }

    const responseBody =
      nonEmptyString(extendedError.responseBody) ??
      nonEmptyString(extendedError.body);
    if (responseBody) {
      serialized.responseBody = responseBody;
    }

    if (typeof extendedError.code === 'string') {
      serialized.code = extendedError.code;
    }

    if (
      typeof extendedError.retryAfterSeconds === 'number' &&
      Number.isFinite(extendedError.retryAfterSeconds)
    ) {
      serialized.retryAfterSeconds = extendedError.retryAfterSeconds;
    }

    if (extendedError.cause instanceof Error) {
      serialized.cause = {
        name: extendedError.cause.name,
        message: extendedError.cause.message,
        stack: nonEmptyString(extendedError.cause.stack),
      };
    }

    return serialized;
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
      stack: null,
    };
  }

  return {
    name: 'Error',
    message: 'Unknown discovery.run failure',
    stack: null,
    errorType: typeof error,
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function extractStringValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function appendUnique(target: string[], source: string[]): string[] {
  return uniqueStrings([...target, ...source]);
}

function quoteSearchTerm(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

function toCountryDomainHints(country: string): string[] {
  const normalized = normalizeString(country);
  if (!normalized) {
    return [];
  }

  if (
    ['uae', 'united arab emirates', 'emirates', 'ae'].includes(normalized)
  ) {
    return ['ae'];
  }
  if (
    ['ksa', 'saudi arabia', 'saudi', 'sa'].includes(normalized)
  ) {
    return ['sa'];
  }
  if (['jordan', 'jo'].includes(normalized)) {
    return ['jo'];
  }
  if (['egypt', 'eg'].includes(normalized)) {
    return ['eg'];
  }

  if (normalized.length === 2) {
    return [normalized];
  }

  return [];
}

function buildGoogleSearchQueryFromFilters(filters: DiscoveryRunFilters | undefined): string {
  if (!filters) {
    return 'B2B companies';
  }

  const industries = uniqueStrings(filters.industries ?? []);
  const countries = uniqueStrings(filters.countries ?? []);
  const technologies = uniqueStrings(filters.requiredTechnologies ?? []);
  const includeTerms = uniqueStrings(filters.includeTerms ?? []);
  const excludedDomains = uniqueStrings(filters.excludedDomains ?? []);
  const excludedTerms = uniqueStrings(filters.excludeTerms ?? []);

  const hasTargetingContext =
    industries.length > 0 || countries.length > 0 || technologies.length > 0 || includeTerms.length > 0;

  if (hasTargetingContext) {
    const seenClauses = new Set<string>();
    const richClauses: string[] = [];
    const addClause = (value: string): void => {
      const clause = value.trim();
      if (!clause) {
        return;
      }

      const key = clause.toLowerCase();
      if (seenClauses.has(key)) {
        return;
      }

      seenClauses.add(key);
      richClauses.push(clause);
    };

    const prioritizedIndustries = industries.slice(0, 3);
    const prioritizedCountries = countries.slice(0, 3);

    if (prioritizedIndustries.length > 0 && prioritizedCountries.length > 0) {
      for (const country of prioritizedCountries) {
        const countryTerm = quoteSearchTerm(country);
        const countryDomains = toCountryDomainHints(country);

        for (const industry of prioritizedIndustries) {
          const industryTerm = quoteSearchTerm(industry);
          addClause(`${industryTerm} ${countryTerm} "contact us" "WhatsApp"`);
          addClause(`"DM to order" ${industryTerm} ${countryTerm}`);
          addClause(`"send payment link" ${industryTerm} ${countryTerm}`);

          for (const countryDomain of countryDomains.slice(0, 2)) {
            addClause(`site:.${countryDomain} ${industryTerm} "contact us" WhatsApp`);
          }
        }

        addClause(`${countryTerm} "DM for orders" "WhatsApp order"`);
        addClause(`${countryTerm} "shop online" "order now"`);
      }
    }

    const broadIntentTerms = [
      '"contact us"',
      '"order now"',
      '"DM for orders"',
      '"WhatsApp"',
      '"WhatsApp order"',
      '"shop online"',
    ];

    const targetingTerms = [
      ...prioritizedIndustries.map((value) => quoteSearchTerm(value)),
      ...prioritizedCountries.map((value) => quoteSearchTerm(value)),
      ...technologies.slice(0, 2).map((value) => quoteSearchTerm(value)),
      ...includeTerms.slice(0, 2).map((value) => quoteSearchTerm(value)),
    ];

    if (targetingTerms.length > 0) {
      addClause(`${targetingTerms.join(' ')} ${broadIntentTerms.join(' ')}`);
    } else {
      addClause(`SMB businesses ${broadIntentTerms.join(' ')}`);
    }

    const maxClauses = 8;
    const queryClauses = richClauses.slice(0, maxClauses);
    const parts: string[] = [];
    if (queryClauses.length > 0) {
      parts.push(queryClauses.map((clause) => `(${clause})`).join(' OR '));
    }
    for (const domain of excludedDomains) {
      parts.push(`-site:${domain}`);
    }
    for (const term of excludedTerms) {
      parts.push(`-${quoteSearchTerm(term)}`);
    }

    return parts.join(' ').trim();
  }

  const parts: string[] = ['B2B companies'];
  for (const domain of excludedDomains) {
    parts.push(`-site:${domain}`);
  }
  for (const term of excludedTerms) {
    parts.push(`-${quoteSearchTerm(term)}`);
  }
  return parts.join(' ').trim();
}

function buildLinkedInQueryFromFilters(filters: DiscoveryRunFilters | undefined): string {
  if (!filters) {
    return 'site:linkedin.com/in sales';
  }

  const includeTerms = uniqueStrings([
    ...(filters.industries ?? []),
    ...(filters.countries ?? []),
    ...(filters.requiredTechnologies ?? []),
    ...(filters.includeTerms ?? []),
  ]);
  const parts: string[] = ['site:linkedin.com/in'];
  if (includeTerms.length > 0) {
    parts.push(includeTerms.map((term) => quoteSearchTerm(term)).join(' '));
  } else {
    parts.push('sales');
  }
  for (const domain of uniqueStrings(filters.excludedDomains ?? [])) {
    parts.push(`-${quoteSearchTerm(domain)}`);
  }
  for (const term of uniqueStrings(filters.excludeTerms ?? [])) {
    parts.push(`-${quoteSearchTerm(term)}`);
  }
  return parts.join(' ').trim();
}

function buildCompanySearchQueryFromFilters(filters: DiscoveryRunFilters | undefined): string | undefined {
  if (!filters) {
    return undefined;
  }
  const terms = uniqueStrings([
    ...(filters.industries ?? []),
    ...(filters.requiredTechnologies ?? []),
    ...(filters.includeTerms ?? []),
  ]);
  return terms.length > 0 ? terms.join(' ') : undefined;
}

function mapRulesToFilters(
  rules: Array<{
    fieldKey: string;
    operator: string;
    valueJson: unknown;
    isActive: boolean;
  }>,
): DiscoveryRunFilters {
  const filters: DiscoveryRunFilters = {
    industries: [],
    countries: [],
    requiredTechnologies: [],
    excludedDomains: [],
    includeTerms: [],
    excludeTerms: [],
  };

  for (const rule of rules) {
    if (!rule.isActive) {
      continue;
    }

    const fieldKey = normalizeString(rule.fieldKey) ?? '';
    const operator = rule.operator;
    const valueStrings = extractStringValues(rule.valueJson);

    if (['industry', 'industry_match', 'company_industry'].includes(fieldKey)) {
      if (['EQ', 'IN', 'CONTAINS'].includes(operator)) {
        filters.industries = appendUnique(filters.industries ?? [], valueStrings);
      }
      continue;
    }

    if (['country', 'geo', 'geo_match', 'location_country'].includes(fieldKey)) {
      if (['EQ', 'IN', 'CONTAINS'].includes(operator)) {
        filters.countries = appendUnique(filters.countries ?? [], valueStrings);
      }
      continue;
    }

    if (['technology', 'required_technology', 'required_technologies'].includes(fieldKey)) {
      if (['EQ', 'IN', 'CONTAINS'].includes(operator)) {
        filters.requiredTechnologies = appendUnique(
          filters.requiredTechnologies ?? [],
          valueStrings,
        );
      }
      continue;
    }

    if (['domain', 'company_domain'].includes(fieldKey)) {
      if (['NOT_IN', 'NEQ'].includes(operator)) {
        filters.excludedDomains = appendUnique(filters.excludedDomains ?? [], valueStrings);
      } else if (['EQ', 'IN', 'CONTAINS'].includes(operator)) {
        filters.includeTerms = appendUnique(filters.includeTerms ?? [], valueStrings);
      }
      continue;
    }

    if (['employee_count', 'company_size', 'employee_size'].includes(fieldKey)) {
      const numeric = extractNumericValue(rule.valueJson);
      if (numeric === null) {
        continue;
      }

      if (operator === 'GTE' || operator === 'GT' || operator === 'EQ') {
        filters.minCompanySize =
          filters.minCompanySize === undefined
            ? numeric
            : Math.max(filters.minCompanySize, numeric);
      }
      if (operator === 'LTE' || operator === 'LT' || operator === 'EQ') {
        filters.maxCompanySize =
          filters.maxCompanySize === undefined
            ? numeric
            : Math.min(filters.maxCompanySize, numeric);
      }
      continue;
    }

    if (['NOT_IN', 'NEQ'].includes(operator)) {
      filters.excludeTerms = appendUnique(filters.excludeTerms ?? [], valueStrings);
      continue;
    }

    if (['EQ', 'IN', 'CONTAINS'].includes(operator)) {
      filters.includeTerms = appendUnique(filters.includeTerms ?? [], valueStrings);
    }
  }

  return filters;
}

function resolveDiscoveryFilters(
  payloadFilters: DiscoveryRunFilters | undefined,
  icpProfile: {
    targetIndustries: string[];
    targetCountries: string[];
    requiredTechnologies: string[];
    excludedDomains: string[];
    minCompanySize: number | null;
    maxCompanySize: number | null;
  },
  qualificationRules: Array<{
    fieldKey: string;
    operator: string;
    valueJson: unknown;
    isActive: boolean;
  }>,
): DiscoveryRunFilters {
  const ruleFilters = mapRulesToFilters(qualificationRules);

  const minCompanySizeCandidates = [
    payloadFilters?.minCompanySize,
    icpProfile.minCompanySize ?? undefined,
    ruleFilters.minCompanySize,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const maxCompanySizeCandidates = [
    payloadFilters?.maxCompanySize,
    icpProfile.maxCompanySize ?? undefined,
    ruleFilters.maxCompanySize,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const resolved: DiscoveryRunFilters = {
    industries: appendUnique(
      [
        ...(payloadFilters?.industries ?? []),
        ...icpProfile.targetIndustries,
      ],
      ruleFilters.industries ?? [],
    ),
    countries: appendUnique(
      [
        ...(payloadFilters?.countries ?? []),
        ...icpProfile.targetCountries,
      ],
      ruleFilters.countries ?? [],
    ),
    requiredTechnologies: appendUnique(
      [
        ...(payloadFilters?.requiredTechnologies ?? []),
        ...icpProfile.requiredTechnologies,
      ],
      ruleFilters.requiredTechnologies ?? [],
    ),
    excludedDomains: appendUnique(
      [
        ...(payloadFilters?.excludedDomains ?? []),
        ...icpProfile.excludedDomains,
      ],
      ruleFilters.excludedDomains ?? [],
    ),
    includeTerms: appendUnique(
      payloadFilters?.includeTerms ?? [],
      ruleFilters.includeTerms ?? [],
    ),
    excludeTerms: appendUnique(
      payloadFilters?.excludeTerms ?? [],
      ruleFilters.excludeTerms ?? [],
    ),
  };

  if (minCompanySizeCandidates.length > 0) {
    resolved.minCompanySize = Math.max(...minCompanySizeCandidates);
  }
  if (maxCompanySizeCandidates.length > 0) {
    resolved.maxCompanySize = Math.min(...maxCompanySizeCandidates);
  }

  return resolved;
}

function computeQueryHash(payload: DiscoveryRunJobPayload, provider: DiscoveryProvider): string {
  const normalized = JSON.stringify({
    provider,
    icpProfileId: payload.icpProfileId ?? null,
    cursor: payload.cursor ?? null,
    limit: payload.limit ?? null,
    filters: {
      industries: [...(payload.filters?.industries ?? [])].sort(),
      countries: [...(payload.filters?.countries ?? [])].sort(),
      requiredTechnologies: [...(payload.filters?.requiredTechnologies ?? [])].sort(),
      excludedDomains: [...(payload.filters?.excludedDomains ?? [])].sort(),
      minCompanySize: payload.filters?.minCompanySize ?? null,
      maxCompanySize: payload.filters?.maxCompanySize ?? null,
      includeTerms: [...(payload.filters?.includeTerms ?? [])].sort(),
      excludeTerms: [...(payload.filters?.excludeTerms ?? [])].sort(),
    },
  });

  return createHash('sha256').update(normalized).digest('hex');
}

function toApolloRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): ApolloDiscoveryRequest {
  const request: ApolloDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }

  return request;
}

function toBraveSearchRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): BraveSearchDiscoveryRequest {
  const request: BraveSearchDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }
  request.query = buildGoogleSearchQueryFromFilters(payload.filters);

  return request;
}

function toGooglePlacesRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): GooglePlacesDiscoveryRequest {
  const request: GooglePlacesDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }
  request.query = buildGoogleSearchQueryFromFilters(payload.filters);

  return request;
}

function toGoogleSearchRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): GoogleSearchDiscoveryRequest {
  const request: GoogleSearchDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }
  request.query = buildGoogleSearchQueryFromFilters(payload.filters);

  return request;
}

function toLinkedInRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): LinkedInScrapeDiscoveryRequest {
  const request: LinkedInScrapeDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }
  request.query = buildLinkedInQueryFromFilters(payload.filters);

  return request;
}

function toCompanySearchRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): CompanySearchDiscoveryRequest {
  const request: CompanySearchDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }
  const query = buildCompanySearchQueryFromFilters(payload.filters);
  if (query) {
    request.query = query;
  }

  return request;
}

interface ProviderLeadInput {
  provider: string;
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

function defaultProviderConfidence(provider: DiscoveryProvider): number {
  return PROVIDER_DEFAULT_CONFIDENCE[provider];
}

function toNormalizedDiscoveryLead(
  provider: DiscoveryProvider,
  source: string,
  lead: ProviderLeadInput,
): NormalizedDiscoveredLead {
  const providerConfidence = defaultProviderConfidence(provider);
  const provenance: DiscoveryLeadProvenance[] = [
    {
      provider,
      providerSource: source,
      providerRecordId: lead.providerRecordId,
      confidence: providerConfidence,
    },
  ];

  return {
    provider,
    providerSource: source,
    providerConfidence,
    adapterProvider: lead.provider,
    provenance,
    providerRecordId: lead.providerRecordId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    title: lead.title,
    companyName: lead.companyName,
    companyDomain: lead.companyDomain,
    companySize: lead.companySize,
    country: lead.country,
    raw: lead.raw,
  };
}

function mergeDiscoveryResults(results: DiscoveryExecutionResult[]): NormalizedDiscoveredLead[] {
  const byEmail = new Map<string, NormalizedDiscoveredLead>();

  for (const result of results) {
    for (const lead of result.leads) {
      const key = lead.email.trim().toLowerCase();
      if (!key) {
        continue;
      }

      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, {
          ...lead,
          provenance: [...lead.provenance],
        });
        continue;
      }

      const existingConfidence = existing.providerConfidence ?? 0;
      const candidateConfidence = lead.providerConfidence ?? 0;
      const nextPrimary = candidateConfidence > existingConfidence ? lead : existing;
      const mergedProvenance = [
        ...existing.provenance,
        ...lead.provenance,
      ];
      byEmail.set(key, {
        ...nextPrimary,
        provenance: mergedProvenance,
        raw: {
          primary: nextPrimary.raw,
          provenance: mergedProvenance,
          alternates: [existing.raw, lead.raw].filter((entry) => entry !== nextPrimary.raw),
        },
      });
    }
  }

  return Array.from(byEmail.values());
}

function resolveProvidersToRun(
  payloadProvider: DiscoveryProvider | undefined,
  dependencies: DiscoveryRunDependencies,
): DiscoveryProvider[] {
  if (payloadProvider) {
    return [payloadProvider];
  }

  if (!dependencies.providerOrder || dependencies.providerOrder.length === 0) {
    return [dependencies.defaultProvider];
  }

  const providerOrder = [
    dependencies.defaultProvider,
    ...dependencies.providerOrder,
  ];

  return Array.from(new Set(providerOrder));
}

async function executeDiscoveryProvider(
  payload: DiscoveryRunJobPayload,
  provider: DiscoveryProvider,
  limit: number,
  correlationId: string,
  dependencies: DiscoveryRunDependencies,
  logger: DiscoveryRunLogger,
  jobId: string,
): Promise<DiscoveryExecutionResult> {
  switch (provider) {
    case 'BRAVE_SEARCH': {
      if (!dependencies.braveSearchEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.braveSearchAdapter.discoverLeads(
        toBraveSearchRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead(provider, result.source, lead)),
        nextCursor: result.nextCursor,
      };
    }

    case 'GOOGLE_PLACES': {
      if (!dependencies.googlePlacesEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.googlePlacesAdapter.discoverLeads(
        toGooglePlacesRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead(provider, result.source, lead)),
        nextCursor: result.nextCursor,
      };
    }

    case 'GOOGLE_SEARCH': {
      if (!dependencies.googleSearchEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const googleRequest = toGoogleSearchRequest(payload, limit, correlationId);
      const result = await dependencies.googleSearchAdapter.discoverLeads(
        googleRequest,
      );
      return {
        provider,
        source: result.source,
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead(provider, result.source, lead)),
        nextCursor: result.nextCursor,
      };
    }

    case 'LINKEDIN_SCRAPE': {
      if (!dependencies.linkedInScrapeEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.linkedInScrapeAdapter.discoverLeads(
        toLinkedInRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead(provider, result.source, lead)),
        nextCursor: result.nextCursor,
      };
    }

    case 'COMPANY_SEARCH_FREE': {
      if (!dependencies.companySearchEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.companySearchAdapter.discoverLeads(
        toCompanySearchRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead(provider, result.source, lead)),
        nextCursor: result.nextCursor,
      };
    }

    case 'APOLLO':
    default: {
      if (!dependencies.apolloEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider: 'APOLLO', source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.apolloAdapter.discoverLeads(
        toApolloRequest(payload, limit, correlationId),
      );
      return {
        provider: 'APOLLO',
        source: 'apollo',
        leads: result.leads.map((lead) => toNormalizedDiscoveryLead('APOLLO', 'apollo', lead)),
        nextCursor: result.nextCursor,
      };
    }
  }
}

async function markDiscoveryRunJobRunning(
  runId: string,
  payload: DiscoveryRunJobPayload,
): Promise<void> {
  await prisma.jobExecution.upsert({
    where: { id: runId },
    create: {
      id: runId,
      type: DISCOVERY_RUN_JOB_NAME,
      status: 'running',
      attempts: 1,
      payload: toInputJson(payload),
      result: toInputJson({
        totalItems: 0,
        processedItems: 0,
        failedItems: 0,
      }),
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    },
    update: {
      status: 'running',
      attempts: {
        increment: 1,
      },
      payload: toInputJson(payload),
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    },
  });
}

async function markDiscoveryRunJobFailed(
  runId: string,
  payload: DiscoveryRunJobPayload,
  errorMessage: string,
): Promise<void> {
  await prisma.jobExecution.upsert({
    where: { id: runId },
    create: {
      id: runId,
      type: DISCOVERY_RUN_JOB_NAME,
      status: 'failed',
      attempts: 1,
      payload: toInputJson(payload),
      result: toInputJson({
        totalItems: 0,
        processedItems: 0,
        failedItems: 0,
      }),
      error: errorMessage,
      startedAt: new Date(),
      finishedAt: new Date(),
    },
    update: {
      status: 'failed',
      payload: toInputJson(payload),
      error: errorMessage,
      finishedAt: new Date(),
    },
  });
}

async function markDiscoveryRunJobProgress(
  runId: string,
  payload: DiscoveryRunJobPayload,
  progress: DiscoveryRunProgress,
  nextCursor: string | null,
  selectedProvider: DiscoveryProvider,
  providersRan: DiscoveryProvider[],
): Promise<void> {
  const hasNextCursor = Boolean(nextCursor && nextCursor !== payload.cursor);

  await prisma.jobExecution.upsert({
    where: { id: runId },
    create: {
      id: runId,
      type: DISCOVERY_RUN_JOB_NAME,
      status: hasNextCursor ? 'running' : 'completed',
      attempts: 1,
      payload: toInputJson(payload),
      result: toInputJson({
        ...progress,
        provider: selectedProvider,
        providersRan,
        cursor: payload.cursor ?? null,
        nextCursor,
      }),
      error: null,
      startedAt: new Date(),
      finishedAt: hasNextCursor ? null : new Date(),
    },
    update: {
      status: hasNextCursor ? 'running' : 'completed',
      payload: toInputJson(payload),
      result: toInputJson({
        ...progress,
        provider: selectedProvider,
        providersRan,
        cursor: payload.cursor ?? null,
        nextCursor,
      }),
      error: null,
      finishedAt: hasNextCursor ? null : new Date(),
    },
  });
}

export async function handleDiscoveryRunJob(
  logger: DiscoveryRunLogger,
  job: Job<DiscoveryRunJobPayload>,
  dependencies: DiscoveryRunDependencies,
): Promise<void> {
  const { runId, correlationId, icpProfileId } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;
  const selectedProvider = job.data.provider ?? dependencies.defaultProvider;
  const providersToRun = resolveProvidersToRun(job.data.provider, dependencies);
  const normalizedIcpProfileId = icpProfileId ?? null;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      icpProfileId,
      provider: selectedProvider,
      providersToRun,
      cursor: job.data.cursor ?? null,
    },
    'Started discovery.run job',
  );

  await markDiscoveryRunJobRunning(runId, job.data);

  if (!dependencies.discoveryEnabled) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
      },
      'Skipping discovery.run job because discovery is disabled',
    );
    await markDiscoveryRunJobFailed(runId, job.data, 'Discovery is disabled');
    return;
  }

  if (!normalizedIcpProfileId) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
      },
      'Skipping discovery.run job because icpProfileId is required',
    );
    await markDiscoveryRunJobFailed(runId, job.data, 'Discovery run requires icpProfileId');
    return;
  }

  const icpProfile = await prisma.icpProfile.findUnique({
    where: { id: normalizedIcpProfileId },
    select: {
      id: true,
      targetIndustries: true,
      targetCountries: true,
      requiredTechnologies: true,
      excludedDomains: true,
      minCompanySize: true,
      maxCompanySize: true,
    },
  });

  if (!icpProfile) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
        icpProfileId: normalizedIcpProfileId,
      },
      'Skipping discovery.run job because icpProfile was not found',
    );
    await markDiscoveryRunJobFailed(runId, job.data, 'Discovery run icpProfile was not found');
    return;
  }

  const qualificationRules = await prisma.qualificationRule.findMany({
    where: {
      icpProfileId: normalizedIcpProfileId,
      isActive: true,
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: {
      fieldKey: true,
      operator: true,
      valueJson: true,
      isActive: true,
    },
  });

  const resolvedFilters = resolveDiscoveryFilters(job.data.filters, icpProfile, qualificationRules);
  const requestedLimit = job.data.limit ?? dependencies.defaultLimit ?? DEFAULT_DISCOVERY_LIMIT;
  const discoveryPayload: DiscoveryRunJobPayload = {
    ...job.data,
    icpProfileId: normalizedIcpProfileId,
    filters: resolvedFilters,
  };

  logger.info(
    {
      jobId: job.id,
      runId,
      correlationId: effectiveCorrelationId,
      icpProfileId: normalizedIcpProfileId,
      provider: selectedProvider,
      providersToRun,
      resolvedFilters,
      activeRuleCount: qualificationRules.length,
    },
    'Resolved discovery filters from ICP profile and qualification rules',
  );

  try {
    const providerResults: DiscoveryExecutionResult[] = [];
    const providerErrors: Array<{
      provider: DiscoveryProvider;
      error: Record<string, unknown>;
    }> = [];

    for (const provider of providersToRun) {
      try {
        const result = await executeDiscoveryProvider(
          discoveryPayload,
          provider,
          requestedLimit,
          effectiveCorrelationId,
          dependencies,
          logger,
          job.id,
        );
        providerResults.push(result);
      } catch (providerError: unknown) {
        const serializedProviderError = serializeErrorForLog(providerError);
        providerErrors.push({
          provider,
          error: serializedProviderError,
        });
        logger.warn(
          {
            jobId: job.id,
            queue: job.name,
            runId,
            correlationId: effectiveCorrelationId,
            provider,
            error: serializedProviderError,
          },
          'Discovery provider failed, attempting next provider in order',
        );
      }
    }

    const mergedLeads = mergeDiscoveryResults(providerResults);
    const primaryProviderResult =
      providerResults.find((result) => result.provider === selectedProvider) ??
      providerResults[0] ??
      null;
    const nextCursor = providersToRun.length === 1 ? primaryProviderResult?.nextCursor ?? null : null;

    if (providersToRun.length > 1 && providerResults.some((result) => Boolean(result.nextCursor))) {
      // TODO(discovery-fanout): Persist per-provider cursors for multipage fanout runs.
      logger.warn(
        {
          jobId: job.id,
          runId,
          correlationId: effectiveCorrelationId,
          providersToRun,
        },
        'Ignoring provider pagination cursors during fanout run',
      );
    }

    if (mergedLeads.length === 0 && providerErrors.length === providersToRun.length) {
      const failedProviders = providerErrors.map((entry) => entry.provider).join(', ');
      throw new Error(`All discovery providers failed for run ${runId}: ${failedProviders}`);
    }

    let createdLeads = 0;
    let enqueuedEnrichmentJobs = 0;
    let persistedDiscoveryRecords = 0;

    for (const discoveredLead of mergedLeads) {
      const fallbackName = deriveLeadName(discoveredLead.email);
      const existingLead = await prisma.lead.findUnique({
        where: { email: discoveredLead.email },
        select: { id: true },
      });

      const lead = await prisma.lead.upsert({
        where: { email: discoveredLead.email },
        create: {
          firstName: discoveredLead.firstName || fallbackName.firstName,
          lastName: discoveredLead.lastName || fallbackName.lastName,
          email: discoveredLead.email,
          source: discoveredLead.provider.toLowerCase(),
          status: 'new',
        },
        update: {
          firstName: discoveredLead.firstName || fallbackName.firstName,
          lastName: discoveredLead.lastName || fallbackName.lastName,
          source: discoveredLead.provider.toLowerCase(),
        },
      });

      createdLeads += 1;
      const queryHash = computeQueryHash(discoveryPayload, discoveredLead.provider);

      const discoveryRecord = await prisma.leadDiscoveryRecord.upsert({
        where: {
          leadId_icpProfileId_provider_providerRecordId: {
            leadId: lead.id,
            icpProfileId: normalizedIcpProfileId,
            provider: discoveredLead.provider,
            providerRecordId: discoveredLead.providerRecordId,
          },
        },
        create: {
          leadId: lead.id,
          icpProfileId: normalizedIcpProfileId,
          provider: discoveredLead.provider,
          providerSource: discoveredLead.providerSource,
          providerConfidence: discoveredLead.providerConfidence,
          providerRecordId: discoveredLead.providerRecordId,
          providerCursor: discoveryPayload.cursor ?? null,
          queryHash,
          status: existingLead ? 'DUPLICATE' : 'DISCOVERED',
          rawPayload: toInputJson(discoveredLead.raw),
          provenanceJson: toInputJson(discoveredLead.provenance),
          discoveredAt: new Date(),
        },
        update: {
          providerSource: discoveredLead.providerSource,
          providerConfidence: discoveredLead.providerConfidence,
          providerCursor: discoveryPayload.cursor ?? null,
          queryHash,
          status: existingLead ? 'DUPLICATE' : 'DISCOVERED',
          rawPayload: toInputJson(discoveredLead.raw),
          provenanceJson: toInputJson(discoveredLead.provenance),
          discoveredAt: new Date(),
          errorMessage: null,
        },
      });

      persistedDiscoveryRecords += 1;

      // Keep JobExecution visibility for operators, but pipeline correctness uses LeadDiscoveryRecord.
      await prisma.jobExecution.create({
        data: {
          type: DISCOVERY_RECORD_JOB_TYPE,
          status: 'completed',
          attempts: 1,
          payload: toInputJson({
            runId,
            correlationId: effectiveCorrelationId,
            icpProfileId: normalizedIcpProfileId,
            selectedProvider,
            providerSource: discoveredLead.providerSource,
            provider: discoveredLead.provider,
            adapterProvider: discoveredLead.adapterProvider,
            providerConfidence: discoveredLead.providerConfidence,
            providerRecordId: discoveredLead.providerRecordId,
            provenance: discoveredLead.provenance,
            raw: discoveredLead.raw,
            discoveryRecordId: discoveryRecord.id,
          }),
          result: toInputJson({
            normalized: discoveredLead,
          }),
          leadId: lead.id,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      const enrichmentJobExecution = await prisma.jobExecution.create({
        data: {
          type: ENRICHMENT_RUN_JOB_NAME,
          status: 'queued',
          payload: {
            runId,
            leadId: lead.id,
            provider: dependencies.defaultEnrichmentProvider,
            correlationId: effectiveCorrelationId,
            jobExecutionId: null,
            discoveryRecordId: discoveryRecord.id,
            icpProfileId: normalizedIcpProfileId,
          },
          leadId: lead.id,
        },
      });

      const enrichmentPayload: EnrichmentRunJobPayload = {
        runId,
        leadId: lead.id,
        provider: dependencies.defaultEnrichmentProvider,
        correlationId: effectiveCorrelationId,
        jobExecutionId: enrichmentJobExecution.id,
        discoveryRecordId: discoveryRecord.id,
        icpProfileId: normalizedIcpProfileId,
      };

      await prisma.jobExecution.update({
        where: { id: enrichmentJobExecution.id },
        data: {
          payload: toInputJson(enrichmentPayload),
        },
      });

      await dependencies.boss.send(ENRICHMENT_RUN_JOB_NAME, enrichmentPayload, {
        singletonKey: `enrichment.run:${lead.id}:${dependencies.defaultEnrichmentProvider}`,
        ...ENRICHMENT_RUN_RETRY_OPTIONS,
      });

      enqueuedEnrichmentJobs += 1;
    }

    if (nextCursor && nextCursor !== discoveryPayload.cursor) {
      const nextPayload: DiscoveryRunJobPayload = {
        ...discoveryPayload,
        cursor: nextCursor,
        correlationId: effectiveCorrelationId,
      };

      await dependencies.boss.send(DISCOVERY_RUN_JOB_NAME, nextPayload, {
        singletonKey: `discovery.run:${runId}:${nextCursor}`,
        ...DISCOVERY_RUN_RETRY_OPTIONS,
      });
    }

    const existingRunExecution = await prisma.jobExecution.findUnique({
      where: { id: runId },
      select: { result: true },
    });
    const existingProgress = readRunProgress(existingRunExecution?.result ?? null);
    const pageFailedItems = Math.max(mergedLeads.length - persistedDiscoveryRecords, 0);
    const updatedProgress: DiscoveryRunProgress = {
      processedItems: existingProgress.processedItems + persistedDiscoveryRecords,
      failedItems: existingProgress.failedItems + pageFailedItems,
      totalItems:
        existingProgress.processedItems +
        persistedDiscoveryRecords +
        existingProgress.failedItems +
        pageFailedItems,
    };

    await markDiscoveryRunJobProgress(
      runId,
      discoveryPayload,
      updatedProgress,
      nextCursor,
      selectedProvider,
      providerResults.map((result) => result.provider),
    );

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        provider: selectedProvider,
        providersRan: providerResults.map((result) => result.provider),
        providerFailures: providerErrors.length,
        createdLeads,
        persistedDiscoveryRecords,
        enqueuedEnrichmentJobs,
        nextCursor,
      },
      'Completed discovery.run job',
    );
  } catch (error: unknown) {
    const serializedError = serializeErrorForLog(error);

    if (
      error instanceof ApolloRateLimitError ||
      error instanceof BraveSearchRateLimitError ||
      error instanceof GooglePlacesRateLimitError ||
      error instanceof GoogleSearchRateLimitError ||
      error instanceof LinkedInScrapeRateLimitError
    ) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          provider: selectedProvider,
          retryAfterSeconds:
            'retryAfterSeconds' in error ? error.retryAfterSeconds : undefined,
        },
        'Provider rate limit reached during discovery.run job',
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          prismaCode: error.code,
        },
        'Prisma conflict detected during discovery.run job',
      );
    }

    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        error: serializedError,
      },
      'Failed discovery.run job',
    );

    await markDiscoveryRunJobFailed(
      runId,
      job.data,
      typeof serializedError.message === 'string'
        ? serializedError.message
        : 'Unknown discovery run failure',
    );

    throw error;
  }
}
