import type { NotifySalesJobPayload } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { Job, SendOptions } from 'pg-boss';

export const NOTIFY_SALES_JOB_NAME = 'notify.sales';

export const NOTIFY_SALES_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'notify.sales.dead_letter',
};

export { type NotifySalesJobPayload };

export interface NotifySalesLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface NotifySalesJobDependencies {
  slackWebhookUrl?: string | undefined;
  trengoApiKey?: string | undefined;
  trengoBaseUrl?: string | undefined;
  trengoInternalConversationId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

function buildNotificationMessage(
  lead: { firstName: string; lastName: string; email: string },
  classification: string | null,
  unclassified: boolean,
  reason?: string | undefined,
): string {
  const name = `${lead.firstName} ${lead.lastName}`;

  if (unclassified) {
    if (reason === 'MEDIA_ONLY') {
      return `${name} (${lead.email}) replied with a voice note/media — needs manual review`;
    }
    return `${name} (${lead.email}) replied — classification failed, needs manual review`;
  }

  const classificationLabel = classification?.replace(/_/g, ' ').toLowerCase() ?? 'unknown';
  return `${name} (${lead.email}) replied — classified as ${classificationLabel}`;
}

export async function handleNotifySalesJob(
  logger: NotifySalesLogger,
  job: Job<NotifySalesJobPayload>,
  deps?: NotifySalesJobDependencies | undefined,
): Promise<void> {
  const { runId, correlationId, leadId, feedbackEventId, classification, unclassified, reason } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id, leadId, feedbackEventId },
    'Started notify.sales job',
  );

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!lead) {
      logger.error({ jobId: job.id, leadId }, 'Lead not found for notification');
      return;
    }

    const message = buildNotificationMessage(lead, classification, unclassified ?? false, reason);
    const fetchFn = deps?.fetchImpl ?? fetch;

    // Send to Slack
    if (deps?.slackWebhookUrl) {
      try {
        const slackResponse = await fetchFn(deps.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message }),
        });

        if (!slackResponse.ok) {
          logger.warn(
            { jobId: job.id, status: slackResponse.status },
            'Slack notification failed',
          );
        }
      } catch (slackError: unknown) {
        logger.warn({ jobId: job.id, error: slackError }, 'Slack notification error');
      }
    }

    // Send to Trengo internal conversation
    if (deps?.trengoApiKey && deps.trengoInternalConversationId) {
      const trengoBaseUrl = deps.trengoBaseUrl ?? 'https://app.trengo.com/api/v2';
      try {
        const trengoResponse = await fetchFn(
          `${trengoBaseUrl}/conversations/${deps.trengoInternalConversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deps.trengoApiKey}`,
            },
            body: JSON.stringify({
              body: message,
              internal: true,
            }),
          },
        );

        if (!trengoResponse.ok) {
          logger.warn(
            { jobId: job.id, status: trengoResponse.status },
            'Trengo internal notification failed',
          );
        }
      } catch (trengoError: unknown) {
        logger.warn({ jobId: job.id, error: trengoError }, 'Trengo internal notification error');
      }
    }

    logger.info(
      { jobId: job.id, queue: job.name, runId, leadId, message },
      'Completed notify.sales job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, leadId, error },
      'Failed notify.sales job',
    );
    throw error;
  }
}
