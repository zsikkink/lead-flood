import PgBoss from 'pg-boss';

import { Prisma, prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';

import { buildAuthenticateUser } from './auth/service.js';
import { loadApiEnv } from './env.js';
import type { DiscoveryRunJobPayload } from './modules/discovery/discovery.service.js';
import { buildServer, LeadAlreadyExistsError } from './server.js';

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

async function main(): Promise<void> {
  const env = loadApiEnv(process.env);
  const logger = createLogger({
    service: 'api',
    env: env.APP_ENV,
    level: env.LOG_LEVEL,
  });
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    schema: env.PG_BOSS_SCHEMA,
  });

  await boss.start();
  await boss.createQueue('lead.enrich.stub');
  await boss.createQueue('discovery.run');

  const server = buildServer({
    env,
    logger,
    checkDatabaseHealth: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (error: unknown) {
        logger.error({ error }, 'Database readiness check failed');
        return false;
      }
    },
    authenticateUser: buildAuthenticateUser({
      findUserByEmail: async (email) => {
        return prisma.user.findUnique({
          where: { email },
        });
      },
      createSession: async ({ sessionId, userId, refreshToken, expiresAt }) => {
        await prisma.session.create({
          data: {
            id: sessionId,
            userId,
            refreshToken,
            expiresAt,
          },
        });
      },
      accessTokenSecret: env.JWT_ACCESS_SECRET,
      refreshTokenSecret: env.JWT_REFRESH_SECRET,
    }),
    createLeadAndEnqueue: async (input) => {
      try {
        const { lead, jobExecution, outboxEvent } = await prisma.$transaction(async (tx) => {
          const lead = await tx.lead.create({
            data: {
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email,
              source: input.source,
              status: 'new',
            },
          });

          const jobExecution = await tx.jobExecution.create({
            data: {
              type: 'lead.enrich.stub',
              status: 'queued',
              payload: {
                leadId: lead.id,
                source: input.source,
              },
              leadId: lead.id,
            },
          });

          const outboxEvent = await tx.outboxEvent.create({
            data: {
              type: 'lead.enrich.stub',
              payload: {
                leadId: lead.id,
                jobExecutionId: jobExecution.id,
                source: input.source,
              },
              status: 'pending',
            },
          });

          return {
            lead,
            jobExecution,
            outboxEvent,
          };
        });

        try {
          await boss.send(
            'lead.enrich.stub',
            {
              leadId: lead.id,
              jobExecutionId: jobExecution.id,
              source: input.source,
            },
            {
              singletonKey: `outbox:${outboxEvent.id}`,
              retryLimit: 3,
              retryDelay: 5,
              retryBackoff: true,
            },
          );

          await prisma.outboxEvent.update({
            where: { id: outboxEvent.id },
            data: {
              status: 'sent',
              attempts: {
                increment: 1,
              },
              processedAt: new Date(),
              nextAttemptAt: null,
              lastError: null,
            },
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to enqueue enrichment job';
          logger.error(
            { error, leadId: lead.id, outboxEventId: outboxEvent.id },
            'Immediate queue publish failed; outbox retry will handle dispatch',
          );

          await prisma.outboxEvent.update({
            where: { id: outboxEvent.id },
            data: {
              status: 'failed',
              attempts: {
                increment: 1,
              },
              lastError: errorMessage,
              nextAttemptAt: new Date(Date.now() + 5000),
            },
          });
        }

        return {
          leadId: lead.id,
          jobId: jobExecution.id,
        };
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new LeadAlreadyExistsError('Lead already exists for this email');
        }

        throw error;
      }
    },
    enqueueDiscoveryRun: async (payload: DiscoveryRunJobPayload) => {
      await boss.send('discovery.run', payload, {
        singletonKey: `discovery.run:${payload.runId}`,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      });
    },
    getLeadById: async (leadId) => {
      return prisma.lead.findUnique({
        where: { id: leadId },
      });
    },
    listLeads: async (query) => {
      const where = {
        ...(query.icpProfileId
          ? {
              discoveryRecords: {
                some: {
                  icpProfileId: query.icpProfileId,
                },
              },
            }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.scoreBand
          ? {
              scorePredictions: {
                some: {
                  ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
                  scoreBand: query.scoreBand,
                },
              },
            }
          : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      };

      const [total, rows] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            discoveryRecords: {
              ...(query.icpProfileId ? { where: { icpProfileId: query.icpProfileId } } : {}),
              orderBy: [{ discoveredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            enrichmentRecords: {
              orderBy: [{ enrichedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            scorePredictions: {
              ...(query.icpProfileId ? { where: { icpProfileId: query.icpProfileId } } : {}),
              orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        }),
      ]);

      const qualityRows = query.includeQualityMetrics
        ? await prisma.analyticsDailyRollup.findMany({
            where: {
              ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
              ...(query.from || query.to
                ? {
                    day: {
                      ...(query.from ? { gte: toDayStart(query.from) } : {}),
                      ...(query.to ? { lte: toDayStart(query.to) } : {}),
                    },
                  }
                : {}),
            },
            select: {
              discoveredCount: true,
              validEmailCount: true,
              validDomainCount: true,
              industryMatchRate: true,
              geoMatchRate: true,
            },
          })
        : [];
      const qualityDenominator = qualityRows.reduce((sum, row) => sum + row.discoveredCount, 0);
      const qualityMetrics = query.includeQualityMetrics
        ? {
            validEmailCount: qualityRows.reduce((sum, row) => sum + row.validEmailCount, 0),
            validDomainCount: qualityRows.reduce((sum, row) => sum + row.validDomainCount, 0),
            industryMatchRate:
              qualityDenominator > 0
                ? Number(
                    (
                      qualityRows.reduce(
                        (sum, row) => sum + row.industryMatchRate * row.discoveredCount,
                        0,
                      ) / qualityDenominator
                    ).toFixed(6),
                  )
                : 0,
            geoMatchRate:
              qualityDenominator > 0
                ? Number(
                    (
                      qualityRows.reduce((sum, row) => sum + row.geoMatchRate * row.discoveredCount, 0) /
                      qualityDenominator
                    ).toFixed(6),
                  )
                : 0,
          }
        : undefined;

      return {
        items: rows.map((lead) => ({
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          source: lead.source,
          status: lead.status,
          error: lead.error,
          createdAt: lead.createdAt.toISOString(),
          updatedAt: lead.updatedAt.toISOString(),
          latestIcpProfileId: lead.discoveryRecords[0]?.icpProfileId ?? null,
          latestScoreBand: lead.scorePredictions[0]?.scoreBand ?? null,
          latestBlendedScore: lead.scorePredictions[0]?.blendedScore ?? null,
          latestDiscoveryRawPayload: lead.discoveryRecords[0]?.rawPayload ?? null,
          latestEnrichmentNormalizedPayload: lead.enrichmentRecords[0]?.normalizedPayload ?? null,
          latestEnrichmentRawPayload: lead.enrichmentRecords[0]?.rawPayload ?? null,
        })),
        qualityMetrics,
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    },
    getJobById: async (jobId) => {
      return prisma.jobExecution.findUnique({
        where: { id: jobId },
      });
    },
  });

  await server.listen({
    host: '0.0.0.0',
    port: env.API_PORT,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down API');
    await server.close();
    await boss.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error: unknown) => {
  console.error('API boot failed:', error);
  process.exit(1);
});
