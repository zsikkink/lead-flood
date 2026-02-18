import PgBoss from 'pg-boss';

import { Prisma, prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';
import type {
  RunDiscoverySeedRequest,
  RunDiscoveryTasksRequest,
  TriggerJobRunResponse,
} from '@lead-flood/contracts';

import { buildSupabaseAccessTokenVerifier } from './auth/supabase.js';
import { loadApiEnv } from './env.js';
import type { ReplyClassifyJobPayload } from '@lead-flood/contracts';

import type { AnalyticsRollupJobPayload } from './modules/analytics/analytics.service.js';
import type { DiscoveryRunJobPayload } from './modules/discovery/discovery.service.js';
import type { EnrichmentRunJobPayload } from './modules/enrichment/enrichment.service.js';
import type { MessageGenerateJobPayload, MessagingSendJobPayload } from './modules/messaging/messaging.service.js';
import type { ScoringRunJobPayload } from './modules/scoring/scoring.service.js';
import { buildServer, LeadAlreadyExistsError } from './server.js';

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function main(): Promise<void> {
  const env = loadApiEnv(process.env);
  const supabaseJwtIssuer =
    env.SUPABASE_JWT_ISSUER ??
    (env.SUPABASE_PROJECT_REF
      ? `https://${env.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`
      : null);
  if (!supabaseJwtIssuer) {
    throw new Error('SUPABASE_JWT_ISSUER or SUPABASE_PROJECT_REF is required');
  }

  const verifyAccessToken = buildSupabaseAccessTokenVerifier({
    issuer: supabaseJwtIssuer,
    audience: env.SUPABASE_JWT_AUDIENCE ?? 'authenticated',
  });
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
  await boss.createQueue('discovery.run');
  await boss.createQueue('enrichment.run');
  await boss.createQueue('scoring.compute');
  await boss.createQueue('message.send');
  await boss.createQueue('message.generate');
  await boss.createQueue('analytics.rollup');
  await boss.createQueue('reply.classify');
  await boss.createQueue('discovery.seed');
  await boss.createQueue('discovery.run_search_task');

  const enqueueReplyClassify = async (payload: ReplyClassifyJobPayload): Promise<void> => {
    await boss.send('reply.classify', payload, {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: 'reply.classify.dead_letter',
    });
  };

  const triggerDiscoverySeedJob = async (
    input: RunDiscoverySeedRequest,
  ): Promise<TriggerJobRunResponse> => {
    const startedAt = new Date();
    const run = await prisma.jobRun.create({
      data: {
        jobName: 'discovery.seed',
        status: 'RUNNING',
        startedAt,
        paramsJson: toInputJson(input),
        countersJson: {
          generated: 0,
          inserted: 0,
        } as Prisma.InputJsonValue,
        resourceJson: {
          db_writes: {
            search_tasks_inserted: 0,
          },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    try {
      await boss.send(
        'discovery.seed',
        {
          reason: 'api',
          correlationId: `api:job_run:${run.id}`,
          jobRunId: run.id,
          profile: input.profile,
          maxTasks: input.maxTasks,
          maxPages: input.maxPages,
          bucket: input.bucket,
          taskTypes: input.taskTypes,
          countries: input.countries,
          languages: input.languages,
        },
        {
          singletonKey: `discovery.seed:${run.id}`,
          retryLimit: 3,
          retryDelay: 60,
          retryBackoff: true,
        },
      );
    } catch (error: unknown) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
          errorText: error instanceof Error ? error.message : 'Failed to enqueue discovery.seed job',
        },
      });
      throw error;
    }

    return {
      jobRunId: run.id,
      status: 'RUNNING',
    };
  };

  const triggerDiscoveryTaskRun = async (
    input: RunDiscoveryTasksRequest,
  ): Promise<TriggerJobRunResponse> => {
    const startedAt = new Date();
    const concurrency = input.concurrency ?? 1;
    const run = await prisma.jobRun.create({
      data: {
        jobName: 'discovery.run_search_task',
        status: 'RUNNING',
        startedAt,
        paramsJson: toInputJson({
          ...input,
          concurrency,
        }),
        countersJson: {
          tasks_processed: 0,
          done: 0,
          failed: 0,
          skipped: 0,
          new_businesses: 0,
          new_sources: 0,
        } as Prisma.InputJsonValue,
        resourceJson: {
          serpapi_requests: 0,
          serpapi_cached_responses: 0,
          estimated_serpapi_cost_units: 0,
          db_writes: {
            businesses_inserted: 0,
            sources_inserted: 0,
            evidence_inserted: 0,
          },
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    try {
      for (let slot = 0; slot < concurrency; slot += 1) {
        await boss.send(
          'discovery.run_search_task',
          {
            slot,
            reason: 'api',
            correlationId: `api:job_run:${run.id}`,
            jobRunId: run.id,
            maxTasks: input.maxTasks,
            timeBucket: input.timeBucket,
          },
          {
            retryLimit: 5,
            retryDelay: 30,
            retryBackoff: true,
          },
        );
      }
    } catch (error: unknown) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime()),
          errorText:
            error instanceof Error
              ? error.message
              : 'Failed to enqueue discovery.run_search_task job',
        },
      });
      throw error;
    }

    return {
      jobRunId: run.id,
      status: 'RUNNING',
    };
  };

  const server = buildServer({
    env,
    logger,
    verifyAccessToken,
    checkDatabaseHealth: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch (error: unknown) {
        logger.error({ error }, 'Database readiness check failed');
        return false;
      }
    },
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
              type: 'enrichment.run',
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
              type: 'enrichment.run',
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
            'enrichment.run',
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
    enqueueEnrichmentRun: async (payload: EnrichmentRunJobPayload) => {
      await boss.send('enrichment.run', payload, {
        singletonKey: `enrichment.run:${payload.runId}`,
        retryLimit: 5,
        retryDelay: 60,
        retryBackoff: true,
      });
    },
    enqueueScoringRun: async (payload: ScoringRunJobPayload) => {
      await boss.send('scoring.compute', payload, {
        singletonKey: `scoring.compute:${payload.runId}`,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      });
    },
    enqueueMessageSend: async (payload: MessagingSendJobPayload) => {
      await boss.send('message.send', payload, {
        singletonKey: `message.send:${payload.sendId}`,
        retryLimit: 5,
        retryDelay: 90,
        retryBackoff: true,
      });
    },
    enqueueMessageGenerate: async (payload: MessageGenerateJobPayload) => {
      await boss.send('message.generate', payload, {
        singletonKey: `message.generate:${payload.runId}`,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      });
    },
    enqueueAnalyticsRollup: async (payload: AnalyticsRollupJobPayload) => {
      await boss.send('analytics.rollup', payload, {
        singletonKey: `analytics.rollup:${payload.icpProfileId}:${payload.day}`,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
      });
    },
    enqueueReplyClassify,
    trengoWebhookSecret: env.TRENGO_WEBHOOK_SECRET,
    triggerDiscoverySeedJob,
    triggerDiscoveryTaskRun,
    ...(env.ADMIN_API_KEY ? { adminApiKey: env.ADMIN_API_KEY } : {}),
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
