import { z } from 'zod';

const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('local'),
  API_PORT: z.coerce.number().int().positive().default(5050),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  APOLLO_ENABLED: z.coerce.boolean().optional(),
  APOLLO_API_KEY: z.string().min(1).optional(),
  GOOGLE_SEARCH_ENABLED: z.coerce.boolean().optional(),
  GOOGLE_SEARCH_API_KEY: z.string().min(1).optional(),
  GOOGLE_SEARCH_ENGINE_ID: z.string().min(1).optional(),
  LINKEDIN_SCRAPE_ENABLED: z.coerce.boolean().optional(),
  LINKEDIN_SCRAPE_API_KEY: z.string().min(1).optional(),
  LINKEDIN_SCRAPE_ENDPOINT: z.string().url().optional(),
  COMPANY_SEARCH_ENABLED: z.coerce.boolean().optional(),
  PDL_ENABLED: z.coerce.boolean().optional(),
  PDL_API_KEY: z.string().min(1).optional(),
  HUNTER_ENABLED: z.coerce.boolean().optional(),
  HUNTER_API_KEY: z.string().min(1).optional(),
  CLEARBIT_ENABLED: z.coerce.boolean().optional(),
  CLEARBIT_API_KEY: z.string().min(1).optional(),
  OTHER_FREE_ENRICHMENT_ENABLED: z.coerce.boolean().optional(),
  DISCOVERY_ENABLED: z.coerce.boolean().optional(),
  ENRICHMENT_ENABLED: z.coerce.boolean().optional(),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const parsed = ApiEnvSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid API environment configuration:\n${issues.join('\n')}`);
  }

  return parsed.data;
}
