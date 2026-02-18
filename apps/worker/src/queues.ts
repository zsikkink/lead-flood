import type PgBoss from 'pg-boss';
import type { SendOptions } from 'pg-boss';

import {
  ANALYTICS_ROLLUP_JOB_NAME,
  ANALYTICS_ROLLUP_RETRY_OPTIONS,
} from './jobs/analytics.rollup.job.js';
import { DISCOVERY_RUN_JOB_NAME, DISCOVERY_RUN_RETRY_OPTIONS } from './jobs/discovery.run.job.js';
import { ENRICHMENT_RUN_JOB_NAME, ENRICHMENT_RUN_RETRY_OPTIONS } from './jobs/enrichment.run.job.js';
import { FOLLOWUP_CHECK_JOB_NAME, FOLLOWUP_CHECK_RETRY_OPTIONS } from './jobs/followup.check.job.js';
import {
  FEATURES_COMPUTE_JOB_NAME,
  FEATURES_COMPUTE_RETRY_OPTIONS,
} from './jobs/features.compute.job.js';
import { LABELS_GENERATE_JOB_NAME, LABELS_GENERATE_RETRY_OPTIONS } from './jobs/labels.generate.job.js';
import { MESSAGE_GENERATE_JOB_NAME, MESSAGE_GENERATE_RETRY_OPTIONS } from './jobs/message.generate.job.js';
import { MESSAGE_SEND_JOB_NAME, MESSAGE_SEND_RETRY_OPTIONS } from './jobs/message.send.job.js';
import { NOTIFY_SALES_JOB_NAME, NOTIFY_SALES_RETRY_OPTIONS } from './jobs/notify.sales.job.js';
import { MODEL_EVALUATE_JOB_NAME, MODEL_EVALUATE_RETRY_OPTIONS } from './jobs/model.evaluate.job.js';
import { MODEL_TRAIN_JOB_NAME, MODEL_TRAIN_RETRY_OPTIONS } from './jobs/model.train.job.js';
import { REPLY_CLASSIFY_JOB_NAME, REPLY_CLASSIFY_RETRY_OPTIONS } from './jobs/reply.classify.job.js';
import {
  SCORING_COMPUTE_JOB_NAME,
  SCORING_COMPUTE_RETRY_OPTIONS,
} from './jobs/scoring.compute.job.js';

export const HEARTBEAT_QUEUE_NAME = 'system.heartbeat';
export const LEAD_ENRICH_STUB_QUEUE_NAME = 'lead.enrich.stub';

export const HEARTBEAT_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 5,
  retryBackoff: false,
  deadLetter: 'system.heartbeat.dead_letter',
};

export const LEAD_ENRICH_STUB_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 5,
  retryBackoff: true,
  deadLetter: 'lead.enrich.stub.dead_letter',
};

interface QueueRetryOptions {
  retryLimit: number;
  retryDelay: number;
  retryBackoff: boolean;
  deadLetter: string;
}

interface WorkerQueueDefinition {
  name: string;
  retryOptions: QueueRetryOptions;
}

function normalizeRetryOptions(
  queueName: string,
  retryOptions: Pick<SendOptions, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'>,
): QueueRetryOptions {
  const { retryLimit, retryDelay, retryBackoff, deadLetter } = retryOptions;

  if (
    retryLimit === undefined ||
    retryDelay === undefined ||
    retryBackoff === undefined ||
    deadLetter === undefined
  ) {
    throw new Error(`Invalid retry options for queue '${queueName}'`);
  }

  return {
    retryLimit,
    retryDelay,
    retryBackoff,
    deadLetter,
  };
}

export const WORKER_QUEUE_DEFINITIONS: readonly WorkerQueueDefinition[] = [
  {
    name: HEARTBEAT_QUEUE_NAME,
    retryOptions: normalizeRetryOptions(HEARTBEAT_QUEUE_NAME, HEARTBEAT_RETRY_OPTIONS),
  },
  {
    name: LEAD_ENRICH_STUB_QUEUE_NAME,
    retryOptions: normalizeRetryOptions(LEAD_ENRICH_STUB_QUEUE_NAME, LEAD_ENRICH_STUB_RETRY_OPTIONS),
  },
  {
    name: DISCOVERY_RUN_JOB_NAME,
    retryOptions: normalizeRetryOptions(DISCOVERY_RUN_JOB_NAME, DISCOVERY_RUN_RETRY_OPTIONS),
  },
  {
    name: ENRICHMENT_RUN_JOB_NAME,
    retryOptions: normalizeRetryOptions(ENRICHMENT_RUN_JOB_NAME, ENRICHMENT_RUN_RETRY_OPTIONS),
  },
  {
    name: FEATURES_COMPUTE_JOB_NAME,
    retryOptions: normalizeRetryOptions(FEATURES_COMPUTE_JOB_NAME, FEATURES_COMPUTE_RETRY_OPTIONS),
  },
  {
    name: LABELS_GENERATE_JOB_NAME,
    retryOptions: normalizeRetryOptions(LABELS_GENERATE_JOB_NAME, LABELS_GENERATE_RETRY_OPTIONS),
  },
  {
    name: SCORING_COMPUTE_JOB_NAME,
    retryOptions: normalizeRetryOptions(SCORING_COMPUTE_JOB_NAME, SCORING_COMPUTE_RETRY_OPTIONS),
  },
  {
    name: MODEL_TRAIN_JOB_NAME,
    retryOptions: normalizeRetryOptions(MODEL_TRAIN_JOB_NAME, MODEL_TRAIN_RETRY_OPTIONS),
  },
  {
    name: MODEL_EVALUATE_JOB_NAME,
    retryOptions: normalizeRetryOptions(MODEL_EVALUATE_JOB_NAME, MODEL_EVALUATE_RETRY_OPTIONS),
  },
  {
    name: MESSAGE_GENERATE_JOB_NAME,
    retryOptions: normalizeRetryOptions(MESSAGE_GENERATE_JOB_NAME, MESSAGE_GENERATE_RETRY_OPTIONS),
  },
  {
    name: MESSAGE_SEND_JOB_NAME,
    retryOptions: normalizeRetryOptions(MESSAGE_SEND_JOB_NAME, MESSAGE_SEND_RETRY_OPTIONS),
  },
  {
    name: ANALYTICS_ROLLUP_JOB_NAME,
    retryOptions: normalizeRetryOptions(ANALYTICS_ROLLUP_JOB_NAME, ANALYTICS_ROLLUP_RETRY_OPTIONS),
  },
  {
    name: FOLLOWUP_CHECK_JOB_NAME,
    retryOptions: normalizeRetryOptions(FOLLOWUP_CHECK_JOB_NAME, FOLLOWUP_CHECK_RETRY_OPTIONS),
  },
  {
    name: REPLY_CLASSIFY_JOB_NAME,
    retryOptions: normalizeRetryOptions(REPLY_CLASSIFY_JOB_NAME, REPLY_CLASSIFY_RETRY_OPTIONS),
  },
  {
    name: NOTIFY_SALES_JOB_NAME,
    retryOptions: normalizeRetryOptions(NOTIFY_SALES_JOB_NAME, NOTIFY_SALES_RETRY_OPTIONS),
  },
] as const;

function toQueueOptions(definition: WorkerQueueDefinition): PgBoss.Queue {
  return {
    name: definition.name,
    retryLimit: definition.retryOptions.retryLimit,
    retryDelay: definition.retryOptions.retryDelay,
    retryBackoff: definition.retryOptions.retryBackoff,
    deadLetter: definition.retryOptions.deadLetter,
  };
}

export async function ensureWorkerQueues(boss: Pick<PgBoss, 'createQueue'>): Promise<void> {
  const deadLetterQueues = new Set<string>();

  for (const definition of WORKER_QUEUE_DEFINITIONS) {
    if (definition.retryOptions.deadLetter) {
      deadLetterQueues.add(definition.retryOptions.deadLetter);
    }
  }

  for (const deadLetterQueueName of deadLetterQueues) {
    await boss.createQueue(deadLetterQueueName, { name: deadLetterQueueName });
  }

  for (const definition of WORKER_QUEUE_DEFINITIONS) {
    await boss.createQueue(definition.name, toQueueOptions(definition));
  }
}
