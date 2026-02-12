import type { Job } from 'pg-boss';

export interface HeartbeatJobPayload {
  source: 'scheduler';
}

export interface HeartbeatLogger {
  info: (object: Record<string, unknown>, message: string) => void;
}

export async function handleHeartbeatJob(
  logger: HeartbeatLogger,
  job: Job<HeartbeatJobPayload>,
): Promise<void> {
  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      source: job.data.source,
    },
    'Processed heartbeat job',
  );
}
