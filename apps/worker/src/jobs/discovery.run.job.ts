import type { CreateDiscoveryRunRequest } from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';
import {
  ApolloDiscoveryAdapter,
  type ApolloDiscoveryRequest,
  ApolloRateLimitError,
  type DiscoveryIcpFilters,
} from '@lead-flood/providers';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  ENRICHMENT_RUN_JOB_NAME,
  ENRICHMENT_RUN_RETRY_OPTIONS,
  type EnrichmentRunJobPayload,
} from './enrichment.run.job.js';

export const DISCOVERY_RUN_JOB_NAME = 'discovery.run';
export const DISCOVERY_RUN_IDEMPOTENCY_KEY_PATTERN = 'discovery.run:${runId}';

export const DISCOVERY_RUN_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'discovery.run.dead_letter',
};

const DISCOVERY_RECORD_JOB_TYPE = 'lead.discovery.apollo';
const DEFAULT_DISCOVERY_LIMIT = 25;

export interface DiscoveryRunJobPayload
  extends Pick<CreateDiscoveryRunRequest, 'icpProfileId' | 'limit' | 'cursor' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
  filters?: DiscoveryIcpFilters;
}

export interface DiscoveryRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface DiscoveryRunDependencies {
  boss: Pick<PgBoss, 'send'>;
  discoveryAdapter: ApolloDiscoveryAdapter;
  discoveryEnabled: boolean;
  defaultLimit?: number;
}

function deriveLeadName(email: string): { firstName: string; lastName: string } {
  const localPart = email.split('@')[0] ?? 'lead';
  const [first, ...rest] = localPart.split('.');

  return {
    firstName: first ? first.slice(0, 1).toUpperCase() + first.slice(1) : 'Lead',
    lastName: rest.join(' ').trim(),
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function handleDiscoveryRunJob(
  logger: DiscoveryRunLogger,
  job: Job<DiscoveryRunJobPayload>,
  dependencies: DiscoveryRunDependencies,
): Promise<void> {
  const { runId, correlationId, icpProfileId } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      icpProfileId,
      cursor: job.data.cursor ?? null,
    },
    'Started discovery.run job',
  );

  if (!dependencies.discoveryEnabled) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
      },
      'Skipping discovery.run job because discovery is disabled',
    );
    return;
  }

  const requestedLimit = job.data.limit ?? dependencies.defaultLimit ?? DEFAULT_DISCOVERY_LIMIT;

  try {
    const discoveryRequest: ApolloDiscoveryRequest = {
      icpProfileId,
      limit: requestedLimit,
      correlationId: effectiveCorrelationId,
    };

    if (job.data.cursor) {
      discoveryRequest.cursor = job.data.cursor;
    }

    if (job.data.filters) {
      discoveryRequest.filters = job.data.filters;
    }

    const discoveryResult = await dependencies.discoveryAdapter.discoverLeads(discoveryRequest);

    let createdLeads = 0;
    let enqueuedEnrichmentJobs = 0;

    for (const discoveredLead of discoveryResult.leads) {
      const fallbackName = deriveLeadName(discoveredLead.email);

      const lead = await prisma.lead.upsert({
        where: { email: discoveredLead.email },
        create: {
          firstName: discoveredLead.firstName || fallbackName.firstName,
          lastName: discoveredLead.lastName || fallbackName.lastName,
          email: discoveredLead.email,
          source: 'apollo',
          status: 'new',
        },
        update: {
          firstName: discoveredLead.firstName || fallbackName.firstName,
          lastName: discoveredLead.lastName || fallbackName.lastName,
          source: 'apollo',
        },
      });

      createdLeads += 1;

      // TODO: Replace JobExecution fallback with LeadDiscoveryRecord once schema is available.
      const discoveryRecordExecution = await prisma.jobExecution.create({
        data: {
          type: DISCOVERY_RECORD_JOB_TYPE,
          status: 'completed',
          attempts: 1,
          payload: {
            runId,
            correlationId: effectiveCorrelationId,
            icpProfileId: icpProfileId ?? null,
            provider: discoveredLead.provider,
            providerRecordId: discoveredLead.providerRecordId,
            raw: discoveredLead.raw,
          } as Prisma.InputJsonValue,
          result: toInputJson({
            normalized: discoveredLead,
          }),
          leadId: lead.id,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });

      const enrichmentJobExecution = await prisma.jobExecution.create({
        data: {
          type: ENRICHMENT_RUN_JOB_NAME,
          status: 'queued',
          payload: {
            runId,
            leadId: lead.id,
            provider: 'PEOPLE_DATA_LABS',
            correlationId: effectiveCorrelationId,
            jobExecutionId: null,
            discoveryRecordId: discoveryRecordExecution.id,
            icpProfileId: icpProfileId ?? null,
          },
          leadId: lead.id,
        },
      });

      const enrichmentPayload: EnrichmentRunJobPayload = {
        runId,
        leadId: lead.id,
        provider: 'PEOPLE_DATA_LABS',
        correlationId: effectiveCorrelationId,
        jobExecutionId: enrichmentJobExecution.id,
        discoveryRecordId: discoveryRecordExecution.id,
        icpProfileId,
      };

      await prisma.jobExecution.update({
        where: { id: enrichmentJobExecution.id },
        data: {
          payload: toInputJson(enrichmentPayload),
        },
      });

      await dependencies.boss.send(ENRICHMENT_RUN_JOB_NAME, enrichmentPayload, {
        singletonKey: `enrichment.run:${lead.id}:PEOPLE_DATA_LABS`,
        ...ENRICHMENT_RUN_RETRY_OPTIONS,
      });

      enqueuedEnrichmentJobs += 1;
    }

    if (discoveryResult.nextCursor && discoveryResult.nextCursor !== job.data.cursor) {
      const nextPayload: DiscoveryRunJobPayload = {
        ...job.data,
        cursor: discoveryResult.nextCursor,
        correlationId: effectiveCorrelationId,
      };

      await dependencies.boss.send(DISCOVERY_RUN_JOB_NAME, nextPayload, {
        singletonKey: `discovery.run:${runId}:${discoveryResult.nextCursor}`,
        ...DISCOVERY_RUN_RETRY_OPTIONS,
      });
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        createdLeads,
        enqueuedEnrichmentJobs,
        nextCursor: discoveryResult.nextCursor,
      },
      'Completed discovery.run job',
    );
  } catch (error: unknown) {
    if (error instanceof ApolloRateLimitError) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        'Apollo rate limit reached during discovery.run job',
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          prismaCode: error.code,
        },
        'Prisma conflict detected during discovery.run job',
      );
    }

    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        error,
      },
      'Failed discovery.run job',
    );

    throw error;
  }
}
