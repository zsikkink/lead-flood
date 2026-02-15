import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@lead-flood/db';
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
}

export const FEATURE_EXTRACTOR_VERSION = 'features_v1';
export const FEATURE_KEYS = [
  'source_provider',
  'has_email',
  'has_domain',
  'has_company_name',
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
    fieldKey: rule.fieldKey,
    operator: rule.operator,
    valueJson: rule.valueJson,
    weight: rule.weight,
    isActive: rule.isActive,
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
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
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

    const companyName = normalizeString(normalizedPayload?.companyName);
    const industry = normalizeString(normalizedPayload?.industry);
    const geoCountry = normalizeString(normalizedPayload?.locationCountry);
    const companySizeRaw = normalizedPayload?.companySize;
    const companySize =
      typeof companySizeRaw === 'number' && Number.isFinite(companySizeRaw)
        ? companySizeRaw
        : null;

    const targetIndustries = new Set(icp.targetIndustries.map((entry) => entry.toLowerCase()));
    const targetCountries = new Set(icp.targetCountries.map((entry) => entry.toLowerCase()));
    const normalizedIndustry = industry?.toLowerCase() ?? null;
    const normalizedCountry = geoCountry?.toLowerCase() ?? null;

    const industryMatch =
      targetIndustries.size === 0 ||
      (normalizedIndustry !== null && targetIndustries.has(normalizedIndustry));
    const geoMatch =
      targetCountries.size === 0 ||
      (normalizedCountry !== null && targetCountries.has(normalizedCountry));

    const featurePayload = buildFeaturePayload({
      sourceProvider: latestDiscovery?.provider ?? 'UNKNOWN',
      hasEmail: Boolean(normalizeString(lead.email)),
      hasDomain: Boolean(domain),
      hasCompanyName: Boolean(companyName),
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
