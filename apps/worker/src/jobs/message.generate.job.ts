import type { GenerateMessageDraftRequest } from '@lead-flood/contracts';
import { type Prisma, prisma } from '@lead-flood/db';
import type { OpenAiAdapter } from '@lead-flood/providers';
import type { Job, SendOptions } from 'pg-boss';

export const MESSAGE_GENERATE_JOB_NAME = 'message.generate';
export const MESSAGE_GENERATE_IDEMPOTENCY_KEY_PATTERN =
  'message.generate:${leadId}:${scorePredictionId}';

export const MESSAGE_GENERATE_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 45,
  retryBackoff: true,
  deadLetter: 'message.generate.dead_letter',
};

export interface MessageGenerateJobPayload
  extends Pick<
    GenerateMessageDraftRequest,
    'leadId' | 'icpProfileId' | 'scorePredictionId' | 'knowledgeEntryIds' | 'channel' | 'promptVersion'
  > {
  runId: string;
  correlationId?: string;
}

export interface MessageGenerateLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface MessageGenerateJobDependencies {
  openAiAdapter: OpenAiAdapter;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function handleMessageGenerateJob(
  logger: MessageGenerateLogger,
  job: Job<MessageGenerateJobPayload>,
  deps?: MessageGenerateJobDependencies,
): Promise<void> {
  const { runId, correlationId, leadId, icpProfileId, scorePredictionId, channel, promptVersion, knowledgeEntryIds } = job.data;

  logger.info(
    {
      jobId: job.id,
      queue: job.name,
      runId,
      correlationId: correlationId ?? job.id,
      leadId,
      icpProfileId,
      scorePredictionId,
    },
    'Started message.generate job',
  );

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!lead) {
      logger.error({ jobId: job.id, leadId }, 'Lead not found for message generation');
      return;
    }

    const icpProfile = await prisma.icpProfile.findUnique({
      where: { id: icpProfileId },
      select: { description: true },
    });

    const latestSnapshot = await prisma.leadFeatureSnapshot.findFirst({
      where: { leadId, icpProfileId },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const latestScore = scorePredictionId
      ? await prisma.leadScorePrediction.findUnique({
          where: { id: scorePredictionId },
        })
      : await prisma.leadScorePrediction.findFirst({
          where: { leadId, icpProfileId },
          orderBy: [{ predictedAt: 'desc' }, { createdAt: 'desc' }],
        });

    const featuresJson =
      latestSnapshot?.featuresJson && typeof latestSnapshot.featuresJson === 'object'
        ? (latestSnapshot.featuresJson as Record<string, unknown>)
        : {};

    const groundingContext = {
      leadName: `${lead.firstName} ${lead.lastName}`,
      leadEmail: lead.email,
      companyName: (featuresJson.has_company_name as string) ?? null,
      industry: (featuresJson.industry as string) ?? null,
      country: (featuresJson.country as string) ?? null,
      featuresJson,
      scoreBand: latestScore?.scoreBand ?? 'MEDIUM',
      blendedScore: latestScore?.blendedScore ?? 0,
      icpDescription: icpProfile?.description ?? 'No ICP description available',
    };

    let generatedByModel = 'stub';
    let variantAContent = { subject: null as string | null, bodyText: 'Message generation pending', bodyHtml: null as string | null, ctaText: null as string | null };
    let variantBContent = { ...variantAContent };

    if (deps?.openAiAdapter?.isConfigured) {
      const result = await deps.openAiAdapter.generateMessageVariants(groundingContext);

      if (result.status === 'success') {
        generatedByModel = result.data.model;
        variantAContent = result.data.variant_a;
        variantBContent = result.data.variant_b;
      } else {
        logger.warn(
          { jobId: job.id, leadId, status: result.status },
          'OpenAI message generation failed, creating stub draft',
        );
      }
    } else {
      logger.warn({ jobId: job.id, leadId }, 'OpenAI not configured, creating stub draft');
    }

    const draft = await prisma.messageDraft.create({
      data: {
        leadId,
        icpProfileId,
        scorePredictionId: scorePredictionId ?? latestScore?.id ?? null,
        promptVersion: promptVersion ?? 'v1',
        generatedByModel,
        groundingKnowledgeIds: knowledgeEntryIds ?? [],
        groundingContextJson: toInputJson(groundingContext),
        approvalStatus: 'PENDING',
        variants: {
          create: [
            {
              variantKey: 'variant_a',
              channel: channel ?? 'EMAIL',
              subject: variantAContent.subject,
              bodyText: variantAContent.bodyText,
              bodyHtml: variantAContent.bodyHtml,
              ctaText: variantAContent.ctaText,
              isSelected: false,
            },
            {
              variantKey: 'variant_b',
              channel: channel ?? 'EMAIL',
              subject: variantBContent.subject,
              bodyText: variantBContent.bodyText,
              bodyHtml: variantBContent.bodyHtml,
              ctaText: variantBContent.ctaText,
              isSelected: false,
            },
          ],
        },
      },
      include: { variants: true },
    });

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        correlationId: correlationId ?? job.id,
        leadId,
        draftId: draft.id,
        generatedByModel,
        variantCount: draft.variants.length,
      },
      'Completed message.generate job',
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
      'Failed message.generate job',
    );

    throw error;
  }
}
