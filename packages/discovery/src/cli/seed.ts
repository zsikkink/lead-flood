import { loadDiscoverySeedConfig } from '../config.js';
import { seedSearchTasks } from '../seed_tasks.js';

async function main(): Promise<void> {
  const config = loadDiscoverySeedConfig(process.env);
  const result = await seedSearchTasks(config);

  console.log(
    JSON.stringify(
      {
        event: 'discovery.seed.completed',
        generated: result.generated,
        inserted: result.inserted,
        countries: config.countries,
        languages: config.languages,
        maxPagesPerQuery: config.maxPagesPerQuery,
        refreshBucket: config.refreshBucket,
        seedProfile: config.seedProfile,
        maxTasks: config.maxTasks,
        taskTypes: config.taskTypes,
        seedBucket: config.seedBucket,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seed failure';
  console.error(
    JSON.stringify({
      event: 'discovery.seed.failed',
      error: message,
    }),
  );
  process.exit(1);
});
