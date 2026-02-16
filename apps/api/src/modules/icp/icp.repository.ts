import type {
  CreateIcpProfileRequest,
  CreateQualificationRuleRequest,
  IcpDebugSampleQuery,
  IcpDebugSampleResponse,
  IcpProfileResponse,
  IcpStatusResponse,
  ListIcpProfilesQuery,
  ListIcpProfilesResponse,
  ListIcpRulesResponse,
  QualificationRuleResponse,
  ReplaceIcpRulesRequest,
  UpdateIcpProfileRequest,
  UpdateQualificationRuleRequest,
} from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';

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
  listIcpRules(icpId: string): Promise<ListIcpRulesResponse>;
  replaceIcpRules(icpId: string, input: ReplaceIcpRulesRequest): Promise<ListIcpRulesResponse>;
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

function mapQualificationRuleToResponse(
  rule: {
    id: string;
    icpProfileId: string;
    name: string;
    ruleType: 'WEIGHTED' | 'HARD_FILTER';
    isRequired: boolean;
    fieldKey: string;
    operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN' | 'CONTAINS';
    valueJson: unknown;
    weight: number | null;
    orderIndex: number;
    isActive: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
  },
): QualificationRuleResponse {
  return {
    id: rule.id,
    icpProfileId: rule.icpProfileId,
    name: rule.name,
    ruleType: rule.ruleType,
    isRequired: rule.isRequired,
    fieldKey: rule.fieldKey,
    operator: rule.operator,
    valueJson: rule.valueJson,
    weight: rule.weight,
    orderIndex: rule.orderIndex,
    isActive: rule.isActive,
    priority: rule.priority,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function mapIcpProfileToResponse(
  icp: {
    id: string;
    name: string;
    description: string | null;
    qualificationLogic: 'WEIGHTED';
    metadataJson: unknown;
    targetIndustries: string[];
    targetCountries: string[];
    minCompanySize: number | null;
    maxCompanySize: number | null;
    requiredTechnologies: string[];
    excludedDomains: string[];
    isActive: boolean;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    qualificationRules?: Array<{
      id: string;
      icpProfileId: string;
      name: string;
      ruleType: 'WEIGHTED' | 'HARD_FILTER';
      isRequired: boolean;
      fieldKey: string;
      operator: 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN' | 'NOT_IN' | 'CONTAINS';
      valueJson: unknown;
      weight: number | null;
      orderIndex: number;
      isActive: boolean;
      priority: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  },
): IcpProfileResponse {
  return {
    id: icp.id,
    name: icp.name,
    description: icp.description,
    qualificationLogic: icp.qualificationLogic,
    metadataJson:
      icp.metadataJson && typeof icp.metadataJson === 'object'
        ? (icp.metadataJson as Record<string, unknown>)
        : null,
    targetIndustries: icp.targetIndustries,
    targetCountries: icp.targetCountries,
    minCompanySize: icp.minCompanySize,
    maxCompanySize: icp.maxCompanySize,
    requiredTechnologies: icp.requiredTechnologies,
    excludedDomains: icp.excludedDomains,
    isActive: icp.isActive,
    createdByUserId: icp.createdByUserId,
    createdAt: icp.createdAt.toISOString(),
    updatedAt: icp.updatedAt.toISOString(),
    qualificationRules: icp.qualificationRules?.map((rule) => mapQualificationRuleToResponse(rule)),
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
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

  async listIcpRules(_icpId: string): Promise<ListIcpRulesResponse> {
    throw new IcpNotImplementedError('TODO: list qualification rules persistence');
  }

  async replaceIcpRules(_icpId: string, _input: ReplaceIcpRulesRequest): Promise<ListIcpRulesResponse> {
    throw new IcpNotImplementedError('TODO: replace qualification rules persistence');
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
  override async createIcpProfile(input: CreateIcpProfileRequest): Promise<IcpProfileResponse> {
    const created = await prisma.icpProfile.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        qualificationLogic: input.qualificationLogic ?? 'WEIGHTED',
        metadataJson:
          input.metadataJson !== undefined
            ? toInputJson(input.metadataJson)
            : Prisma.JsonNull,
        targetIndustries: input.targetIndustries ?? [],
        targetCountries: input.targetCountries ?? [],
        minCompanySize: input.minCompanySize ?? null,
        maxCompanySize: input.maxCompanySize ?? null,
        requiredTechnologies: input.requiredTechnologies ?? [],
        excludedDomains: input.excludedDomains ?? [],
        isActive: input.isActive ?? true,
      },
      include: {
        qualificationRules: {
          orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return mapIcpProfileToResponse(created);
  }

  override async listIcpProfiles(query: ListIcpProfilesQuery): Promise<ListIcpProfilesResponse> {
    const where = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { description: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.icpProfile.count({ where }),
      prisma.icpProfile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          qualificationRules: {
            orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
    ]);

    return {
      items: rows.map((row) => mapIcpProfileToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getIcpProfile(icpId: string): Promise<IcpProfileResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpId },
      include: {
        qualificationRules: {
          orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!icp) {
      throw new IcpNotFoundError();
    }
    return mapIcpProfileToResponse(icp);
  }

  override async updateIcpProfile(
    icpId: string,
    input: UpdateIcpProfileRequest,
  ): Promise<IcpProfileResponse> {
    try {
      const updated = await prisma.icpProfile.update({
        where: { id: icpId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.qualificationLogic !== undefined
            ? { qualificationLogic: input.qualificationLogic }
            : {}),
          ...(input.metadataJson !== undefined
            ? {
                metadataJson:
                  input.metadataJson === null
                    ? Prisma.JsonNull
                    : toInputJson(input.metadataJson),
              }
            : {}),
          ...(input.targetIndustries !== undefined
            ? { targetIndustries: input.targetIndustries }
            : {}),
          ...(input.targetCountries !== undefined
            ? { targetCountries: input.targetCountries }
            : {}),
          ...(input.minCompanySize !== undefined
            ? { minCompanySize: input.minCompanySize ?? null }
            : {}),
          ...(input.maxCompanySize !== undefined
            ? { maxCompanySize: input.maxCompanySize ?? null }
            : {}),
          ...(input.requiredTechnologies !== undefined
            ? { requiredTechnologies: input.requiredTechnologies }
            : {}),
          ...(input.excludedDomains !== undefined
            ? { excludedDomains: input.excludedDomains }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: {
          qualificationRules: {
            orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      return mapIcpProfileToResponse(updated);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new IcpNotFoundError();
      }
      throw error;
    }
  }

  override async deleteIcpProfile(icpId: string): Promise<void> {
    try {
      await prisma.icpProfile.delete({
        where: { id: icpId },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new IcpNotFoundError();
      }
      throw error;
    }
  }

  override async createQualificationRule(
    icpId: string,
    input: CreateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpId },
      select: { id: true },
    });
    if (!icp) {
      throw new IcpNotFoundError();
    }

    const resolvedRuleType = input.ruleType ?? (input.isRequired ? 'HARD_FILTER' : 'WEIGHTED');
    const isRequired = input.isRequired ?? resolvedRuleType === 'HARD_FILTER';
    const priority = input.priority ?? input.orderIndex ?? 100;
    const orderIndex = input.orderIndex ?? input.priority ?? 100;

    const created = await prisma.qualificationRule.create({
      data: {
        icpProfileId: icpId,
        name: input.name,
        ruleType: resolvedRuleType,
        isRequired,
        fieldKey: input.fieldKey,
        operator: input.operator,
        valueJson: toInputJson(input.valueJson),
        weight:
          resolvedRuleType === 'WEIGHTED'
            ? (input.weight ?? 1)
            : null,
        isActive: input.isActive ?? true,
        orderIndex,
        priority,
      },
    });

    return mapQualificationRuleToResponse(created);
  }

  override async updateQualificationRule(
    icpId: string,
    ruleId: string,
    input: UpdateQualificationRuleRequest,
  ): Promise<QualificationRuleResponse> {
    const existing = await prisma.qualificationRule.findFirst({
      where: {
        id: ruleId,
        icpProfileId: icpId,
      },
    });
    if (!existing) {
      throw new IcpNotFoundError('Qualification rule not found');
    }

    const nextRuleType = input.ruleType ?? existing.ruleType;
    const nextIsRequired = input.isRequired ?? (nextRuleType === 'HARD_FILTER');
    const nextOrderIndex = input.orderIndex ?? existing.orderIndex;
    const nextPriority = input.priority ?? existing.priority;

    const updated = await prisma.qualificationRule.update({
      where: { id: ruleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.ruleType !== undefined ? { ruleType: input.ruleType } : {}),
        ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
        ...(input.fieldKey !== undefined ? { fieldKey: input.fieldKey } : {}),
        ...(input.operator !== undefined ? { operator: input.operator } : {}),
        ...(input.valueJson !== undefined ? { valueJson: toInputJson(input.valueJson) } : {}),
        ...(input.weight !== undefined
          ? {
              weight:
                nextRuleType === 'WEIGHTED'
                  ? (input.weight ?? null)
                  : null,
            }
          : nextRuleType !== 'WEIGHTED'
            ? { weight: null }
            : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.orderIndex !== undefined ? { orderIndex: nextOrderIndex } : {}),
        ...(input.priority !== undefined ? { priority: nextPriority } : {}),
        ...(input.ruleType !== undefined && input.isRequired === undefined
          ? { isRequired: nextIsRequired }
          : {}),
      },
    });

    return mapQualificationRuleToResponse(updated);
  }

  override async deleteQualificationRule(icpId: string, ruleId: string): Promise<void> {
    const deleted = await prisma.qualificationRule.deleteMany({
      where: {
        id: ruleId,
        icpProfileId: icpId,
      },
    });

    if (deleted.count === 0) {
      throw new IcpNotFoundError('Qualification rule not found');
    }
  }

  override async listIcpRules(icpId: string): Promise<ListIcpRulesResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpId },
      select: { id: true },
    });
    if (!icp) {
      throw new IcpNotFoundError();
    }

    const rules = await prisma.qualificationRule.findMany({
      where: { icpProfileId: icpId },
      orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      items: rules.map((rule) => mapQualificationRuleToResponse(rule)),
    };
  }

  override async replaceIcpRules(
    icpId: string,
    input: ReplaceIcpRulesRequest,
  ): Promise<ListIcpRulesResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpId },
      select: { id: true },
    });
    if (!icp) {
      throw new IcpNotFoundError();
    }

    const sortedRules = [...input.rules].sort((a, b) => a.orderIndex - b.orderIndex);

    await prisma.$transaction(async (tx) => {
      await tx.qualificationRule.deleteMany({
        where: { icpProfileId: icpId },
      });

      for (const rule of sortedRules) {
        const resolvedRuleType = rule.ruleType ?? (rule.isRequired ? 'HARD_FILTER' : 'WEIGHTED');
        const isRequired = rule.isRequired ?? resolvedRuleType === 'HARD_FILTER';
        const priority = rule.priority ?? rule.orderIndex;

        await tx.qualificationRule.create({
          data: {
            icpProfileId: icpId,
            name: rule.name,
            ruleType: resolvedRuleType,
            isRequired,
            fieldKey: rule.fieldKey,
            operator: rule.operator,
            valueJson: toInputJson(rule.valueJson),
            weight:
              resolvedRuleType === 'WEIGHTED'
                ? (rule.weight ?? 1)
                : null,
            isActive: rule.isActive ?? true,
            orderIndex: rule.orderIndex,
            priority,
          },
        });
      }
    });

    return this.listIcpRules(icpId);
  }

  override async getIcpStatus(icpId: string): Promise<IcpStatusResponse> {
    const [icp, rules, lastDiscovery, lastScore] = await Promise.all([
      prisma.icpProfile.findUnique({
        where: { id: icpId },
        select: { id: true, isActive: true },
      }),
      prisma.qualificationRule.findMany({
        where: { icpProfileId: icpId },
        select: {
          id: true,
          isActive: true,
          ruleType: true,
          isRequired: true,
        },
      }),
      prisma.leadDiscoveryRecord.findFirst({
        where: { icpProfileId: icpId },
        orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }],
        select: { discoveredAt: true },
      }),
      prisma.leadScorePrediction.findFirst({
        where: { icpProfileId: icpId },
        orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }],
        select: { predictedAt: true },
      }),
    ]);

    if (!icp) {
      throw new IcpNotFoundError();
    }

    const activeRules = rules.filter((rule) => rule.isActive);
    const hardFilterRules = activeRules.filter(
      (rule) => rule.ruleType === 'HARD_FILTER' || rule.isRequired,
    ).length;
    const weightedRules = activeRules.filter(
      (rule) => rule.ruleType === 'WEIGHTED' && !rule.isRequired,
    ).length;

    return {
      icpId,
      isActive: icp.isActive,
      totalRules: rules.length,
      activeRules: activeRules.length,
      hardFilterRules,
      weightedRules,
      lastDiscoveryAt: lastDiscovery?.discoveredAt.toISOString() ?? null,
      lastScoredAt: lastScore?.predictedAt.toISOString() ?? null,
    };
  }

  override async getIcpDebugSample(
    icpProfileId: string,
    query: IcpDebugSampleQuery,
  ): Promise<IcpDebugSampleResponse> {
    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpProfileId },
      include: {
        qualificationRules: {
          where: { isActive: true },
          orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
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
