import { z } from 'zod';

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('local'),
  DATABASE_URL: z.string().min(1),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APOLLO_API_KEY: z.string().min(1),
  APOLLO_BASE_URL: z.string().url().default('https://api.apollo.io'),
  APOLLO_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  PDL_API_KEY: z.string().min(1),
  PDL_BASE_URL: z.string().url().default('https://api.peopledatalabs.com'),
  PDL_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  DISCOVERY_ENABLED: z.coerce.boolean().default(true),
  ENRICHMENT_ENABLED: z.coerce.boolean().default(true),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const parsed = WorkerEnvSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid worker environment configuration:\n${issues.join('\n')}`);
  }

  return parsed.data;
}
