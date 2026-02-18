import { randomUUID } from 'node:crypto';

import type { DiscoverySeedConfig } from '../config.js';
import { normalizeCity, normalizeQuery } from '../dedupe/normalize.js';
import { computeQueryHash, computeTimeBucket } from '../dedupe/task_key.js';
import type {
  DiscoveryCountryCode,
  DiscoveryLanguageCode,
  SearchTaskType,
} from '../providers/types.js';
import {
  getCategoryTaxonomy,
  getInitialCitiesByCountry,
  getQueryTemplates,
} from './seeds.js';

function toCountrySearchName(countryCode: DiscoveryCountryCode): string {
  switch (countryCode) {
    case 'JO':
      return 'Jordan';
    case 'SA':
      return 'Saudi Arabia';
    case 'AE':
      return 'United Arab Emirates';
    case 'EG':
      return 'Egypt';
    default:
      return countryCode;
  }
}

function renderTemplate(
  template: string,
  params: {
    category: string;
    city: string;
    country: string;
  },
): string {
  return template
    .replaceAll('{category}', params.category)
    .replaceAll('{city}', params.city)
    .replaceAll('{country}', params.country);
}

function buildSerpParams(
  taskType: SearchTaskType,
  queryText: string,
  countryCode: DiscoveryCountryCode,
  language: DiscoveryLanguageCode,
  city: string,
  page: number,
): Record<string, unknown> {
  const start = Math.max(0, (page - 1) * 10);
  const params: Record<string, unknown> = {
    q: queryText,
    gl: countryCode.toLowerCase(),
    hl: language,
    location: `${city}, ${toCountrySearchName(countryCode)}`,
    start,
  };

  if (taskType === 'SERP_GOOGLE') {
    return {
      ...params,
      engine: 'google',
    };
  }

  if (taskType === 'SERP_GOOGLE_LOCAL') {
    return {
      ...params,
      engine: 'google_local',
    };
  }

  return {
    ...params,
    engine: 'google_maps',
    type: 'search',
  };
}

export interface GeneratedSearchTask {
  id: string;
  taskType: SearchTaskType;
  countryCode: DiscoveryCountryCode;
  city: string | null;
  language: DiscoveryLanguageCode;
  queryText: string;
  normalizedQueryKey: string;
  queryHash: string;
  paramsJson: Record<string, unknown>;
  page: number;
  timeBucket: string;
}

export interface GenerateTasksOptions {
  now?: Date;
}

function buildTimeBucket(
  now: Date,
  refreshBucket: DiscoverySeedConfig['refreshBucket'],
  seedBucket: string | null,
): string {
  const baseBucket = computeTimeBucket(now, refreshBucket);
  if (!seedBucket) {
    return baseBucket;
  }
  return `${baseBucket}:${seedBucket}`;
}

function createGeneratedTask(
  taskType: SearchTaskType,
  countryCode: DiscoveryCountryCode,
  language: DiscoveryLanguageCode,
  cityRaw: string,
  queryText: string,
  page: number,
  timeBucket: string,
): GeneratedSearchTask {
  const city = normalizeCity(cityRaw);
  const normalizedQuery = normalizeQuery(queryText);
  const normalizedQueryKey = normalizeQuery(
    `${normalizedQuery}|${countryCode}|${language}|${city ?? ''}`,
  );
  const queryHash = computeQueryHash(
    taskType,
    countryCode,
    language,
    normalizedQueryKey,
    page,
    timeBucket,
  );

  return {
    id: randomUUID(),
    taskType,
    countryCode,
    city: cityRaw,
    language,
    queryText,
    normalizedQueryKey,
    queryHash,
    paramsJson: buildSerpParams(
      taskType,
      queryText,
      countryCode,
      language,
      cityRaw,
      page,
    ),
    page,
    timeBucket,
  };
}

function generateDefaultTasks(
  config: Pick<
    DiscoverySeedConfig,
    'countries' | 'languages' | 'maxPagesPerQuery' | 'taskTypes'
  >,
  timeBucket: string,
): GeneratedSearchTask[] {
  const tasks: GeneratedSearchTask[] = [];

  for (const countryCode of config.countries) {
    const countryName = toCountrySearchName(countryCode);
    const cities = getInitialCitiesByCountry('default')[countryCode] ?? [];

    for (const language of config.languages) {
      const categories = getCategoryTaxonomy(language, 'default');
      const templates = getQueryTemplates(language, 'default');

      for (const cityRaw of cities) {
        const city = normalizeCity(cityRaw);
        if (!city) {
          continue;
        }

        for (const category of categories) {
          for (const template of templates) {
            const queryText = renderTemplate(template, {
              category,
              city: cityRaw,
              country: countryName,
            });
            for (let page = 1; page <= config.maxPagesPerQuery; page += 1) {
              for (const taskType of config.taskTypes) {
                tasks.push(
                  createGeneratedTask(
                    taskType,
                    countryCode,
                    language,
                    cityRaw,
                    queryText,
                    page,
                    timeBucket,
                  ),
                );
              }
            }
          }
        }
      }
    }
  }

  return tasks;
}

function generateSmallTasks(
  config: Pick<
    DiscoverySeedConfig,
    'countries' | 'languages' | 'maxPagesPerQuery' | 'taskTypes'
  >,
  timeBucket: string,
): GeneratedSearchTask[] {
  const tasks: GeneratedSearchTask[] = [];
  const categoryCursorByLanguage: Record<DiscoveryLanguageCode, number> = {
    en: 0,
    ar: 0,
  };

  for (const countryCode of config.countries) {
    const countryName = toCountrySearchName(countryCode);
    const cities = getInitialCitiesByCountry('small')[countryCode] ?? [];

    for (const cityRaw of cities) {
      for (const language of config.languages) {
        const categories = getCategoryTaxonomy(language, 'small');
        const template = getQueryTemplates(language, 'small')[0];
        if (!template || categories.length === 0) {
          continue;
        }

        for (let page = 1; page <= config.maxPagesPerQuery; page += 1) {
          for (const taskType of config.taskTypes) {
            const category = categories[categoryCursorByLanguage[language] % categories.length];
            categoryCursorByLanguage[language] += 1;

            if (!category) {
              continue;
            }

            const queryText = renderTemplate(template, {
              category,
              city: cityRaw,
              country: countryName,
            });

            tasks.push(
              createGeneratedTask(taskType, countryCode, language, cityRaw, queryText, page, timeBucket),
            );
          }
        }
      }
    }
  }

  return tasks;
}

export function generateTasks(
  config: Pick<
    DiscoverySeedConfig,
    | 'countries'
    | 'languages'
    | 'maxPagesPerQuery'
    | 'refreshBucket'
    | 'seedProfile'
    | 'taskTypes'
    | 'seedBucket'
  >,
  options: GenerateTasksOptions = {},
): GeneratedSearchTask[] {
  const now = options.now ?? new Date();
  const timeBucket = buildTimeBucket(now, config.refreshBucket, config.seedBucket);

  if (config.seedProfile === 'small') {
    return generateSmallTasks(config, timeBucket);
  }

  return generateDefaultTasks(config, timeBucket);
}
