import type { EvaluationSplit } from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  evaluateModel,
  predictLogistic,
  splitDataset,
  type LogisticModel,
} from '../scoring/logistic.js';
import { FEATURE_KEYS_FOR_TRAINING } from './model.train.job.js';

export const MODEL_EVALUATE_JOB_NAME = 'model.evaluate';
export const MODEL_EVALUATE_IDEMPOTENCY_KEY_PATTERN = 'model.evaluate:${modelVersionId}:${split}';

export const MODEL_EVALUATE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'model.evaluate.dead_letter',
};

export interface ModelEvaluateJobPayload {
  runId: string;
  trainingRunId: string;
  modelVersionId: string;
  split: EvaluationSplit;
  activateIfPass?: boolean | undefined;
  correlationId?: string | undefined;
}

export interface ModelEvaluateLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface ModelEvaluateJobDependencies {
  boss: Pick<PgBoss, 'send'>;
}

/** Minimum AUC to activate a model. */
const ACTIVATION_AUC_THRESHOLD = 0.60;

function extractFeatureVector(featuresJson: unknown): number[] | null {
  if (!featuresJson || typeof featuresJson !== 'object') return null;
  const features = featuresJson as Record<string, unknown>;

  const vector: number[] = [];
  for (const key of FEATURE_KEYS_FOR_TRAINING) {
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

function parseCoefficients(
  coefficientsJson: unknown,
): LogisticModel | null {
  if (!coefficientsJson || typeof coefficientsJson !== 'object') return null;
  const payload = coefficientsJson as Record<string, unknown>;

  const values = payload['values'];
  const intercept = payload['intercept'];
  const featureStats = payload['featureStats'];

  if (!Array.isArray(values) || typeof intercept !== 'number' || !Array.isArray(featureStats)) {
    return null;
  }

  return {
    coefficients: values as number[],
    intercept,
    featureStats: featureStats as { mean: number; std: number }[],
  };
}

export async function handleModelEvaluateJob(
  logger: ModelEvaluateLogger,
  job: Job<ModelEvaluateJobPayload>,
  deps?: ModelEvaluateJobDependencies,
): Promise<void> {
  const { runId, correlationId, trainingRunId, modelVersionId, split, activateIfPass } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      trainingRunId,
      modelVersionId,
      split,
      activateIfPass,
      correlationId: correlationId ?? job.id,
    },
    'Started model.evaluate job',
  );

  try {
    // 1. Fetch ModelVersion and parse coefficients
    const modelVersion = await prisma.modelVersion.findUniqueOrThrow({
      where: { id: modelVersionId },
    });

    const model = parseCoefficients(modelVersion.coefficientsJson);
    if (!model) {
      logger.warn(
        { jobId: job.id, modelVersionId },
        'Invalid coefficients in ModelVersion, skipping evaluation',
      );
      return;
    }

    // 2. Reconstruct the dataset using the same split as training
    const allLabels = await prisma.trainingLabel.findMany({
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

    const fullDataset: { features: number[]; label: number }[] = [];
    for (const entry of allLabels) {
      const snapshot = entry.lead.featureSnapshots[0];
      if (!snapshot) continue;
      const vector = extractFeatureVector(snapshot.featuresJson);
      if (!vector) continue;
      fullDataset.push({ features: vector, label: entry.label });
    }

    // Use same split seed as training (trainingRunId)
    const splits = splitDataset(fullDataset, trainingRunId);

    const evalData =
      split === 'TRAIN' ? splits.train
        : split === 'VALIDATION' ? splits.validation
          : splits.test;

    if (evalData.length === 0) {
      logger.warn(
        { jobId: job.id, split, modelVersionId },
        'No evaluation data for split, skipping',
      );
      return;
    }

    // 3. Run predictions
    const predictions = evalData.map((d) => predictLogistic(d.features, model));
    const labels = evalData.map((d) => d.label);

    // 4. Evaluate
    const metrics = evaluateModel(predictions, labels);
    const positiveRate = labels.filter((l) => l === 1).length / labels.length;

    // 5. Persist ModelEvaluation
    const confusionMatrix = computeConfusionMatrix(predictions, labels);

    await prisma.modelEvaluation.create({
      data: {
        modelVersionId,
        trainingRunId,
        split,
        sampleSize: evalData.length,
        positiveRate,
        auc: metrics.auc,
        prAuc: metrics.prAuc,
        precision: metrics.precision,
        recall: metrics.recall,
        f1: metrics.f1,
        brierScore: metrics.brierScore,
        calibrationJson: Prisma.JsonNull,
        confusionMatrixJson: JSON.parse(JSON.stringify(confusionMatrix)) as Prisma.InputJsonValue,
        evaluatedAt: new Date(),
      },
    });

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        modelVersionId,
        split,
        auc: metrics.auc,
        precision: metrics.precision,
        recall: metrics.recall,
        f1: metrics.f1,
        brierScore: metrics.brierScore,
        sampleSize: evalData.length,
      },
      'Model evaluation metrics computed',
    );

    // 6. Activation logic
    if (split === 'TEST' && activateIfPass === true) {
      if (metrics.auc >= ACTIVATION_AUC_THRESHOLD) {
        // Activate this model, retire previous active
        await prisma.$transaction(async (tx) => {
          await tx.modelVersion.updateMany({
            where: {
              modelType: 'LOGISTIC_REGRESSION',
              stage: 'ACTIVE',
              id: { not: modelVersionId },
            },
            data: {
              stage: 'ARCHIVED',
              retiredAt: new Date(),
            },
          });

          await tx.modelVersion.update({
            where: { id: modelVersionId },
            data: {
              stage: 'ACTIVE',
              activatedAt: new Date(),
            },
          });
        });

        logger.info(
          { jobId: job.id, modelVersionId, auc: metrics.auc },
          'Model activated: AUC passed threshold',
        );
      } else {
        await prisma.modelVersion.update({
          where: { id: modelVersionId },
          data: { stage: 'ARCHIVED' },
        });

        logger.info(
          {
            jobId: job.id,
            modelVersionId,
            auc: metrics.auc,
            threshold: ACTIVATION_AUC_THRESHOLD,
          },
          'Model rejected: AUC below threshold',
        );
      }
    }

    // 7. If VALIDATION passed, chain to TEST evaluation
    if (split === 'VALIDATION' && metrics.auc >= ACTIVATION_AUC_THRESHOLD && deps?.boss) {
      const testPayload: ModelEvaluateJobPayload = {
        runId: `eval-test-${modelVersionId.slice(0, 8)}-${Date.now()}`,
        trainingRunId,
        modelVersionId,
        split: 'TEST',
        activateIfPass: true,
        correlationId: correlationId ?? job.id,
      };

      await deps.boss.send(
        MODEL_EVALUATE_JOB_NAME,
        testPayload,
        {
          ...MODEL_EVALUATE_RETRY_OPTIONS,
          singletonKey: `model.evaluate:${modelVersionId}:TEST`,
        },
      );

      logger.info(
        { jobId: job.id, modelVersionId, validationAuc: metrics.auc },
        'Validation passed, enqueued TEST evaluation',
      );
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        modelVersionId,
        correlationId: correlationId ?? job.id,
      },
      'Completed model.evaluate job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        trainingRunId,
        modelVersionId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed model.evaluate job',
    );

    throw error;
  }
}

function computeConfusionMatrix(
  predictions: number[],
  labels: number[],
): { tp: number; fp: number; tn: number; fn: number } {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (let i = 0; i < predictions.length; i++) {
    const predicted = predictions[i]! >= 0.5 ? 1 : 0;
    const actual = labels[i]!;
    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else fn++;
  }
  return { tp, fp, tn, fn };
}
