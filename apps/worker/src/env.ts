import { z } from 'zod';

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('local'),
  DATABASE_URL: z.string().min(1),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APOLLO_ENABLED: z.coerce.boolean().default(false),
  APOLLO_API_KEY: z.string().min(1).optional(),
  APOLLO_BASE_URL: z.string().url().default('https://api.apollo.io'),
  APOLLO_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  GOOGLE_SEARCH_ENABLED: z.coerce.boolean().default(true),
  GOOGLE_SEARCH_API_KEY: z.string().min(1).optional(),
  GOOGLE_SEARCH_ENGINE_ID: z.string().min(1).optional(),
  GOOGLE_SEARCH_BASE_URL: z.string().url().default('https://www.googleapis.com/customsearch/v1'),
  GOOGLE_SEARCH_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  LINKEDIN_SCRAPE_ENABLED: z.coerce.boolean().default(false),
  LINKEDIN_SCRAPE_ENDPOINT: z.string().url().optional(),
  LINKEDIN_SCRAPE_API_KEY: z.string().min(1).optional(),
  COMPANY_SEARCH_ENABLED: z.coerce.boolean().default(true),
  COMPANY_SEARCH_BASE_URL: z.string().url().default('https://autocomplete.clearbit.com/v1/companies/suggest'),
  PDL_ENABLED: z.coerce.boolean().default(false),
  PDL_API_KEY: z.string().min(1).optional(),
  PDL_BASE_URL: z.string().url().default('https://api.peopledatalabs.com'),
  PDL_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  HUNTER_ENABLED: z.coerce.boolean().default(true),
  HUNTER_API_KEY: z.string().min(1).optional(),
  HUNTER_BASE_URL: z.string().url().default('https://api.hunter.io/v2'),
  HUNTER_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  CLEARBIT_ENABLED: z.coerce.boolean().default(false),
  CLEARBIT_API_KEY: z.string().min(1).optional(),
  CLEARBIT_PERSON_BASE_URL: z.string().url().default('https://person.clearbit.com/v2/people/find'),
  CLEARBIT_COMPANY_BASE_URL: z
    .string()
    .url()
    .default('https://company.clearbit.com/v2/companies/find'),
  OTHER_FREE_ENRICHMENT_ENABLED: z.coerce.boolean().default(true),
  PUBLIC_LOOKUP_BASE_URL: z.string().url().default('https://autocomplete.clearbit.com/v1/companies/suggest'),
  DISCOVERY_DEFAULT_PROVIDER: z
    .enum(['GOOGLE_SEARCH', 'LINKEDIN_SCRAPE', 'COMPANY_SEARCH_FREE', 'APOLLO'])
    .default('GOOGLE_SEARCH'),
  ENRICHMENT_DEFAULT_PROVIDER: z
    .enum(['HUNTER', 'CLEARBIT', 'OTHER_FREE', 'PEOPLE_DATA_LABS'])
    .default('HUNTER'),
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
