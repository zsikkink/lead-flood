import type {
  CreateIcpProfileRequest,
  CreateQualificationRuleRequest,
  IcpDebugSampleQuery,
  IcpDebugSampleResponse,
  IcpProfileResponse,
  IcpStatusResponse,
  ListIcpProfilesQuery,
  ListIcpProfilesResponse,
  QualificationRuleResponse,
  UpdateIcpProfileRequest,
  UpdateQualificationRuleRequest,
} from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';

import { IcpNotFoundError, IcpNotImplementedError } from './icp.errors.js';

export interface IcpRepository {
  createIcpProfile(input: CreateIcpProfileRequest): Promise<IcpProfileResponse>;
  listIcpProfiles(query: ListIcpProfilesQuery): Promise<ListIcpProfilesResponse>;
  getIcpProfile(icpId: string): Promise<IcpProfileResponse>;
  updateIcpProfile(icpId: string, input: UpdateIcpProfileRequest): Promise<IcpProfileResponse>;
  deleteIcpProfile(icpId: string): Promise<void>;
  createQualificationRule(
    icpId: string,
    input: CreateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse>;
  updateQualificationRule(
    icpId: string,
    ruleId: string,
    input: UpdateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse>;
  deleteQualificationRule(icpId: string, ruleId: string): Promise<void>;
  getIcpStatus(icpId: string): Promise<IcpStatusResponse>;
  getIcpDebugSample(icpProfileId: string, query: IcpDebugSampleQuery): Promise<IcpDebugSampleResponse>;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function normalizeComparable(value: unknown): unknown {
  const normalizedString = normalizeString(value);
  if (normalizedString !== null) {
    return normalizedString.toLowerCase();
  }
  const normalizedNumber = normalizeNumber(value);
  if (normalizedNumber !== null) {
    return normalizedNumber;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return value;
}

function evaluateRule(operator: string, featureValue: unknown, ruleValue: unknown): boolean {
  switch (operator) {
    case 'EQ':
      return normalizeComparable(featureValue) === normalizeComparable(ruleValue);
    case 'NEQ':
      return normalizeComparable(featureValue) !== normalizeComparable(ruleValue);
    case 'GT': {
      const left = normalizeNumber(featureValue);
      const right = normalizeNumber(ruleValue);
      return left !== null && right !== null && left > right;
    }
    case 'GTE': {
      const left = normalizeNumber(featureValue);
      const right = normalizeNumber(ruleValue);
      return left !== null && right !== null && left >= right;
    }
    case 'LT': {
      const left = normalizeNumber(featureValue);
      const right = normalizeNumber(ruleValue);
      return left !== null && right !== null && left < right;
    }
    case 'LTE': {
      const left = normalizeNumber(featureValue);
      const right = normalizeNumber(ruleValue);
      return left !== null && right !== null && left <= right;
    }
    case 'IN': {
      const values = Array.isArray(ruleValue) ? ruleValue : [];
      const normalized = normalizeComparable(featureValue);
      return values.map((value) => normalizeComparable(value)).includes(normalized);
    }
    case 'NOT_IN': {
      const values = Array.isArray(ruleValue) ? ruleValue : [];
      const normalized = normalizeComparable(featureValue);
      return !values.map((value) => normalizeComparable(value)).includes(normalized);
    }
    case 'CONTAINS': {
      const normalizedRule = normalizeString(ruleValue)?.toLowerCase();
      const normalizedFeature = normalizeString(featureValue)?.toLowerCase();
      if (!normalizedRule || !normalizedFeature) {
        return false;
      }
      return normalizedFeature.includes(normalizedRule);
    }
    default:
      return false;
  }
}

type DiscoveryFilterContext = {
  industries: string[];
  countries: string[];
  requiredTechnologies: string[];
  excludedDomains: string[];
  minCompanySize: number | null;
  maxCompanySize: number | null;
  includeTerms: string[];
  excludeTerms: string[];
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => entry.trim().toLowerCase()).filter(Boolean)));
}

function buildFilterContext(input: {
  targetIndustries: string[];
  targetCountries: string[];
  requiredTechnologies: string[];
  excludedDomains: string[];
  minCompanySize: number | null;
  maxCompanySize: number | null;
  rules: Array<{
    fieldKey: string;
    operator: string;
    valueJson: unknown;
    isActive: boolean;
  }>;
}): DiscoveryFilterContext {
  const context: DiscoveryFilterContext = {
    industries: [...input.targetIndustries],
    countries: [...input.targetCountries],
    requiredTechnologies: [...input.requiredTechnologies],
    excludedDomains: [...input.excludedDomains],
    minCompanySize: input.minCompanySize,
    maxCompanySize: input.maxCompanySize,
    includeTerms: [],
    excludeTerms: [],
  };

  for (const rule of input.rules) {
    if (!rule.isActive) {
      continue;
    }
    const fieldKey = normalizeString(rule.fieldKey)?.toLowerCase() ?? '';
    const values = extractStringValues(rule.valueJson);

    if (fieldKey.includes('industry')) {
      context.industries = uniqueStrings([...context.industries, ...values]);
      continue;
    }
    if (fieldKey.includes('country') || fieldKey.includes('geo')) {
      context.countries = uniqueStrings([...context.countries, ...values]);
      continue;
    }
    if (fieldKey.includes('technology')) {
      context.requiredTechnologies = uniqueStrings([...context.requiredTechnologies, ...values]);
      continue;
    }
    if (fieldKey.includes('domain') && ['NOT_IN', 'NEQ'].includes(rule.operator)) {
      context.excludedDomains = uniqueStrings([...context.excludedDomains, ...values]);
      continue;
    }
    if (fieldKey.includes('size') || fieldKey.includes('employee')) {
      const numeric = normalizeNumber(rule.valueJson);
      if (numeric !== null) {
        if (rule.operator === 'GT' || rule.operator === 'GTE' || rule.operator === 'EQ') {
          context.minCompanySize = context.minCompanySize === null ? numeric : Math.max(context.minCompanySize, numeric);
        }
        if (rule.operator === 'LT' || rule.operator === 'LTE' || rule.operator === 'EQ') {
          context.maxCompanySize = context.maxCompanySize === null ? numeric : Math.min(context.maxCompanySize, numeric);
        }
      }
      continue;
    }

    if (['NOT_IN', 'NEQ'].includes(rule.operator)) {
      context.excludeTerms = uniqueStrings([...context.excludeTerms, ...values]);
    } else {
      context.includeTerms = uniqueStrings([...context.includeTerms, ...values]);
    }
  }

  return {
    ...context,
    industries: uniqueStrings(context.industries),
    countries: uniqueStrings(context.countries),
    requiredTechnologies: uniqueStrings(context.requiredTechnologies),
    excludedDomains: uniqueStrings(context.excludedDomains),
    includeTerms: uniqueStrings(context.includeTerms),
    excludeTerms: uniqueStrings(context.excludeTerms),
  };
}

function quoteTerm(term: string): string {
  return term.includes(' ') ? `"${term}"` : term;
}

function buildProviderQueries(filters: DiscoveryFilterContext): Array<{ provider: 'GOOGLE_SEARCH' | 'LINKEDIN_SCRAPE' | 'COMPANY_SEARCH_FREE' | 'APOLLO'; query: unknown }> {
  const includeTerms = [
    ...filters.industries,
    ...filters.countries,
    ...filters.requiredTechnologies,
    ...filters.includeTerms,
  ];

  const googleQuery = [
    includeTerms.length > 0 ? includeTerms.map((term) => quoteTerm(term)).join(' ') : 'B2B companies',
    ...filters.excludedDomains.map((domain) => `-site:${domain}`),
    ...filters.excludeTerms.map((term) => `-${quoteTerm(term)}`),
  ]
    .filter(Boolean)
    .join(' ');

  const linkedinQuery = [
    'site:linkedin.com/in',
    includeTerms.length > 0 ? includeTerms.map((term) => quoteTerm(term)).join(' ') : 'sales',
    ...filters.excludeTerms.map((term) => `-${quoteTerm(term)}`),
  ]
    .filter(Boolean)
    .join(' ');

  const companySearchQuery = [filters.industries[0], filters.requiredTechnologies[0], filters.includeTerms[0]]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  const apolloPayload = {
    person_locations: filters.countries,
    q_keywords: [
      ...filters.industries,
      ...filters.includeTerms,
      ...filters.excludeTerms.map((term) => `NOT ${term}`),
      ...filters.excludedDomains.map((domain) => `NOT ${domain}`),
    ]
      .filter(Boolean)
      .join(' '),
    q_organization_technology_names: filters.requiredTechnologies,
    q_organization_num_employees_gte: filters.minCompanySize,
    q_organization_num_employees_lte: filters.maxCompanySize,
  };

  return [
    { provider: 'GOOGLE_SEARCH', query: googleQuery },
    { provider: 'LINKEDIN_SCRAPE', query: linkedinQuery },
    { provider: 'COMPANY_SEARCH_FREE', query: companySearchQuery || null },
    { provider: 'APOLLO', query: apolloPayload },
  ];
}

function buildFeatureCandidate(input: {
  normalizedPayload: Record<string, unknown> | null;
  leadEmail: string;
  icpTargetIndustries: string[];
  icpTargetCountries: string[];
}): Record<string, unknown> {
  const email = normalizeString(input.normalizedPayload?.email) ?? input.leadEmail;
  const domain =
    normalizeString(input.normalizedPayload?.domain) ??
    (email.includes('@') ? email.split('@')[1] ?? null : null);
  const companyName = normalizeString(input.normalizedPayload?.companyName);
  const industry = normalizeString(input.normalizedPayload?.industry);
  const country = normalizeString(input.normalizedPayload?.country);

  return {
    email,
    domain,
    companyName,
    industry,
    employeeCount: normalizeNumber(input.normalizedPayload?.employeeCount),
    country,
    city: normalizeString(input.normalizedPayload?.city),
    linkedinUrl: normalizeString(input.normalizedPayload?.linkedinUrl),
    website: normalizeString(input.normalizedPayload?.website),
    has_email: Boolean(email),
    has_domain: Boolean(domain),
    has_company_name: Boolean(companyName),
    industry_match:
      input.icpTargetIndustries.length === 0 ||
      (industry ? input.icpTargetIndustries.map((entry) => entry.toLowerCase()).includes(industry.toLowerCase()) : false),
    geo_match:
      input.icpTargetCountries.length === 0 ||
      (country ? input.icpTargetCountries.map((entry) => entry.toLowerCase()).includes(country.toLowerCase()) : false),
  };
}

export class StubIcpRepository implements IcpRepository {
  async createIcpProfile(_input: CreateIcpProfileRequest): Promise<IcpProfileResponse> {
    throw new IcpNotImplementedError('TODO: create ICP profile persistence');
  }

  async listIcpProfiles(_query: ListIcpProfilesQuery): Promise<ListIcpProfilesResponse> {
    throw new IcpNotImplementedError('TODO: list ICP profile persistence');
  }

  async getIcpProfile(_icpId: string): Promise<IcpProfileResponse> {
    throw new IcpNotImplementedError('TODO: get ICP profile persistence');
  }

  async updateIcpProfile(
    _icpId: string,
    _input: UpdateIcpProfileRequest,
  ): Promise<IcpProfileResponse> {
    throw new IcpNotImplementedError('TODO: update ICP profile persistence');
  }

  async deleteIcpProfile(_icpId: string): Promise<void> {
    throw new IcpNotImplementedError('TODO: delete ICP profile persistence');
  }

  async createQualificationRule(
    _icpId: string,
    _input: CreateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse> {
    throw new IcpNotImplementedError('TODO: create qualification rule persistence');
  }

  async updateQualificationRule(
    _icpId: string,
    _ruleId: string,
    _input: UpdateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse> {
    throw new IcpNotImplementedError('TODO: update qualification rule persistence');
  }

  async deleteQualificationRule(_icpId: string, _ruleId: string): Promise<void> {
    throw new IcpNotImplementedError('TODO: delete qualification rule persistence');
  }

  async getIcpStatus(_icpId: string): Promise<IcpStatusResponse> {
    throw new IcpNotImplementedError('TODO: get ICP status persistence');
  }

  async getIcpDebugSample(
    _icpProfileId: string,
    _query: IcpDebugSampleQuery,
  ): Promise<IcpDebugSampleResponse> {
    throw new IcpNotImplementedError('TODO: get ICP debug sample');
  }
}

export class PrismaIcpRepository extends StubIcpRepository {
  override async getIcpDebugSample(
    icpProfileId: string,
    query: IcpDebugSampleQuery,
  ): Promise<IcpDebugSampleResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpProfileId },
      include: {
        qualificationRules: {
          where: { isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!icp) {
      throw new IcpNotFoundError();
    }

    const filters = buildFilterContext({
      targetIndustries: icp.targetIndustries,
      targetCountries: icp.targetCountries,
      requiredTechnologies: icp.requiredTechnologies,
      excludedDomains: icp.excludedDomains,
      minCompanySize: icp.minCompanySize,
      maxCompanySize: icp.maxCompanySize,
      rules: icp.qualificationRules.map((rule) => ({
        fieldKey: rule.fieldKey,
        operator: rule.operator,
        valueJson: rule.valueJson,
        isActive: rule.isActive,
      })),
    });

    const samples = await prisma.leadDiscoveryRecord.findMany({
      where: {
        icpProfileId,
      },
      orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      include: {
        lead: {
          include: {
            enrichmentRecords: {
              orderBy: [{ enrichedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        },
      },
    });

    return {
      icpProfileId,
      providerQueries: buildProviderQueries(filters),
      samples: samples.map((sample) => {
        const normalizedPayloadRaw = sample.lead.enrichmentRecords[0]?.normalizedPayload;
        const normalizedPayload =
          normalizedPayloadRaw && typeof normalizedPayloadRaw === 'object'
            ? (normalizedPayloadRaw as Record<string, unknown>)
            : null;

        const featureCandidate = buildFeatureCandidate({
          normalizedPayload,
          leadEmail: sample.lead.email,
          icpTargetIndustries: icp.targetIndustries,
          icpTargetCountries: icp.targetCountries,
        });

        return {
          leadId: sample.leadId,
          discoveryRecordId: sample.id,
          provider: sample.provider,
          rawPayload: sample.rawPayload,
          normalizedPayload: normalizedPayload
            ? {
                email: normalizeString(normalizedPayload.email),
                domain: normalizeString(normalizedPayload.domain),
                companyName: normalizeString(normalizedPayload.companyName),
                industry: normalizeString(normalizedPayload.industry),
                employeeCount: normalizeNumber(normalizedPayload.employeeCount),
                country: normalizeString(normalizedPayload.country),
                city: normalizeString(normalizedPayload.city),
                linkedinUrl: normalizeString(normalizedPayload.linkedinUrl),
                website: normalizeString(normalizedPayload.website),
              }
            : null,
          ruleEvaluations: icp.qualificationRules.map((rule) => ({
            ruleId: rule.id,
            fieldKey: rule.fieldKey,
            operator: rule.operator,
            matched: evaluateRule(rule.operator, featureCandidate[rule.fieldKey], rule.valueJson),
          })),
        };
      }),
    };
  }
}
