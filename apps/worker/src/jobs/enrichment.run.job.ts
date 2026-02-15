import type { CreateEnrichmentRunRequest } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

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

export interface EnrichmentRunJobPayload
  extends Pick<CreateEnrichmentRunRequest, 'provider' | 'requestedByUserId'> {
  runId: string;
  leadId: string;
  discoveryRecordId?: string;
  icpProfileId?: string;
  correlationId?: string;
}

export interface EnrichmentRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleEnrichmentRunJob(
  logger: EnrichmentRunLogger,
  job: Job<EnrichmentRunJobPayload>,
): Promise<void> {
  const { runId, correlationId, leadId, provider } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      leadId,
      provider,
    },
    'Started enrichment.run job',
  );

  try {
    // TODO: Call enrichment provider and persist LeadEnrichmentRecord.
    // TODO: Emit downstream features.compute job for enriched lead.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
      },
      'Completed enrichment.run job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
        error,
      },
      'Failed enrichment.run job',
    );

    throw error;
  }
}
