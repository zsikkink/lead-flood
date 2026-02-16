import type { CreateScoringRunRequest } from '@lead-flood/contracts';
import { createHash } from 'node:crypto';
import { Prisma, prisma } from '@lead-flood/db';
import type { Job, SendOptions } from 'pg-boss';

import {
  evaluateDeterministicScore,
  toScoreBand,
  type DeterministicRule,
} from '../scoring/deterministic.js';

export const SCORING_COMPUTE_JOB_NAME = 'scoring.compute';
export const SCORING_COMPUTE_IDEMPOTENCY_KEY_PATTERN = 'scoring.compute:${runId}';

export const SCORING_COMPUTE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'scoring.compute.dead_letter',
};

export interface ScoringComputeJobPayload
  extends Pick<CreateScoringRunRequest, 'mode' | 'icpProfileId' | 'leadIds' | 'modelVersionId' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
}

export interface ScoringComputeLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

const BASELINE_TRAINING_RUN_TRIGGER = 'MANUAL';
const BASELINE_MODEL_VERSION_TAG = 'deterministic-baseline-v1';
const BASELINE_FEATURE_EXTRACTOR_VERSION = 'features_v1';
const BASELINE_FEATURE_KEYS = [
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

function deterministicChecksum(input: string): string {
  return createHash('sha256').update(input).digest('hex');
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

async function ensureBaselineModelVersion(): Promise<string> {
  const existing = await prisma.modelVersion.findUnique({
    where: { versionTag: BASELINE_MODEL_VERSION_TAG },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const now = new Date();
  const checksumSource = JSON.stringify({
    versionTag: BASELINE_MODEL_VERSION_TAG,
    sourceVersion: BASELINE_FEATURE_EXTRACTOR_VERSION,
    featureKeys: BASELINE_FEATURE_KEYS,
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const trainingRun = await tx.trainingRun.create({
        data: {
          modelType: 'LOGISTIC_REGRESSION',
          status: 'SUCCEEDED',
          trigger: BASELINE_TRAINING_RUN_TRIGGER,
          configJson: {
            baseline: true,
            sourceVersion: BASELINE_FEATURE_EXTRACTOR_VERSION,
          },
          trainingWindowStart: new Date(now.getTime() - 86_400_000),
          trainingWindowEnd: now,
          datasetSize: 0,
          positiveCount: 0,
          negativeCount: 0,
          startedAt: now,
          endedAt: now,
        },
      });

      return tx.modelVersion.create({
        data: {
          trainingRunId: trainingRun.id,
          modelType: 'LOGISTIC_REGRESSION',
          versionTag: BASELINE_MODEL_VERSION_TAG,
          stage: 'ACTIVE',
          featureSchemaJson: {
            sourceVersion: BASELINE_FEATURE_EXTRACTOR_VERSION,
            keys: BASELINE_FEATURE_KEYS,
          },
          coefficientsJson: Prisma.JsonNull,
          intercept: 0,
          deterministicWeightsJson: {},
          checksum: deterministicChecksum(checksumSource),
          trainedAt: now,
          activatedAt: now,
        },
      });
    });

    return created.id;
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const fallback = await prisma.modelVersion.findUnique({
        where: { versionTag: BASELINE_MODEL_VERSION_TAG },
        select: { id: true },
      });
      if (fallback) {
        return fallback.id;
      }
    }
    throw error;
  }
}

export async function handleScoringComputeJob(
  logger: ScoringComputeLogger,
  job: Job<ScoringComputeJobPayload>,
): Promise<void> {
  const { runId, correlationId, modelVersionId, icpProfileId } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      modelVersionId,
      icpProfileId,
      mode: job.data.mode,
    },
    'Started scoring.compute job',
  );

  try {
    const effectiveModelVersionId =
      modelVersionId ??
      (await ensureBaselineModelVersion());

    const targetIcpIds =
      job.data.mode === 'BY_ICP' && icpProfileId
        ? [icpProfileId]
        : job.data.mode === 'ALL_ACTIVE_ICPS'
          ? (
              await prisma.icpProfile.findMany({
                where: { isActive: true },
                select: { id: true },
              })
            ).map((row) => row.id)
          : icpProfileId
            ? [icpProfileId]
            : [];

    if (targetIcpIds.length === 0) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
        },
        'No ICP targets resolved for scoring.compute job',
      );
      return;
    }

    const targetLeadIds =
      job.data.mode === 'BY_LEAD_IDS' && job.data.leadIds && job.data.leadIds.length > 0
        ? job.data.leadIds
        : (
            await prisma.lead.findMany({
              select: { id: true },
            })
          ).map((lead) => lead.id);

    const rulesByIcp = new Map<string, DeterministicRule[]>();
    for (const icpId of targetIcpIds) {
      const rules = await prisma.qualificationRule.findMany({
        where: {
          icpProfileId: icpId,
          isActive: true,
        },
        orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
      });
      rulesByIcp.set(icpId, asDeterministicRules(rules));
    }

    let persistedPredictions = 0;
    for (const targetLeadId of targetLeadIds) {
      for (const targetIcpId of targetIcpIds) {
        const latestSnapshot = await prisma.leadFeatureSnapshot.findFirst({
          where: {
            leadId: targetLeadId,
            icpProfileId: targetIcpId,
          },
          orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        });

        if (!latestSnapshot) {
          continue;
        }

        const featurePayload =
          latestSnapshot.featuresJson && typeof latestSnapshot.featuresJson === 'object'
            ? (latestSnapshot.featuresJson as Record<string, unknown>)
            : {};
        const rules = rulesByIcp.get(targetIcpId) ?? [];
        const deterministic = evaluateDeterministicScore(rules, featurePayload);
        const deterministicScore = deterministic.qualificationScore;
        const logisticScore = 0;
        const blendedScore = deterministicScore;
        const scoreBand = toScoreBand(blendedScore);

        await prisma.leadScorePrediction.upsert({
          where: {
            leadId_icpProfileId_featureSnapshotId_modelVersionId: {
              leadId: targetLeadId,
              icpProfileId: targetIcpId,
              featureSnapshotId: latestSnapshot.id,
              modelVersionId: effectiveModelVersionId,
            },
          },
          create: {
            leadId: targetLeadId,
            icpProfileId: targetIcpId,
            featureSnapshotId: latestSnapshot.id,
            modelVersionId: effectiveModelVersionId,
            deterministicScore,
            logisticScore,
            blendedScore,
            scoreBand,
            reasonsJson: toInputJson({
              reasonCodes: deterministic.reasonCodes,
              hardFilterPassed: deterministic.hardFilterPassed,
            }),
            ruleEvaluationJson: toInputJson(deterministic.ruleEvaluation),
            predictedAt: new Date(),
          },
          update: {
            deterministicScore,
            logisticScore,
            blendedScore,
            scoreBand,
            reasonsJson: toInputJson({
              reasonCodes: deterministic.reasonCodes,
              hardFilterPassed: deterministic.hardFilterPassed,
            }),
            ruleEvaluationJson: toInputJson(deterministic.ruleEvaluation),
            predictedAt: new Date(),
          },
        });

        persistedPredictions += 1;
      }
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        persistedPredictions,
        modelVersionId: effectiveModelVersionId,
      },
      'Completed scoring.compute job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed scoring.compute job',
    );

    throw error;
  }
}
