import type { CreateDiscoveryRunRequest } from '@lead-flood/contracts';
import type { Job, SendOptions } from 'pg-boss';

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

export interface DiscoveryRunJobPayload
  extends Pick<CreateDiscoveryRunRequest, 'icpProfileId' | 'limit' | 'cursor' | 'requestedByUserId'> {
  runId: string;
  correlationId?: string;
}

export interface DiscoveryRunLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export async function handleDiscoveryRunJob(
  logger: DiscoveryRunLogger,
  job: Job<DiscoveryRunJobPayload>,
): Promise<void> {
  const { runId, correlationId, icpProfileId } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      icpProfileId,
    },
    'Started discovery.run job',
  );

  try {
    // TODO: Fetch leads from discovery provider and persist LeadDiscoveryRecord rows.
    // TODO: Emit downstream enrichment.run jobs for accepted leads.

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
      },
      'Completed discovery.run job',
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        error,
      },
      'Failed discovery.run job',
    );

    throw error;
  }
}
