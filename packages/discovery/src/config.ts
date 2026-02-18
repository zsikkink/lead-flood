import type {
  DiscoveryCountryCode,
  DiscoveryLanguageCode,
  SearchTaskType,
  SearchRefreshBucket,
} from './providers/types.js';

const COUNTRY_SET = new Set<DiscoveryCountryCode>(['JO', 'SA', 'AE', 'EG']);
const LANGUAGE_SET = new Set<DiscoveryLanguageCode>(['en', 'ar']);
const DEFAULT_DISCOVERY_MAPS_ZOOM = 13;
const TASK_TYPE_SET = new Set<SearchTaskType>([
  'SERP_GOOGLE',
  'SERP_GOOGLE_LOCAL',
  'SERP_MAPS_LOCAL',
]);

function parseCsv(source: string | undefined): string[] {
  if (!source) {
    return [];
  }

  return source
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeCountryCode(value: string): DiscoveryCountryCode | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'KSA' || normalized === 'SAUDI ARABIA') {
    return 'SA';
  }
  if (normalized === 'UAE' || normalized === 'UNITED ARAB EMIRATES') {
    return 'AE';
  }
  if (COUNTRY_SET.has(normalized as DiscoveryCountryCode)) {
    return normalized as DiscoveryCountryCode;
  }
  return null;
}

function normalizeLanguage(value: string): DiscoveryLanguageCode | null {
  const normalized = value.trim().toLowerCase();
  if (LANGUAGE_SET.has(normalized as DiscoveryLanguageCode)) {
    return normalized as DiscoveryLanguageCode;
  }
  return null;
}

function normalizeTaskType(value: string): SearchTaskType | null {
  const normalized = value.trim().toUpperCase();
  if (TASK_TYPE_SET.has(normalized as SearchTaskType)) {
    return normalized as SearchTaskType;
  }
  return null;
}

export type DiscoverySeedProfile = 'default' | 'small';

export interface DiscoverySeedConfig {
  countries: DiscoveryCountryCode[];
  languages: DiscoveryLanguageCode[];
  maxPagesPerQuery: number;
  refreshBucket: SearchRefreshBucket;
  seedProfile: DiscoverySeedProfile;
  maxTasks: number;
  taskTypes: SearchTaskType[];
  seedBucket: string | null;
}

export interface DiscoveryRuntimeConfig extends DiscoverySeedConfig {
  serpApiKey: string;
  rps: number;
  concurrency: number;
  enableCache: boolean;
  maxTaskAttempts: number;
  backoffBaseSeconds: number;
  mapsZoom: number;
  mapsZoomWarning: string | null;
}

function loadBaseSeedConfig(source: NodeJS.ProcessEnv): DiscoverySeedConfig {
  const countries = parseCsv(source.DISCOVERY_COUNTRIES)
    .map((value) => normalizeCountryCode(value))
    .filter((value): value is DiscoveryCountryCode => value !== null);
  const normalizedCountries = countries.length > 0 ? countries : ['JO', 'SA', 'AE', 'EG'];

  const languages = parseCsv(source.DISCOVERY_LANGUAGES)
    .map((value) => normalizeLanguage(value))
    .filter((value): value is DiscoveryLanguageCode => value !== null);
  const normalizedLanguages = languages.length > 0 ? languages : ['en', 'ar'];

  const refreshBucketRaw = source.DISCOVERY_REFRESH_BUCKET?.trim().toLowerCase();
  const refreshBucket: SearchRefreshBucket =
    refreshBucketRaw === 'daily' || refreshBucketRaw === 'weekly'
      ? refreshBucketRaw
      : 'weekly';

  const seedProfileRaw = source.DISCOVERY_SEED_PROFILE?.trim().toLowerCase();
  const seedProfile: DiscoverySeedProfile = seedProfileRaw === 'small' ? 'small' : 'default';

  const seedCountries = parseCsv(source.DISCOVERY_SEED_COUNTRIES)
    .map((value) => normalizeCountryCode(value))
    .filter((value): value is DiscoveryCountryCode => value !== null);
  const normalizedSeedCountries = seedCountries.length > 0 ? seedCountries : ['AE', 'SA', 'JO', 'EG'];

  const seedLanguages = parseCsv(source.DISCOVERY_SEED_LANGUAGES)
    .map((value) => normalizeLanguage(value))
    .filter((value): value is DiscoveryLanguageCode => value !== null);
  const normalizedSeedLanguages = seedLanguages.length > 0 ? seedLanguages : ['en', 'ar'];

  const seedTaskTypes = parseCsv(source.DISCOVERY_SEED_TASK_TYPES)
    .map((value) => normalizeTaskType(value))
    .filter((value): value is SearchTaskType => value !== null);
  const normalizedSeedTaskTypes: SearchTaskType[] =
    seedTaskTypes.length > 0 ? seedTaskTypes : ['SERP_MAPS_LOCAL', 'SERP_GOOGLE_LOCAL'];

  const maxPagesPerQuery =
    seedProfile === 'small'
      ? parsePositiveInt(source.DISCOVERY_SEED_MAX_PAGES, 1)
      : parsePositiveInt(source.DISCOVERY_MAX_PAGES_PER_QUERY, 3);

  const taskTypes: SearchTaskType[] =
    seedProfile === 'small'
      ? normalizedSeedTaskTypes
      : (['SERP_GOOGLE', 'SERP_GOOGLE_LOCAL', 'SERP_MAPS_LOCAL'] satisfies SearchTaskType[]);

  const seedBucket = source.DISCOVERY_SEED_BUCKET?.trim() || null;

  return {
    countries: Array.from(
      new Set(seedProfile === 'small' ? normalizedSeedCountries : normalizedCountries),
    ) as DiscoveryCountryCode[],
    languages: Array.from(
      new Set(seedProfile === 'small' ? normalizedSeedLanguages : normalizedLanguages),
    ) as DiscoveryLanguageCode[],
    maxPagesPerQuery,
    refreshBucket,
    seedProfile,
    maxTasks: parsePositiveInt(source.DISCOVERY_SEED_MAX_TASKS, 40),
    taskTypes: Array.from(new Set<SearchTaskType>(taskTypes)),
    seedBucket,
  };
}

export function loadDiscoverySeedConfig(source: NodeJS.ProcessEnv): DiscoverySeedConfig {
  return loadBaseSeedConfig(source);
}

export function loadDiscoveryRuntimeConfig(source: NodeJS.ProcessEnv): DiscoveryRuntimeConfig {
  const serpApiKey = source.SERPAPI_API_KEY?.trim() ?? '';
  if (!serpApiKey) {
    throw new Error('SERPAPI_API_KEY is required');
  }

  const baseConfig = loadBaseSeedConfig(source);
  const mapsZoomRaw = source.DISCOVERY_MAPS_ZOOM?.trim();
  let mapsZoom = DEFAULT_DISCOVERY_MAPS_ZOOM;
  let mapsZoomWarning: string | null = null;

  if (mapsZoomRaw && mapsZoomRaw.length > 0) {
    const parsed = Number.parseInt(mapsZoomRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 3 && parsed <= 20) {
      mapsZoom = parsed;
    } else {
      mapsZoomWarning = `Invalid DISCOVERY_MAPS_ZOOM='${mapsZoomRaw}', using default ${DEFAULT_DISCOVERY_MAPS_ZOOM}`;
    }
  }

  return {
    ...baseConfig,
    serpApiKey,
    rps: parsePositiveInt(source.DISCOVERY_RPS, 1),
    concurrency: parsePositiveInt(source.DISCOVERY_CONCURRENCY, 3),
    enableCache: parseBoolean(source.DISCOVERY_ENABLE_CACHE, true),
    maxTaskAttempts: parsePositiveInt(source.DISCOVERY_MAX_TASK_ATTEMPTS, 5),
    backoffBaseSeconds: parsePositiveInt(source.DISCOVERY_BACKOFF_BASE_SECONDS, 30),
    mapsZoom,
    mapsZoomWarning,
  };
}
