import { seedSearchTasks } from '@lead-flood/discovery';
import type { DiscoveryRuntimeConfig } from '@lead-flood/discovery';
import type {
  DiscoveryCountryCode,
  DiscoveryLanguageCode,
  SearchTaskType,
} from '@lead-flood/discovery';
import { prisma, type Prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
  DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS,
} from './discovery.run_search_task.job.js';

export const DISCOVERY_SEED_JOB_NAME = 'discovery.seed';
export const DISCOVERY_SEED_IDEMPOTENCY_KEY_PATTERN = 'discovery.seed:${timeBucket}';

export const DISCOVERY_SEED_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'discovery.seed.dead_letter',
};

export interface DiscoverySeedJobPayload {
  reason?: string;
  correlationId?: string;
  jobRunId?: string;
  profile?: 'default' | 'small';
  maxTasks?: number;
  maxPages?: number;
  bucket?: string;
  taskTypes?: SearchTaskType[];
  countries?: DiscoveryCountryCode[];
  languages?: DiscoveryLanguageCode[];
  enqueueRunTasks?: boolean;
}

export interface DiscoverySeedLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface DiscoverySeedDependencies {
  boss: Pick<PgBoss, 'send'>;
  config: DiscoveryRuntimeConfig;
}

const ALLOWED_COUNTRIES = new Set<DiscoveryCountryCode>(['JO', 'SA', 'AE', 'EG']);
const ALLOWED_LANGUAGES = new Set<DiscoveryLanguageCode>(['en', 'ar']);
const ALLOWED_TASK_TYPES = new Set<SearchTaskType>([
  'SERP_GOOGLE',
  'SERP_GOOGLE_LOCAL',
  'SERP_MAPS_LOCAL',
]);

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function withSeedOverrides(
  config: DiscoveryRuntimeConfig,
  payload: DiscoverySeedJobPayload,
): Pick<
  DiscoveryRuntimeConfig,
  | 'countries'
  | 'languages'
  | 'maxPagesPerQuery'
  | 'refreshBucket'
  | 'seedProfile'
  | 'maxTasks'
  | 'taskTypes'
  | 'seedBucket'
> {
  const countries =
    payload.countries && payload.countries.length > 0
      ? Array.from(new Set(payload.countries.filter((value) => ALLOWED_COUNTRIES.has(value))))
      : config.countries;
  const languages =
    payload.languages && payload.languages.length > 0
      ? Array.from(new Set(payload.languages.filter((value) => ALLOWED_LANGUAGES.has(value))))
      : config.languages;
  const taskTypes =
    payload.taskTypes && payload.taskTypes.length > 0
      ? Array.from(new Set(payload.taskTypes.filter((value) => ALLOWED_TASK_TYPES.has(value))))
      : config.taskTypes;

  return {
    countries: countries.length > 0 ? countries : config.countries,
    languages: languages.length > 0 ? languages : config.languages,
    taskTypes: taskTypes.length > 0 ? taskTypes : config.taskTypes,
    maxPagesPerQuery:
      payload.maxPages && Number.isFinite(payload.maxPages) && payload.maxPages > 0
        ? payload.maxPages
        : config.maxPagesPerQuery,
    refreshBucket: config.refreshBucket,
    seedProfile: payload.profile ?? config.seedProfile,
    maxTasks:
      payload.maxTasks && Number.isFinite(payload.maxTasks) && payload.maxTasks > 0
        ? payload.maxTasks
        : config.maxTasks,
    seedBucket: payload.bucket ?? config.seedBucket,
  };
}

export async function handleDiscoverySeedJob(
  logger: DiscoverySeedLogger,
  job: Job<DiscoverySeedJobPayload>,
  dependencies: DiscoverySeedDependencies,
): Promise<void> {
  const correlationId = job.data.correlationId ?? job.id;
  const startedAt = Date.now();
  const seedConfig = withSeedOverrides(dependencies.config, job.data);
  const shouldEnqueueRunTasks = job.data.enqueueRunTasks ?? job.data.reason !== 'api';

  try {
    const seedResult = await seedSearchTasks(seedConfig);

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        correlationId,
        generated: seedResult.generated,
        inserted: seedResult.inserted,
        countries: seedConfig.countries,
        languages: seedConfig.languages,
        maxPagesPerQuery: seedConfig.maxPagesPerQuery,
        refreshBucket: seedConfig.refreshBucket,
        seedProfile: seedConfig.seedProfile,
      },
      'Completed discovery frontier seed job',
    );

    if (shouldEnqueueRunTasks) {
      for (let slot = 0; slot < dependencies.config.concurrency; slot += 1) {
        await dependencies.boss.send(
          DISCOVERY_RUN_SEARCH_TASK_JOB_NAME,
          {
            slot,
            reason: 'seed',
            correlationId,
            jobRunId: job.data.jobRunId,
          },
          {
            ...DISCOVERY_RUN_SEARCH_TASK_RETRY_OPTIONS,
          },
        );
      }
    }

    if (job.data.jobRunId) {
      await prisma.jobRun.update({
        where: { id: job.data.jobRunId },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt),
          countersJson: toInputJson({
            generated: seedResult.generated,
            inserted: seedResult.inserted,
          }),
          resourceJson: toInputJson({
            db_writes: {
              search_tasks_inserted: seedResult.inserted,
            },
          }),
        },
      });
    }
  } catch (error: unknown) {
    if (job.data.jobRunId) {
      await prisma.jobRun.update({
        where: { id: job.data.jobRunId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt),
          errorText:
            error instanceof Error ? error.message : 'Failed to execute discovery seed job',
        },
      });
    }
    throw error;
  }
}
