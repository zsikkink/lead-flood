import { prisma } from '@lead-flood/db';

import type { DiscoverySeedConfig } from './config.js';
import { generateTasks } from './queries/generate_tasks.js';

export interface SeedTasksResult {
  generated: number;
  inserted: number;
}

export async function seedSearchTasks(
  config: Pick<
    DiscoverySeedConfig,
    | 'countries'
    | 'languages'
    | 'maxPagesPerQuery'
    | 'refreshBucket'
    | 'seedProfile'
    | 'maxTasks'
    | 'taskTypes'
    | 'seedBucket'
  >,
  now: Date = new Date(),
): Promise<SeedTasksResult> {
  const generatedTasks = generateTasks(config, { now });
  if (config.seedProfile === 'small' && generatedTasks.length > config.maxTasks) {
    throw new Error(
      `Discovery seed generated ${generatedTasks.length} tasks, which exceeds DISCOVERY_SEED_MAX_TASKS=${config.maxTasks}. Reduce seed scope or increase the cap.`,
    );
  }

  let inserted = 0;

  for (const task of generatedTasks) {
    const result = await prisma.$executeRaw`
      INSERT INTO "search_tasks" (
        "id",
        "task_type",
        "country_code",
        "city",
        "language",
        "query_text",
        "normalized_query_key",
        "query_hash",
        "params_json",
        "page",
        "time_bucket",
        "status",
        "attempts",
        "run_after",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${task.id},
        ${task.taskType}::"SearchTaskType",
        ${task.countryCode},
        ${task.city},
        ${task.language},
        ${task.queryText},
        ${task.normalizedQueryKey},
        ${task.queryHash},
        ${JSON.stringify(task.paramsJson)}::jsonb,
        ${task.page},
        ${task.timeBucket},
        'PENDING'::"SearchTaskStatus",
        0,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT ("task_type", "query_hash") DO NOTHING
    `;

    inserted += Number(result);
  }

  return {
    generated: generatedTasks.length,
    inserted,
  };
}
