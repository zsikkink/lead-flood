import { createHash } from 'node:crypto';

import type {
  DiscoveryCountryCode,
  DiscoveryLanguageCode,
  SearchRefreshBucket,
  SearchTaskType,
} from '../providers/types.js';

function getIsoWeekParts(input: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);

  return {
    year: date.getUTCFullYear(),
    week,
  };
}

export function computeTimeBucket(now: Date, refreshBucket: SearchRefreshBucket): string {
  if (refreshBucket === 'daily') {
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${now.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const { year, week } = getIsoWeekParts(now);
  return `${year}-W${`${week}`.padStart(2, '0')}`;
}

export function computeQueryHash(
  taskType: SearchTaskType,
  country: DiscoveryCountryCode,
  language: DiscoveryLanguageCode,
  normalizedKey: string,
  page: number,
  bucket: string,
): string {
  const payload = [taskType, country, language, normalizedKey, `${page}`, bucket].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
