import { createHash } from 'node:crypto';
import { prisma } from '@lead-flood/db';
import type { Prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  SCORING_COMPUTE_JOB_NAME,
  SCORING_COMPUTE_RETRY_OPTIONS,
  type ScoringComputeJobPayload,
} from './scoring.compute.job.js';
import { evaluateDeterministicScore, type DeterministicRule } from '../scoring/deterministic.js';

export const FEATURES_COMPUTE_JOB_NAME = 'features.compute';
export const FEATURES_COMPUTE_IDEMPOTENCY_KEY_PATTERN = 'features.compute:${leadId}:${snapshotVersion}';

export const FEATURES_COMPUTE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 20,
  retryBackoff: true,
  deadLetter: 'features.compute.dead_letter',
};

export interface FeaturesComputeJobPayload {
  runId: string;
  leadId: string;
  icpProfileId: string;
  snapshotVersion: number;
  sourceVersion?: string;
  enrichmentRecordId?: string;
  correlationId?: string;
}

export interface FeaturesComputeLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface FeaturesComputeDependencies {
  boss: Pick<PgBoss, 'send'>;
  enqueueScoring?: boolean;
}

export const FEATURE_EXTRACTOR_VERSION = 'features_v1';
export const FEATURE_KEYS = [
  'source_provider',
  'has_email',
  'has_domain',
  'has_company_name',
  'country',
  'industry',
  'industry_supported',
  'has_whatsapp',
  'has_instagram',
  'accepts_online_payments',
  'review_count',
  'follower_count',
  'physical_address_present',
  'physical_location',
  'physical_store_present',
  'recent_activity',
  'custom_order_signals',
  'pure_self_serve_ecom',
  'shopify_detected',
  'abandonment_signal_detected',
  'multi_staff_detected',
  'follower_growth_signal',
  'high_engagement_signal',
  'has_booking_or_contact_form',
  'variable_pricing_detected',
  'industry_match',
  'industry_match_reason',
  'geo_match',
  'geo_match_reason',
  'employee_size_bucket',
  'enrichment_success_rate',
  'discovery_attempt_count',
  'enrichment_attempt_count',
  'days_since_discovery',
  'rule_match_count',
  'hard_filter_passed',
] as const;

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeCountry(value: unknown): string | null {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['uae', 'ae', 'united arab emirates'].includes(normalized)) {
    return 'UAE';
  }
  if (['ksa', 'saudi arabia', 'sa'].includes(normalized)) {
    return 'KSA';
  }
  if (['jordan', 'jo'].includes(normalized)) {
    return 'Jordan';
  }
  if (['egypt', 'eg'].includes(normalized)) {
    return 'Egypt';
  }

  return normalized.toUpperCase();
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value > 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '0'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function findValueByKey(input: unknown, targetKey: string): unknown {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const entries = Object.entries(input as Record<string, unknown>);
  for (const [key, value] of entries) {
    if (key === targetKey) {
      return value;
    }
  }

  for (const [, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = findValueByKey(item, targetKey);
        if (nested !== undefined) {
          return nested;
        }
      }
      continue;
    }

    if (value && typeof value === 'object') {
      const nested = findValueByKey(value, targetKey);
      if (nested !== undefined) {
        return nested;
      }
    }
  }

  return undefined;
}

function extractNumberFromSources(
  sources: unknown[],
  candidateKeys: readonly string[],
): number | null {
  for (const source of sources) {
    for (const key of candidateKeys) {
      const value = findValueByKey(source, key);
      const numeric = asNumber(value);
      if (numeric !== null) {
        return numeric;
      }
    }
  }
  return null;
}

function extractBooleanFromSources(
  sources: unknown[],
  candidateKeys: readonly string[],
): boolean | null {
  for (const source of sources) {
    for (const key of candidateKeys) {
      const value = findValueByKey(source, key);
      const bool = asBoolean(value);
      if (bool !== null) {
        return bool;
      }
    }
  }
  return null;
}

function includesAnyKeyword(value: unknown, keywords: readonly string[]): boolean {
  const text = stableStringify(value).toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSort(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sortedEntries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => [key, stableSort(entryValue)]);

  return Object.fromEntries(sortedEntries);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSort(value));
}

export function computeFeatureVectorHash(features: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(features)).digest('hex');
}

export function toEmployeeSizeBucket(companySize: number | null): string {
  if (companySize === null || !Number.isFinite(companySize)) {
    return 'unknown';
  }
  if (companySize <= 10) {
    return 'micro';
  }
  if (companySize <= 50) {
    return 'small';
  }
  if (companySize <= 250) {
    return 'medium';
  }
  if (companySize <= 1000) {
    return 'large';
  }
  return 'enterprise';
}

function calculateDaysSince(date: Date | null): number {
  if (!date) {
    return 0;
  }

  const diffMs = Date.now() - date.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 86_400_000) : 0;
}

function buildFeaturePayload(input: {
  sourceProvider: string;
  hasEmail: boolean;
  hasDomain: boolean;
  hasCompanyName: boolean;
  country: string | null;
  industry: string | null;
  industrySupported: boolean;
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  acceptsOnlinePayments: boolean;
  reviewCount: number;
  followerCount: number;
  physicalAddressPresent: boolean;
  physicalLocation: boolean;
  physicalStorePresent: boolean;
  recentActivity: boolean;
  customOrderSignals: boolean;
  pureSelfServeEcom: boolean;
  shopifyDetected: boolean;
  abandonmentSignalDetected: boolean;
  multiStaffDetected: boolean;
  followerGrowthSignal: boolean;
  highEngagementSignal: boolean;
  hasBookingOrContactForm: boolean;
  variablePricingDetected: boolean;
  industryMatch: boolean;
  industryMatchReason: string;
  geoMatch: boolean;
  geoMatchReason: string;
  employeeSizeBucket: string;
  enrichmentSuccessRate: number;
  discoveryAttemptCount: number;
  enrichmentAttemptCount: number;
  daysSinceDiscovery: number;
  ruleMatchCount: number;
  hardFilterPassed: boolean;
}): Record<(typeof FEATURE_KEYS)[number], unknown> {
  return {
    source_provider: input.sourceProvider,
    has_email: input.hasEmail,
    has_domain: input.hasDomain,
    has_company_name: input.hasCompanyName,
    country: input.country,
    industry: input.industry,
    industry_supported: input.industrySupported,
    has_whatsapp: input.hasWhatsapp,
    has_instagram: input.hasInstagram,
    accepts_online_payments: input.acceptsOnlinePayments,
    review_count: input.reviewCount,
    follower_count: input.followerCount,
    physical_address_present: input.physicalAddressPresent,
    physical_location: input.physicalLocation,
    physical_store_present: input.physicalStorePresent,
    recent_activity: input.recentActivity,
    custom_order_signals: input.customOrderSignals,
    pure_self_serve_ecom: input.pureSelfServeEcom,
    shopify_detected: input.shopifyDetected,
    abandonment_signal_detected: input.abandonmentSignalDetected,
    multi_staff_detected: input.multiStaffDetected,
    follower_growth_signal: input.followerGrowthSignal,
    high_engagement_signal: input.highEngagementSignal,
    has_booking_or_contact_form: input.hasBookingOrContactForm,
    variable_pricing_detected: input.variablePricingDetected,
    industry_match: input.industryMatch,
    industry_match_reason: input.industryMatchReason,
    geo_match: input.geoMatch,
    geo_match_reason: input.geoMatchReason,
    employee_size_bucket: input.employeeSizeBucket,
    enrichment_success_rate: input.enrichmentSuccessRate,
    discovery_attempt_count: input.discoveryAttemptCount,
    enrichment_attempt_count: input.enrichmentAttemptCount,
    days_since_discovery: input.daysSinceDiscovery,
    rule_match_count: input.ruleMatchCount,
    hard_filter_passed: input.hardFilterPassed,
  };
}

function asDeterministicRules(value: Awaited<ReturnType<typeof prisma.qualificationRule.findMany>>): DeterministicRule[] {
  return value.map((rule) => ({
    id: rule.id,
    name: rule.name,
    ruleType: rule.ruleType,
    isRequired: rule.isRequired,
    fieldKey: rule.fieldKey,
    operator: rule.operator,
    valueJson: rule.valueJson,
    weight: rule.weight,
    isActive: rule.isActive,
    orderIndex: rule.orderIndex,
    priority: rule.priority,
  }));
}

export async function handleFeaturesComputeJob(
  logger: FeaturesComputeLogger,
  job: Job<FeaturesComputeJobPayload>,
  dependencies: FeaturesComputeDependencies,
): Promise<void> {
  const { runId, correlationId, leadId, icpProfileId, snapshotVersion } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      leadId,
      icpProfileId,
      snapshotVersion,
    },
    'Started features.compute job',
  );

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      logger.warn(
        {
          jobId: job.id,
          runId,
          correlationId: effectiveCorrelationId,
          leadId,
        },
        'Skipping features.compute job because lead was not found',
      );
      return;
    }

    const icp = await prisma.icpProfile.findUnique({
      where: { id: icpProfileId },
    });

    if (!icp) {
      logger.warn(
        {
          jobId: job.id,
          runId,
          correlationId: effectiveCorrelationId,
          leadId,
          icpProfileId,
        },
        'Skipping features.compute job because icpProfile was not found',
      );
      return;
    }

    const [latestDiscovery, latestEnrichment, discoveryAttemptCount, enrichmentAttemptCount, rules] =
      await Promise.all([
        prisma.leadDiscoveryRecord.findFirst({
          where: {
            leadId,
            icpProfileId,
          },
          orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.leadEnrichmentRecord.findFirst({
          where: { leadId },
          orderBy: [{ enrichedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.leadDiscoveryRecord.count({
          where: { leadId, icpProfileId },
        }),
        prisma.leadEnrichmentRecord.count({
          where: { leadId },
        }),
        prisma.qualificationRule.findMany({
          where: {
            icpProfileId,
            isActive: true,
          },
          orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
        }),
      ]);

    const enrichmentProvider = latestEnrichment?.provider ?? null;
    let enrichmentSuccessRate = 0;
    if (enrichmentProvider) {
      const [successCount, totalCount] = await Promise.all([
        prisma.leadEnrichmentRecord.count({
          where: {
            leadId,
            provider: enrichmentProvider,
            status: 'COMPLETED',
          },
        }),
        prisma.leadEnrichmentRecord.count({
          where: {
            leadId,
            provider: enrichmentProvider,
          },
        }),
      ]);

      enrichmentSuccessRate = totalCount > 0 ? successCount / totalCount : 0;
    }

    const domain = normalizeString(lead.email.split('@')[1])?.toLowerCase() ?? null;
    const normalizedPayload =
      latestEnrichment?.normalizedPayload && typeof latestEnrichment.normalizedPayload === 'object'
        ? (latestEnrichment.normalizedPayload as Record<string, unknown>)
        : null;
    const enrichmentRawPayload = latestEnrichment?.rawPayload ?? null;
    const discoveryRawPayload = latestDiscovery?.rawPayload ?? null;
    const featureSources = [normalizedPayload, enrichmentRawPayload, discoveryRawPayload];

    const companyName =
      normalizeString(normalizedPayload?.companyName) ??
      normalizeString(normalizedPayload?.company_name) ??
      normalizeString(findValueByKey(discoveryRawPayload, 'companyName'));
    const industry =
      normalizeString(normalizedPayload?.industry) ??
      normalizeString(findValueByKey(enrichmentRawPayload, 'industry')) ??
      normalizeString(findValueByKey(discoveryRawPayload, 'industry'));
    const country = normalizeCountry(
      normalizedPayload?.country ??
        normalizedPayload?.locationCountry ??
        findValueByKey(enrichmentRawPayload, 'country') ??
        findValueByKey(discoveryRawPayload, 'country'),
    );
    const companySize =
      extractNumberFromSources(featureSources, [
        'employeeCount',
        'companySize',
        'employees',
        'teamSize',
      ]) ?? null;
    const reviewCount =
      extractNumberFromSources(featureSources, ['reviewCount', 'reviews', 'ratingsCount']) ?? 0;
    const followerCount =
      extractNumberFromSources(featureSources, ['followerCount', 'followers', 'instagramFollowers']) ??
      0;
    const recentActivityDays =
      extractNumberFromSources(featureSources, ['lastActivityDays', 'daysSinceLastPost']) ?? null;

    const hasWhatsapp =
      extractBooleanFromSources(featureSources, ['hasWhatsapp', 'whatsapp']) ??
      includesAnyKeyword(featureSources, ['whatsapp', 'wa.me']);
    const hasInstagram =
      extractBooleanFromSources(featureSources, ['hasInstagram', 'instagramActive']) ??
      includesAnyKeyword(featureSources, ['instagram.com', 'instagram']);
    const acceptsOnlinePayments =
      extractBooleanFromSources(featureSources, ['acceptsOnlinePayments', 'onlinePayments']) ??
      includesAnyKeyword(featureSources, [
        'online payment',
        'checkout',
        'stripe',
        'paytabs',
        'apple pay',
        'mada',
      ]);
    const physicalAddressPresent =
      extractBooleanFromSources(featureSources, ['physicalAddressPresent', 'hasAddress']) ??
      Boolean(normalizeString(findValueByKey(featureSources, 'address')));
    const physicalLocation =
      extractBooleanFromSources(featureSources, ['physicalLocation']) ?? physicalAddressPresent;
    const physicalStorePresent =
      extractBooleanFromSources(featureSources, ['physicalStorePresent']) ??
      physicalAddressPresent;
    const recentActivity =
      extractBooleanFromSources(featureSources, ['recentActivity', 'isRecentlyActive']) ??
      (recentActivityDays !== null ? recentActivityDays <= 45 : false);
    const customOrderSignals =
      extractBooleanFromSources(featureSources, ['customOrderSignals']) ??
      includesAnyKeyword(featureSources, ['custom order', 'made to order', 'dm to order']);
    const shopifyDetected =
      extractBooleanFromSources(featureSources, ['shopifyDetected']) ??
      includesAnyKeyword(featureSources, ['shopify', 'myshopify']);
    const abandonmentSignalDetected =
      extractBooleanFromSources(featureSources, ['abandonmentSignalDetected']) ??
      includesAnyKeyword(featureSources, ['abandoned cart', 'cart recovery']);
    const multiStaffDetected =
      extractBooleanFromSources(featureSources, ['multiStaffDetected']) ??
      (companySize !== null ? companySize >= 4 : false);
    const followerGrowthSignal =
      extractBooleanFromSources(featureSources, ['followerGrowthSignal']) ??
      ((extractNumberFromSources(featureSources, ['followerGrowthRate']) ?? 0) > 0);
    const highEngagementSignal =
      extractBooleanFromSources(featureSources, ['highEngagementSignal']) ??
      ((extractNumberFromSources(featureSources, ['engagementRate']) ?? 0) >= 0.03);
    const hasBookingOrContactForm =
      extractBooleanFromSources(featureSources, ['hasBookingOrContactForm']) ??
      includesAnyKeyword(featureSources, ['book now', 'book a call', 'contact us', 'appointment']);
    const variablePricingDetected =
      extractBooleanFromSources(featureSources, ['variablePricingDetected']) ??
      includesAnyKeyword(featureSources, ['starting at', 'from ', 'price on request']);
    const pureSelfServeEcom =
      extractBooleanFromSources(featureSources, ['pureSelfServeEcom']) ??
      (shopifyDetected && !hasWhatsapp && !customOrderSignals);

    const targetIndustries = new Set(icp.targetIndustries.map((entry) => entry.toLowerCase()));
    const targetCountries = new Set(
      icp.targetCountries
        .map((entry) => normalizeCountry(entry))
        .filter((entry): entry is string => entry !== null)
        .map((entry) => entry.toLowerCase()),
    );
    const normalizedIndustry = industry?.toLowerCase() ?? null;
    const normalizedCountry = country?.toLowerCase() ?? null;

    const industryMatch =
      targetIndustries.size === 0 ||
      (normalizedIndustry !== null && targetIndustries.has(normalizedIndustry));
    const geoMatch =
      targetCountries.size === 0 ||
      (normalizedCountry !== null && targetCountries.has(normalizedCountry));
    const industrySupported = industryMatch;

    const featurePayload = buildFeaturePayload({
      sourceProvider: latestDiscovery?.provider ?? 'UNKNOWN',
      hasEmail: Boolean(normalizeString(lead.email)),
      hasDomain: Boolean(domain),
      hasCompanyName: Boolean(companyName),
      country,
      industry,
      industrySupported,
      hasWhatsapp,
      hasInstagram,
      acceptsOnlinePayments,
      reviewCount,
      followerCount,
      physicalAddressPresent,
      physicalLocation,
      physicalStorePresent,
      recentActivity,
      customOrderSignals,
      pureSelfServeEcom,
      shopifyDetected,
      abandonmentSignalDetected,
      multiStaffDetected,
      followerGrowthSignal,
      highEngagementSignal,
      hasBookingOrContactForm,
      variablePricingDetected,
      industryMatch,
      industryMatchReason:
        targetIndustries.size === 0
          ? 'NO_ICP_INDUSTRY_CONSTRAINT'
          : industryMatch
            ? 'MATCHED'
            : 'NOT_MATCHED',
      geoMatch,
      geoMatchReason:
        targetCountries.size === 0
          ? 'NO_ICP_GEO_CONSTRAINT'
          : geoMatch
            ? 'MATCHED'
            : 'NOT_MATCHED',
      employeeSizeBucket: toEmployeeSizeBucket(companySize),
      enrichmentSuccessRate: Number(enrichmentSuccessRate.toFixed(6)),
      discoveryAttemptCount,
      enrichmentAttemptCount,
      daysSinceDiscovery: calculateDaysSince(latestDiscovery?.discoveredAt ?? null),
      ruleMatchCount: 0,
      hardFilterPassed: false,
    });

    const deterministicPreview = evaluateDeterministicScore(asDeterministicRules(rules), {
      ...featurePayload,
      icp_profile_id: icpProfileId,
      lead_source: lead.source,
    });
    featurePayload.rule_match_count = deterministicPreview.ruleMatchCount;
    featurePayload.hard_filter_passed = deterministicPreview.hardFilterPassed;

    const sourceVersion = FEATURE_EXTRACTOR_VERSION;
    const featureVectorHash = computeFeatureVectorHash(featurePayload);

    const snapshot = await prisma.leadFeatureSnapshot.upsert({
      where: {
        leadId_icpProfileId_snapshotVersion_sourceVersion_featureVectorHash: {
          leadId,
          icpProfileId,
          snapshotVersion,
          sourceVersion,
          featureVectorHash,
        },
      },
      create: {
        leadId,
        icpProfileId,
        discoveryRecordId: latestDiscovery?.id ?? null,
        enrichmentRecordId: latestEnrichment?.id ?? null,
        snapshotVersion,
        sourceVersion,
        featureVectorHash,
        featuresJson: toInputJson(featurePayload),
        ruleMatchCount: deterministicPreview.ruleMatchCount,
        hardFilterPassed: deterministicPreview.hardFilterPassed,
        computedAt: new Date(),
      },
      update: {
        discoveryRecordId: latestDiscovery?.id ?? null,
        enrichmentRecordId: latestEnrichment?.id ?? null,
        featuresJson: toInputJson(featurePayload),
        ruleMatchCount: deterministicPreview.ruleMatchCount,
        hardFilterPassed: deterministicPreview.hardFilterPassed,
        computedAt: new Date(),
      },
    });

    if (dependencies.enqueueScoring !== false) {
      const scoringPayload: ScoringComputeJobPayload = {
        runId,
        mode: 'BY_LEAD_IDS',
        icpProfileId,
        leadIds: [leadId],
        correlationId: effectiveCorrelationId,
      };

      await prisma.jobExecution.create({
        data: {
          type: SCORING_COMPUTE_JOB_NAME,
          status: 'queued',
          payload: toInputJson({
            ...scoringPayload,
            featureSnapshotId: snapshot.id,
          }),
          leadId,
        },
      });

      await dependencies.boss.send(SCORING_COMPUTE_JOB_NAME, scoringPayload, {
        singletonKey: `scoring.compute:${runId}:${leadId}:${icpProfileId}`,
        ...SCORING_COMPUTE_RETRY_OPTIONS,
      });
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        leadId,
        featureSnapshotId: snapshot.id,
        featureVectorHash,
      },
      'Completed features.compute job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
        error,
      },
      'Failed features.compute job',
    );

    throw error;
  }
}
