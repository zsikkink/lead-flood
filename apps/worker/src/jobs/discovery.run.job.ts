import type {
  CreateDiscoveryRunRequest,
  DiscoveryProvider,
  EnrichmentProvider,
} from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';
import {
  ApolloDiscoveryAdapter,
  type ApolloDiscoveryRequest,
  ApolloRateLimitError,
  CompanySearchAdapter,
  type CompanySearchDiscoveryRequest,
  GoogleSearchAdapter,
  type GoogleSearchDiscoveryRequest,
  GoogleSearchRateLimitError,
  LinkedInScrapeAdapter,
  type LinkedInScrapeDiscoveryRequest,
  LinkedInScrapeRateLimitError,
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

const DISCOVERY_RECORD_JOB_TYPE = 'lead.discovery';
const DEFAULT_DISCOVERY_LIMIT = 25;

export interface DiscoveryRunFilters {
  industries?: string[];
  countries?: string[];
  requiredTechnologies?: string[];
  excludedDomains?: string[];
}

export interface DiscoveryRunJobPayload
  extends Pick<CreateDiscoveryRunRequest, 'icpProfileId' | 'provider' | 'limit' | 'cursor' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
  filters?: DiscoveryRunFilters;
}

export interface DiscoveryRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface DiscoveryRunDependencies {
  boss: Pick<PgBoss, 'send'>;
  apolloAdapter: ApolloDiscoveryAdapter;
  googleSearchAdapter: GoogleSearchAdapter;
  linkedInScrapeAdapter: LinkedInScrapeAdapter;
  companySearchAdapter: CompanySearchAdapter;
  discoveryEnabled: boolean;
  apolloEnabled: boolean;
  googleSearchEnabled: boolean;
  linkedInScrapeEnabled: boolean;
  companySearchEnabled: boolean;
  defaultProvider: DiscoveryProvider;
  defaultEnrichmentProvider: EnrichmentProvider;
  defaultLimit?: number;
}

interface NormalizedDiscoveredLead {
  provider: string;
  providerRecordId: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companySize: number | null;
  country: string | null;
  raw: unknown;
}

interface DiscoveryExecutionResult {
  provider: DiscoveryProvider;
  source: string;
  leads: NormalizedDiscoveredLead[];
  nextCursor: string | null;
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

function toApolloRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): ApolloDiscoveryRequest {
  const request: ApolloDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
  }

  return request;
}

function toGoogleSearchRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): GoogleSearchDiscoveryRequest {
  const request: GoogleSearchDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
    if (payload.filters.industries?.[0]) {
      request.query = payload.filters.industries[0];
    }
  }

  return request;
}

function toLinkedInRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): LinkedInScrapeDiscoveryRequest {
  const request: LinkedInScrapeDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
    if (payload.filters.industries?.[0]) {
      request.query = `${payload.filters.industries[0]} sales`;
    }
  }

  return request;
}

function toCompanySearchRequest(
  payload: DiscoveryRunJobPayload,
  limit: number,
  correlationId: string,
): CompanySearchDiscoveryRequest {
  const request: CompanySearchDiscoveryRequest = {
    limit,
    correlationId,
  };

  if (payload.icpProfileId) {
    request.icpProfileId = payload.icpProfileId;
  }
  if (payload.cursor) {
    request.cursor = payload.cursor;
  }
  if (payload.filters) {
    request.filters = payload.filters;
    if (payload.filters.industries?.[0]) {
      request.query = payload.filters.industries[0];
    }
  }

  return request;
}

async function executeDiscoveryProvider(
  payload: DiscoveryRunJobPayload,
  provider: DiscoveryProvider,
  limit: number,
  correlationId: string,
  dependencies: DiscoveryRunDependencies,
  logger: DiscoveryRunLogger,
  jobId: string,
): Promise<DiscoveryExecutionResult> {
  switch (provider) {
    case 'GOOGLE_SEARCH': {
      if (!dependencies.googleSearchEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.googleSearchAdapter.discoverLeads(
        toGoogleSearchRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads,
        nextCursor: result.nextCursor,
      };
    }

    case 'LINKEDIN_SCRAPE': {
      if (!dependencies.linkedInScrapeEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.linkedInScrapeAdapter.discoverLeads(
        toLinkedInRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads,
        nextCursor: result.nextCursor,
      };
    }

    case 'COMPANY_SEARCH_FREE': {
      if (!dependencies.companySearchEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider, source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.companySearchAdapter.discoverLeads(
        toCompanySearchRequest(payload, limit, correlationId),
      );
      return {
        provider,
        source: result.source,
        leads: result.leads,
        nextCursor: result.nextCursor,
      };
    }

    case 'APOLLO':
    default: {
      if (!dependencies.apolloEnabled) {
        logger.warn(
          { jobId, runId: payload.runId, correlationId, provider },
          'Skipping discovery provider because it is disabled',
        );
        return { provider: 'APOLLO', source: 'disabled', leads: [], nextCursor: null };
      }

      const result = await dependencies.apolloAdapter.discoverLeads(
        toApolloRequest(payload, limit, correlationId),
      );
      return {
        provider: 'APOLLO',
        source: 'apollo',
        leads: result.leads,
        nextCursor: result.nextCursor,
      };
    }
  }
}

export async function handleDiscoveryRunJob(
  logger: DiscoveryRunLogger,
  job: Job<DiscoveryRunJobPayload>,
  dependencies: DiscoveryRunDependencies,
): Promise<void> {
  const { runId, correlationId, icpProfileId } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;
  const selectedProvider = job.data.provider ?? dependencies.defaultProvider;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      icpProfileId,
      provider: selectedProvider,
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
    const discoveryResult = await executeDiscoveryProvider(
      job.data,
      selectedProvider,
      requestedLimit,
      effectiveCorrelationId,
      dependencies,
      logger,
      job.id,
    );

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
          source: selectedProvider.toLowerCase(),
          status: 'new',
        },
        update: {
          firstName: discoveredLead.firstName || fallbackName.firstName,
          lastName: discoveredLead.lastName || fallbackName.lastName,
          source: selectedProvider.toLowerCase(),
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
            selectedProvider,
            providerSource: discoveryResult.source,
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
            provider: dependencies.defaultEnrichmentProvider,
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
        provider: dependencies.defaultEnrichmentProvider,
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
        singletonKey: `enrichment.run:${lead.id}:${dependencies.defaultEnrichmentProvider}`,
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
        provider: selectedProvider,
        createdLeads,
        enqueuedEnrichmentJobs,
        nextCursor: discoveryResult.nextCursor,
      },
      'Completed discovery.run job',
    );
  } catch (error: unknown) {
    if (
      error instanceof ApolloRateLimitError ||
      error instanceof GoogleSearchRateLimitError ||
      error instanceof LinkedInScrapeRateLimitError
    ) {
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          provider: selectedProvider,
          retryAfterSeconds:
            'retryAfterSeconds' in error ? error.retryAfterSeconds : undefined,
        },
        'Provider rate limit reached during discovery.run job',
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
