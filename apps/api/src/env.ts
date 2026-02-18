import { z } from 'zod';

const LEGACY_GOOGLE_CSE_ENV_KEYS = [
  'GOOGLE_SEARCH_ENABLED',
  'GOOGLE_SEARCH_API_KEY',
  'GOOGLE_SEARCH_ENGINE_ID',
  'GOOGLE_SEARCH_BASE_URL',
  'GOOGLE_SEARCH_RATE_LIMIT_MS',
  'GOOGLE_CSE_API_KEY',
  'GOOGLE_CSE_ENGINE_ID',
  'GOOGLE_CSE_BASE_URL',
  'GOOGLE_CUSTOM_SEARCH_API_KEY',
  'GOOGLE_CUSTOM_SEARCH_ENGINE_ID',
  'CUSTOMSEARCH_API_KEY',
  'CUSTOMSEARCH_ENGINE_ID',
] as const;

function findLegacyGoogleCseEnvKeys(source: NodeJS.ProcessEnv): string[] {
  const explicitMatches = LEGACY_GOOGLE_CSE_ENV_KEYS.filter((key) => key in source);
  const inferredMatches = Object.keys(source).filter((key) =>
    key.toUpperCase().includes('CUSTOMSEARCH'),
  );
  return Array.from(new Set([...explicitMatches, ...inferredMatches]));
}

const ApiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('local'),
  API_PORT: z.coerce.number().int().positive().default(5050),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  PG_BOSS_SCHEMA: z.string().min(1).default('pgboss'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SUPABASE_PROJECT_REF: z.string().min(1).optional(),
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).optional(),
  APOLLO_ENABLED: z.coerce.boolean().optional(),
  APOLLO_API_KEY: z.string().min(1).optional(),
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
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_GENERATION_MODEL: z.string().min(1).optional(),
  TRENGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  ADMIN_API_KEY: z.string().min(1).optional(),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(source: NodeJS.ProcessEnv): ApiEnv {
  const legacyGoogleCseKeys = findLegacyGoogleCseEnvKeys(source);
  if (legacyGoogleCseKeys.length > 0) {
    throw new Error(
      `Google CSE is deprecated and not supported in this repository. Remove legacy env vars: ${legacyGoogleCseKeys.join(
        ', ',
      )}`,
    );
  }

  const parsed = ApiEnvSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid API environment configuration:\n${issues.join('\n')}`);
  }

  const hasIssuer = !!parsed.data.SUPABASE_JWT_ISSUER;
  const hasProjectRef = !!parsed.data.SUPABASE_PROJECT_REF;
  if (!hasIssuer && !hasProjectRef) {
    throw new Error(
      'Invalid API environment configuration:\nSUPABASE_JWT_ISSUER or SUPABASE_PROJECT_REF is required for Supabase JWT verification',
    );
  }

  return parsed.data;
}
