import type { RecomputeRollupRequest } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { Job, SendOptions } from 'pg-boss';

export const ANALYTICS_ROLLUP_JOB_NAME = 'analytics.rollup';
export const ANALYTICS_ROLLUP_IDEMPOTENCY_KEY_PATTERN = 'analytics.rollup:${day}:${icpProfileId || "all"}';

export const ANALYTICS_ROLLUP_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 300,
  retryBackoff: true,
  deadLetter: 'analytics.rollup.dead_letter',
};

export interface AnalyticsRollupJobPayload
  extends Pick<RecomputeRollupRequest, 'day' | 'icpProfileId' | 'fullRecompute' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
}

export interface AnalyticsRollupLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

function parseDayRange(day: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return { dayStart, dayEnd };
}

function isValidEmail(value: string): boolean {
  const [local, domain] = value.split('@');
  return Boolean(local && domain && domain.includes('.'));
}

function extractDomain(email: string): string | null {
  const [, domain] = email.split('@');
  if (!domain || !domain.includes('.')) {
    return null;
  }
  return domain.toLowerCase();
}

function toBooleanFeature(featuresJson: unknown, key: string): boolean {
  if (!featuresJson || typeof featuresJson !== 'object') {
    return false;
  }
  const value = (featuresJson as Record<string, unknown>)[key];
  return value === true;
}

export async function handleAnalyticsRollupJob(
  logger: AnalyticsRollupLogger,
  job: Job<AnalyticsRollupJobPayload>,
): Promise<void> {
  const { runId, correlationId, day, icpProfileId, fullRecompute } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      day,
      icpProfileId,
      fullRecompute,
    },
    'Started analytics.rollup job',
  );

  try {
    const { dayStart, dayEnd } = parseDayRange(day);
    const targetIcpIds = icpProfileId
      ? [icpProfileId]
      : (
          await prisma.icpProfile.findMany({
            where: { isActive: true },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        ).map((row) => row.id);

    if (targetIcpIds.length === 0) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: correlationId ?? job.id,
          day,
        },
        'Skipping analytics.rollup job because no ICP profiles were resolved',
      );
      return;
    }

    for (const targetIcpId of targetIcpIds) {
      const discoveryRows = await prisma.leadDiscoveryRecord.findMany({
        where: {
          icpProfileId: targetIcpId,
          discoveredAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        select: {
          leadId: true,
          lead: {
            select: {
              email: true,
            },
          },
        },
      });

      const discoveredCount = discoveryRows.length;
      const uniqueLeadIds = Array.from(new Set(discoveryRows.map((row) => row.leadId)));

      let validEmailCount = 0;
      const validDomains = new Set<string>();
      for (const row of discoveryRows) {
        if (isValidEmail(row.lead.email)) {
          validEmailCount += 1;
        }
        const domainFromEmail = extractDomain(row.lead.email);
        if (domainFromEmail) {
          validDomains.add(domainFromEmail);
        }
      }

      const enrichedCount =
        uniqueLeadIds.length === 0
          ? 0
          : await prisma.leadEnrichmentRecord.count({
              where: {
                leadId: {
                  in: uniqueLeadIds,
                },
                status: 'COMPLETED',
                OR: [
                  {
                    enrichedAt: {
                      gte: dayStart,
                      lt: dayEnd,
                    },
                  },
                  {
                    createdAt: {
                      gte: dayStart,
                      lt: dayEnd,
                    },
                  },
                ],
              },
            });

      const scoredCount = await prisma.leadScorePrediction.count({
        where: {
          icpProfileId: targetIcpId,
          predictedAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
      });

      const snapshots = await prisma.leadFeatureSnapshot.findMany({
        where: {
          icpProfileId: targetIcpId,
          computedAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        select: {
          featuresJson: true,
        },
      });

      const snapshotCount = snapshots.length;
      const industryMatchCount = snapshots.filter((row) =>
        toBooleanFeature(row.featuresJson, 'industry_match'),
      ).length;
      const geoMatchCount = snapshots.filter((row) =>
        toBooleanFeature(row.featuresJson, 'geo_match'),
      ).length;

      const industryMatchRate =
        snapshotCount > 0 ? Number((industryMatchCount / snapshotCount).toFixed(6)) : 0;
      const geoMatchRate =
        snapshotCount > 0 ? Number((geoMatchCount / snapshotCount).toFixed(6)) : 0;

      await prisma.analyticsDailyRollup.upsert({
        where: {
          day_icpProfileId: {
            day: dayStart,
            icpProfileId: targetIcpId,
          },
        },
        create: {
          day: dayStart,
          icpProfileId: targetIcpId,
          discoveredCount,
          enrichedCount,
          scoredCount,
          validEmailCount,
          validDomainCount: validDomains.size,
          industryMatchRate,
          geoMatchRate,
        },
        update: {
          discoveredCount,
          enrichedCount,
          scoredCount,
          validEmailCount,
          validDomainCount: validDomains.size,
          industryMatchRate,
          geoMatchRate,
        },
      });
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        day,
      },
      'Completed analytics.rollup job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        day,
        error,
      },
      'Failed analytics.rollup job',
    );

    throw error;
  }
}
