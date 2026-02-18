import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const optionalNonEmptyString = () =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  }, z.string().min(1).optional());

const optionalUrlString = () =>
  z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  }, z.string().url().optional());

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('local'),
  DATABASE_URL: z.string().min(1),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APOLLO_ENABLED: envBoolean.default(false),
  APOLLO_API_KEY: optionalNonEmptyString(),
  APOLLO_BASE_URL: z.string().url().default('https://api.apollo.io'),
  APOLLO_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  BRAVE_SEARCH_ENABLED: envBoolean.default(false),
  BRAVE_SEARCH_API_KEY: optionalNonEmptyString(),
  BRAVE_SEARCH_BASE_URL: z.string().url().default('https://api.search.brave.com/res/v1/web/search'),
  BRAVE_SEARCH_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  GOOGLE_PLACES_ENABLED: envBoolean.default(false),
  GOOGLE_PLACES_API_KEY: optionalNonEmptyString(),
  GOOGLE_PLACES_BASE_URL: z.string().url().default('https://places.googleapis.com/v1/places:searchText'),
  GOOGLE_PLACES_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  GOOGLE_SEARCH_ENABLED: envBoolean.default(true),
  GOOGLE_SEARCH_API_KEY: optionalNonEmptyString(),
  GOOGLE_SEARCH_ENGINE_ID: optionalNonEmptyString(),
  GOOGLE_SEARCH_BASE_URL: z.string().url().default('https://www.googleapis.com/customsearch/v1'),
  GOOGLE_SEARCH_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  LINKEDIN_SCRAPE_ENABLED: envBoolean.default(false),
  LINKEDIN_SCRAPE_ENDPOINT: optionalUrlString(),
  LINKEDIN_SCRAPE_API_KEY: optionalNonEmptyString(),
  COMPANY_SEARCH_ENABLED: envBoolean.default(true),
  COMPANY_SEARCH_BASE_URL: z.string().url().default('https://autocomplete.clearbit.com/v1/companies/suggest'),
  PDL_ENABLED: envBoolean.default(false),
  PDL_API_KEY: optionalNonEmptyString(),
  PDL_BASE_URL: z.string().url().default('https://api.peopledatalabs.com'),
  PDL_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  HUNTER_ENABLED: envBoolean.default(true),
  HUNTER_API_KEY: optionalNonEmptyString(),
  HUNTER_BASE_URL: z.string().url().default('https://api.hunter.io/v2'),
  HUNTER_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(250),
  CLEARBIT_ENABLED: envBoolean.default(false),
  CLEARBIT_API_KEY: optionalNonEmptyString(),
  CLEARBIT_PERSON_BASE_URL: z.string().url().default('https://person.clearbit.com/v2/people/find'),
  CLEARBIT_COMPANY_BASE_URL: z
    .string()
    .url()
    .default('https://company.clearbit.com/v2/companies/find'),
  OTHER_FREE_ENRICHMENT_ENABLED: envBoolean.default(true),
  PUBLIC_LOOKUP_BASE_URL: z.string().url().default('https://autocomplete.clearbit.com/v1/companies/suggest'),
  DISCOVERY_DEFAULT_PROVIDER: z
    .enum([
      'BRAVE_SEARCH',
      'GOOGLE_PLACES',
      'GOOGLE_SEARCH',
      'LINKEDIN_SCRAPE',
      'COMPANY_SEARCH_FREE',
      'APOLLO',
    ])
    .default('GOOGLE_SEARCH'),
  DISCOVERY_PROVIDER_ORDER: z.string().optional(),
  ENRICHMENT_DEFAULT_PROVIDER: z
    .enum(['HUNTER', 'CLEARBIT', 'OTHER_FREE', 'PEOPLE_DATA_LABS'])
    .default('HUNTER'),
  DISCOVERY_ENABLED: envBoolean.default(true),
  ENRICHMENT_ENABLED: envBoolean.default(true),
  SERPAPI_API_KEY: z.string().min(1).optional(),
  DISCOVERY_COUNTRIES: z.string().default('JO,SA,AE,EG'),
  DISCOVERY_LANGUAGES: z.string().default('en,ar'),
  DISCOVERY_MAX_PAGES_PER_QUERY: z.coerce.number().int().min(1).default(3),
  DISCOVERY_REFRESH_BUCKET: z.enum(['daily', 'weekly']).default('weekly'),
  DISCOVERY_RPS: z.coerce.number().int().min(1).default(1),
  DISCOVERY_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  DISCOVERY_ENABLE_CACHE: envBoolean.default(true),
  DISCOVERY_MAPS_ZOOM: z.string().optional(),
  DISCOVERY_MAX_TASK_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  DISCOVERY_BACKOFF_BASE_SECONDS: z.coerce.number().int().min(1).default(30),
  DISCOVERY_RUN_MAX_TASKS: z.coerce.number().int().min(1).optional(),
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
