import type { CreateEnrichmentRunRequest } from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';
import { PdlEnrichmentAdapter, type PdlEnrichmentRequest } from '@lead-flood/providers';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  FEATURES_COMPUTE_JOB_NAME,
  FEATURES_COMPUTE_RETRY_OPTIONS,
  type FeaturesComputeJobPayload,
} from './features.compute.job.js';

export const ENRICHMENT_RUN_JOB_NAME = 'enrichment.run';
export const ENRICHMENT_RUN_IDEMPOTENCY_KEY_PATTERN = 'enrichment.run:${leadId}:${provider}';

export const ENRICHMENT_RUN_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'enrichment.run.dead_letter',
};

const ENRICHMENT_RECORD_JOB_TYPE = 'lead.enrichment.pdl';

export interface EnrichmentRunJobPayload
  extends Pick<CreateEnrichmentRunRequest, 'provider' | 'requestedByUserId'> {
  runId: string;
  leadId: string;
  discoveryRecordId?: string;
  icpProfileId?: string;
  correlationId?: string;
  jobExecutionId?: string;
}

export interface EnrichmentRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface EnrichmentRunDependencies {
  boss: Pick<PgBoss, 'send'>;
  enrichmentAdapter: PdlEnrichmentAdapter;
  enrichmentEnabled: boolean;
}

function domainFromEmail(email: string): string | undefined {
  const [, domain] = email.split('@');
  return domain?.toLowerCase();
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function markEnrichmentJobRunning(jobExecutionId: string): Promise<void> {
  await prisma.jobExecution.update({
    where: { id: jobExecutionId },
    data: {
      status: 'running',
      attempts: {
        increment: 1,
      },
      startedAt: new Date(),
      error: null,
    },
  });
}

async function markEnrichmentJobFailed(jobExecutionId: string, message: string): Promise<void> {
  await prisma.jobExecution.update({
    where: { id: jobExecutionId },
    data: {
      status: 'failed',
      error: message,
      finishedAt: new Date(),
    },
  });
}

async function markEnrichmentJobCompleted(jobExecutionId: string, result: unknown): Promise<void> {
  await prisma.jobExecution.update({
    where: { id: jobExecutionId },
    data: {
      status: 'completed',
      result: toInputJson(result),
      error: null,
      finishedAt: new Date(),
    },
  });
}

export async function handleEnrichmentRunJob(
  logger: EnrichmentRunLogger,
  job: Job<EnrichmentRunJobPayload>,
  dependencies: EnrichmentRunDependencies,
): Promise<void> {
  const { runId, correlationId, leadId, provider, jobExecutionId, icpProfileId } = job.data;
  const effectiveCorrelationId = correlationId ?? job.id;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: effectiveCorrelationId,
      leadId,
      provider,
      jobExecutionId: jobExecutionId ?? null,
    },
    'Started enrichment.run job',
  );

  if (!dependencies.enrichmentEnabled) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
        leadId,
      },
      'Skipping enrichment.run job because enrichment is disabled',
    );
    return;
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    logger.warn(
      {
        jobId: job.id,
        runId,
        correlationId: effectiveCorrelationId,
        leadId,
      },
      'Skipping enrichment.run job because lead was not found',
    );
    return;
  }

  if (jobExecutionId) {
    await markEnrichmentJobRunning(jobExecutionId);
  }

  try {
    const enrichmentRequest: PdlEnrichmentRequest = {
      email: lead.email,
      correlationId: effectiveCorrelationId,
    };

    const emailDomain = domainFromEmail(lead.email);
    if (emailDomain) {
      enrichmentRequest.domain = emailDomain;
    }

    const enrichmentResult = await dependencies.enrichmentAdapter.enrichLead(enrichmentRequest);

    // TODO: Replace JobExecution fallback with LeadEnrichmentRecord once schema is available.
    const enrichmentRecordExecution = await prisma.jobExecution.create({
      data: {
        type: ENRICHMENT_RECORD_JOB_TYPE,
        status: enrichmentResult.status === 'success' ? 'completed' : 'failed',
        attempts: 1,
        payload: {
          runId,
          correlationId: effectiveCorrelationId,
          provider: provider ?? 'PEOPLE_DATA_LABS',
          leadId,
        },
        result: toInputJson(enrichmentResult),
        error:
          enrichmentResult.status === 'success'
            ? null
            : enrichmentResult.failure.message,
        leadId,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });

    if (enrichmentResult.status === 'success') {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'enriched',
          enrichmentData: toInputJson(enrichmentResult.normalized),
          error: null,
        },
      });

      if (jobExecutionId) {
        await markEnrichmentJobCompleted(jobExecutionId, enrichmentResult.normalized);
      }

      const featuresPayload: FeaturesComputeJobPayload = {
        runId,
        leadId,
        icpProfileId: icpProfileId ?? 'default',
        snapshotVersion: 1,
        sourceVersion: 'v1',
        enrichmentRecordId: enrichmentRecordExecution.id,
        correlationId: effectiveCorrelationId,
      };

      const featuresJobExecution = await prisma.jobExecution.create({
        data: {
          type: FEATURES_COMPUTE_JOB_NAME,
          status: 'queued',
          payload: toInputJson(featuresPayload),
          leadId,
        },
      });

      await dependencies.boss.send(FEATURES_COMPUTE_JOB_NAME, featuresPayload, {
        singletonKey: `features.compute:${leadId}:${featuresPayload.snapshotVersion}`,
        ...FEATURES_COMPUTE_RETRY_OPTIONS,
      });

      logger.info(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          leadId,
          enrichmentRecordExecutionId: enrichmentRecordExecution.id,
          featuresJobExecutionId: featuresJobExecution.id,
        },
        'Completed enrichment.run job',
      );
      return;
    }

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: enrichmentResult.status === 'terminal_error' ? 'failed' : 'processing',
        error: enrichmentResult.failure.message,
      },
    });

    if (jobExecutionId) {
      await markEnrichmentJobFailed(jobExecutionId, enrichmentResult.failure.message);
    }

    if (enrichmentResult.status === 'retryable_error') {
      const error = new Error(enrichmentResult.failure.message);
      logger.warn(
        {
          jobId: job.id,
          queue: job.name,
          runId,
          correlationId: effectiveCorrelationId,
          leadId,
          statusCode: enrichmentResult.failure.statusCode,
        },
        'Retryable enrichment failure detected',
      );
      throw error;
    }

    logger.warn(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        leadId,
        statusCode: enrichmentResult.failure.statusCode,
      },
      'Terminal enrichment failure detected',
    );
  } catch (error: unknown) {
    if (jobExecutionId) {
      await markEnrichmentJobFailed(
        jobExecutionId,
        error instanceof Error ? error.message : 'Unknown enrichment failure',
      );
    }

    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: effectiveCorrelationId,
        leadId,
        error,
      },
      'Failed enrichment.run job',
    );

    throw error;
  }
}
