import type PgBoss from 'pg-boss';

import {
  ANALYTICS_ROLLUP_JOB_NAME,
  type AnalyticsRollupJobPayload,
  ANALYTICS_ROLLUP_RETRY_OPTIONS,
} from './jobs/analytics.rollup.job.js';
import {
  type HeartbeatJobPayload,
} from './jobs/heartbeat.job.js';
import {
  DISCOVERY_SEED_JOB_NAME,
  DISCOVERY_SEED_RETRY_OPTIONS,
  type DiscoverySeedJobPayload,
} from './jobs/discovery.seed.job.js';
import {
  LABELS_GENERATE_JOB_NAME,
  type LabelsGenerateJobPayload,
  LABELS_GENERATE_RETRY_OPTIONS,
} from './jobs/labels.generate.job.js';
import { MODEL_TRAIN_JOB_NAME, type ModelTrainJobPayload, MODEL_TRAIN_RETRY_OPTIONS } from './jobs/model.train.job.js';
import {
  SCORING_COMPUTE_JOB_NAME,
  type ScoringComputeJobPayload,
  SCORING_COMPUTE_RETRY_OPTIONS,
} from './jobs/scoring.compute.job.js';
import { HEARTBEAT_QUEUE_NAME, HEARTBEAT_RETRY_OPTIONS } from './queues.js';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

export async function registerWorkerSchedules(boss: Pick<PgBoss, 'schedule'>): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const previousDayIso = new Date(now.getTime() - ONE_DAY_IN_MS).toISOString();

  await boss.schedule(
    HEARTBEAT_QUEUE_NAME,
    '*/1 * * * *',
    { source: 'scheduler' } satisfies HeartbeatJobPayload,
    {
      singletonKey: 'system.heartbeat',
      ...HEARTBEAT_RETRY_OPTIONS,
    },
  );

  await boss.schedule(
    DISCOVERY_SEED_JOB_NAME,
    '0 4 * * 1',
    {
      reason: 'scheduled',
      correlationId: 'scheduler:discovery.seed',
    } satisfies DiscoverySeedJobPayload,
    {
      singletonKey: 'schedule:discovery.seed',
      ...DISCOVERY_SEED_RETRY_OPTIONS,
    },
  );

  await boss.schedule(
    LABELS_GENERATE_JOB_NAME,
    '0 * * * *',
    {
      runId: 'scheduled:labels.generate',
      from: previousDayIso,
      to: nowIso,
      correlationId: 'scheduler:labels.generate',
    } satisfies LabelsGenerateJobPayload,
    {
      singletonKey: 'schedule:labels.generate',
      ...LABELS_GENERATE_RETRY_OPTIONS,
    },
  );

  await boss.schedule(
    MODEL_TRAIN_JOB_NAME,
    '0 3 * * 1',
    {
      runId: 'scheduled:model.train',
      trainingRunId: 'scheduled:model.train',
      trigger: 'SCHEDULED',
      windowDays: 90,
      minSamples: 100,
      activateIfPass: true,
      correlationId: 'scheduler:model.train',
    } satisfies ModelTrainJobPayload,
    {
      singletonKey: 'schedule:model.train',
      ...MODEL_TRAIN_RETRY_OPTIONS,
    },
  );

  await boss.schedule(
    SCORING_COMPUTE_JOB_NAME,
    '15 2 * * *',
    {
      runId: 'scheduled:scoring.compute',
      mode: 'ALL_ACTIVE_ICPS',
      correlationId: 'scheduler:scoring.compute',
    } satisfies ScoringComputeJobPayload,
    {
      singletonKey: 'schedule:scoring.compute',
      ...SCORING_COMPUTE_RETRY_OPTIONS,
    },
  );

  await boss.schedule(
    ANALYTICS_ROLLUP_JOB_NAME,
    '0 1 * * *',
    {
      runId: 'scheduled:analytics.rollup',
      day: nowIso.slice(0, 10),
      fullRecompute: false,
      correlationId: 'scheduler:analytics.rollup',
    } satisfies AnalyticsRollupJobPayload,
    {
      singletonKey: 'schedule:analytics.rollup',
      ...ANALYTICS_ROLLUP_RETRY_OPTIONS,
    },
  );
}
