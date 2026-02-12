import { prisma } from '@lead-flood/db';
import type { Job } from 'pg-boss';

export interface LeadEnrichJobPayload {
  leadId: string;
  jobExecutionId: string;
  source: string;
}

export interface LeadEnrichLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function handleLeadEnrichJob(
  logger: LeadEnrichLogger,
  job: Job<LeadEnrichJobPayload>,
): Promise<void> {
  const { leadId, jobExecutionId, source } = job.data;
  const startedAt = new Date();

  const jobExecution = await prisma.jobExecution.findUnique({
    where: { id: jobExecutionId },
  });

  if (!jobExecution) {
    logger.warn({ jobId: job.id, jobExecutionId, leadId }, 'Job execution row not found; skipping job');
    return;
  }

  if (jobExecution.status === 'completed') {
    logger.info({ jobId: job.id, jobExecutionId, leadId }, 'Job already completed; skipping duplicate work');
    return;
  }

  await prisma.$transaction([
    prisma.jobExecution.update({
      where: { id: jobExecutionId },
      data: {
        status: 'running',
        startedAt,
        attempts: {
          increment: 1,
        },
        error: null,
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'processing',
        error: null,
      },
    }),
  ]);

  try {
    await sleep(2000);

    const enrichmentData = {
      provider: 'stub',
      source,
      enrichedAt: new Date().toISOString(),
    };

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'enriched',
          enrichmentData,
          error: null,
        },
      }),
      prisma.jobExecution.update({
        where: { id: jobExecutionId },
        data: {
          status: 'completed',
          result: enrichmentData,
          error: null,
          finishedAt: new Date(),
        },
      }),
    ]);

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        leadId,
        jobExecutionId,
      },
      'Lead enrichment stub job completed',
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown lead enrichment failure';

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      }),
      prisma.jobExecution.update({
        where: { id: jobExecutionId },
        data: {
          status: 'failed',
          error: errorMessage,
          finishedAt: new Date(),
        },
      }),
    ]);

    logger.error(
      {
        jobId: job.id,
        queue: job.name,
        leadId,
        jobExecutionId,
        error,
      },
      'Lead enrichment stub job failed',
    );

    throw error;
  }
}
