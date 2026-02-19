import type { CreateRetrainRunRequest, TrainingTrigger } from '@lead-flood/contracts';
import { createHash } from 'node:crypto';
import { type Prisma, prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import { adjustDeterministicWeights, computeFactorLift } from '../scoring/lift-analysis.js';
import { splitDataset, trainLogisticRegression } from '../scoring/logistic.js';
import {
  MODEL_EVALUATE_JOB_NAME,
  MODEL_EVALUATE_RETRY_OPTIONS,
  type ModelEvaluateJobPayload,
} from './model.evaluate.job.js';

export const MODEL_TRAIN_JOB_NAME = 'model.train';
export const MODEL_TRAIN_IDEMPOTENCY_KEY_PATTERN = 'model.train:${trainingRunId}';

export const MODEL_TRAIN_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 1,
  retryDelay: 300,
  retryBackoff: true,
  deadLetter: 'model.train.dead_letter',
};

export interface ModelTrainJobPayload
  extends Pick<
    CreateRetrainRunRequest,
    'windowDays' | 'minSamples' | 'activateIfPass' | 'requestedByUserId'
  > {
  runId: string;
  trainingRunId: string;
  trigger: TrainingTrigger;
  correlationId?: string | undefined;
}

export interface ModelTrainLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface ModelTrainJobDependencies {
  boss: Pick<PgBoss, 'send'>;
}

/** Feature keys extracted from featuresJson — must match scoring.compute BASELINE_FEATURE_KEYS. */
const NUMERIC_FEATURE_KEYS = [
  'has_email',
  'has_domain',
  'has_company_name',
  'industry_supported',
  'has_whatsapp',
  'has_instagram',
  'accepts_online_payments',
  'review_count',
  'follower_count',
  'physical_address_present',
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
  'geo_match',
  'enrichment_success_rate',
  'discovery_attempt_count',
  'enrichment_attempt_count',
  'days_since_discovery',
  'rule_match_count',
  'hard_filter_passed',
] as const;

export const FEATURE_KEYS_FOR_TRAINING = NUMERIC_FEATURE_KEYS;

function extractFeatureVector(featuresJson: unknown): number[] | null {
  if (!featuresJson || typeof featuresJson !== 'object') return null;
  const features = featuresJson as Record<string, unknown>;

  const vector: number[] = [];
  for (const key of NUMERIC_FEATURE_KEYS) {
    const raw = features[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      vector.push(raw);
    } else if (typeof raw === 'boolean') {
      vector.push(raw ? 1 : 0);
    } else if (typeof raw === 'string') {
      const parsed = Number(raw);
      vector.push(Number.isFinite(parsed) ? parsed : 0);
    } else {
      vector.push(0);
    }
  }

  return vector;
}

function deterministicChecksum(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function handleModelTrainJob(
  logger: ModelTrainLogger,
  job: Job<ModelTrainJobPayload>,
  deps?: ModelTrainJobDependencies,
): Promise<void> {
  const { runId, correlationId, trainingRunId, trigger, windowDays, minSamples } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      trainingRunId,
      correlationId: correlationId ?? job.id,
      trigger,
      windowDays,
      minSamples,
    },
    'Started model.train job',
  );

  try {
    // 1. Mark TrainingRun as RUNNING
    await prisma.trainingRun.update({
      where: { id: trainingRunId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // 2. Fetch all TrainingLabel rows with their lead's latest FeatureSnapshot
    const labels = await prisma.trainingLabel.findMany({
      select: {
        id: true,
        leadId: true,
        label: true,
        lead: {
          select: {
            featureSnapshots: {
              orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
              take: 1,
              select: { featuresJson: true },
            },
          },
        },
      },
    });

    // 3. Build dataset: filter to labels with valid features
    const dataset: { features: number[]; label: number }[] = [];
    for (const entry of labels) {
      const snapshot = entry.lead.featureSnapshots[0];
      if (!snapshot) continue;
      const vector = extractFeatureVector(snapshot.featuresJson);
      if (!vector) continue;
      dataset.push({ features: vector, label: entry.label });
    }

    const positiveCount = dataset.filter((d) => d.label === 1).length;
    const negativeCount = dataset.filter((d) => d.label === 0).length;

    if (dataset.length < (minSamples ?? 20)) {
      logger.warn(
        {
          jobId: job.id,
          trainingRunId,
          datasetSize: dataset.length,
          minSamples: minSamples ?? 20,
        },
        'Insufficient training data, marking run as failed',
      );

      await prisma.trainingRun.update({
        where: { id: trainingRunId },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          errorMessage: `Insufficient data: ${dataset.length} samples (min: ${minSamples ?? 20})`,
          datasetSize: dataset.length,
          positiveCount,
          negativeCount,
        },
      });

      return;
    }

    // 4. Split dataset deterministically by trainingRunId
    const splits = splitDataset(dataset, trainingRunId);

    // 5. Train logistic regression on train split
    const trainResult = trainLogisticRegression(splits.train, {
      learningRate: 0.01,
      lambda: 0.01,
      maxIterations: 1000,
    });

    // 6. Create ModelVersion
    const coefficientsPayload = JSON.parse(JSON.stringify({
      keys: [...NUMERIC_FEATURE_KEYS],
      values: trainResult.coefficients,
      intercept: trainResult.intercept,
      featureStats: trainResult.featureStats,
    })) as Prisma.InputJsonValue;

    const versionTag = `lr-${trainingRunId.slice(0, 8)}-${Date.now()}`;
    const checksumSource = JSON.stringify({
      versionTag,
      coefficients: trainResult.coefficients,
      intercept: trainResult.intercept,
    });

    const modelVersion = await prisma.modelVersion.create({
      data: {
        trainingRunId,
        modelType: 'LOGISTIC_REGRESSION',
        versionTag,
        stage: 'SHADOW',
        featureSchemaJson: {
          sourceVersion: 'features_v1',
          keys: [...NUMERIC_FEATURE_KEYS],
        },
        coefficientsJson: coefficientsPayload,
        intercept: trainResult.intercept,
        deterministicWeightsJson: {},
        checksum: deterministicChecksum(checksumSource),
        trainedAt: new Date(),
      },
    });

    // 6b. Run lift analysis and store adjusted deterministic weights
    const convertedSnapshots: Record<string, unknown>[] = [];
    const nonConvertedSnapshots: Record<string, unknown>[] = [];

    for (const entry of labels) {
      const snapshot = entry.lead.featureSnapshots[0];
      if (!snapshot?.featuresJson || typeof snapshot.featuresJson !== 'object') continue;
      const features = snapshot.featuresJson as Record<string, unknown>;

      if (entry.label === 1) {
        convertedSnapshots.push(features);
      } else {
        nonConvertedSnapshots.push(features);
      }
    }

    if (convertedSnapshots.length > 0 && nonConvertedSnapshots.length > 0) {
      const liftResults = computeFactorLift(convertedSnapshots, nonConvertedSnapshots);

      // Load current deterministic weights from latest active model, or use empty defaults
      const activeModel = await prisma.modelVersion.findFirst({
        where: { stage: 'ACTIVE' },
        orderBy: { activatedAt: 'desc' },
        select: { deterministicWeightsJson: true },
      });

      const currentWeights =
        activeModel?.deterministicWeightsJson &&
        typeof activeModel.deterministicWeightsJson === 'object' &&
        !Array.isArray(activeModel.deterministicWeightsJson)
          ? (activeModel.deterministicWeightsJson as Record<string, number>)
          : {};

      if (Object.keys(currentWeights).length > 0) {
        const adjustedWeights = adjustDeterministicWeights(currentWeights, liftResults);

        await prisma.modelVersion.update({
          where: { id: modelVersion.id },
          data: {
            deterministicWeightsJson: JSON.parse(JSON.stringify(adjustedWeights)) as Prisma.InputJsonValue,
          },
        });

        logger.info(
          {
            jobId: job.id,
            trainingRunId,
            modelVersionId: modelVersion.id,
            liftFactorsAnalyzed: liftResults.length,
            weightsAdjusted: Object.keys(adjustedWeights).length,
          },
          'Lift analysis complete, deterministic weights updated on model version',
        );
      } else {
        logger.info(
          { jobId: job.id, trainingRunId },
          'No active model with deterministic weights found, skipping lift adjustment',
        );
      }
    } else {
      logger.info(
        { jobId: job.id, trainingRunId, converted: convertedSnapshots.length, nonConverted: nonConvertedSnapshots.length },
        'Insufficient cohort data for lift analysis',
      );
    }

    // 7. Update TrainingRun as SUCCEEDED
    await prisma.trainingRun.update({
      where: { id: trainingRunId },
      data: {
        status: 'SUCCEEDED',
        endedAt: new Date(),
        datasetSize: dataset.length,
        positiveCount,
        negativeCount,
      },
    });

    // 8. Enqueue model.evaluate for VALIDATION split
    if (deps?.boss) {
      const evaluatePayload: ModelEvaluateJobPayload = {
        runId: `eval-${modelVersion.id.slice(0, 8)}-${Date.now()}`,
        trainingRunId,
        modelVersionId: modelVersion.id,
        split: 'VALIDATION',
        activateIfPass: false,
        correlationId: correlationId ?? job.id,
      };

      await deps.boss.send(
        MODEL_EVALUATE_JOB_NAME,
        evaluatePayload,
        {
          ...MODEL_EVALUATE_RETRY_OPTIONS,
          singletonKey: `model.evaluate:${modelVersion.id}:VALIDATION`,
        },
      );
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        modelVersionId: modelVersion.id,
        correlationId: correlationId ?? job.id,
        datasetSize: dataset.length,
        trainSize: splits.train.length,
        validationSize: splits.validation.length,
        testSize: splits.test.length,
        converged: trainResult.convergenceInfo.converged,
        iterations: trainResult.convergenceInfo.iterations,
      },
      'Completed model.train job',
    );
  } catch (error: unknown) {
    // Mark training run as failed
    try {
      await prisma.trainingRun.update({
        where: { id: trainingRunId },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
    } catch {
      // Swallow — we want to rethrow the original error
    }

    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed model.train job',
    );

    throw error;
  }
}
