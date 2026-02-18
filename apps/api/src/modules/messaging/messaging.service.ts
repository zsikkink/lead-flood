import type {
  ApproveMessageDraftRequest,
  GenerateMessageDraftRequest,
  GenerateMessageDraftResponse,
  ListMessageDraftsQuery,
  ListMessageDraftsResponse,
  ListMessageSendsQuery,
  ListMessageSendsResponse,
  MessageDraftResponse,
  MessageSendResponse,
  RejectMessageDraftRequest,
  SendMessageRequest,
} from '@lead-flood/contracts';

import type { MessagingRepository } from './messaging.repository.js';

export interface MessagingSendJobPayload {
  runId: string;
  sendId: string;
  messageDraftId: string;
  messageVariantId: string;
  idempotencyKey: string;
  channel: 'EMAIL' | 'WHATSAPP';
  scheduledAt?: string | undefined;
  correlationId?: string | undefined;
}

export interface MessageGenerateJobPayload {
  runId: string;
  leadId: string;
  icpProfileId: string;
  scorePredictionId?: string | undefined;
  knowledgeEntryIds?: string[] | undefined;
  channel?: string | undefined;
  promptVersion?: string | undefined;
  correlationId?: string | undefined;
}

export interface MessagingServiceDependencies {
  enqueueMessageSend: (payload: MessagingSendJobPayload) => Promise<void>;
  enqueueMessageGenerate?: ((payload: MessageGenerateJobPayload) => Promise<void>) | undefined;
}

export interface MessagingService {
  generateMessageDraft(input: GenerateMessageDraftRequest): Promise<GenerateMessageDraftResponse>;
  listMessageDrafts(query: ListMessageDraftsQuery): Promise<ListMessageDraftsResponse>;
  getMessageDraft(draftId: string): Promise<MessageDraftResponse>;
  approveMessageDraft(draftId: string, input: ApproveMessageDraftRequest): Promise<MessageDraftResponse>;
  rejectMessageDraft(draftId: string, input: RejectMessageDraftRequest): Promise<MessageDraftResponse>;
  sendMessage(input: SendMessageRequest): Promise<MessageSendResponse>;
  listMessageSends(query: ListMessageSendsQuery): Promise<ListMessageSendsResponse>;
  getMessageSend(sendId: string): Promise<MessageSendResponse>;
}

export function buildMessagingService(
  repository: MessagingRepository,
  dependencies: MessagingServiceDependencies,
): MessagingService {
  return {
    async generateMessageDraft(input) {
      if (dependencies.enqueueMessageGenerate) {
        const runId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await dependencies.enqueueMessageGenerate({
          runId,
          leadId: input.leadId,
          icpProfileId: input.icpProfileId,
          scorePredictionId: input.scorePredictionId,
          knowledgeEntryIds: input.knowledgeEntryIds,
          channel: input.channel,
          promptVersion: input.promptVersion,
        });
        // Return a placeholder response; the worker will create the actual draft
        return { draftId: runId, variantIds: [] };
      }
      return repository.generateMessageDraft(input);
    },
    async listMessageDrafts(query) {
      return repository.listMessageDrafts(query);
    },
    async getMessageDraft(draftId) {
      return repository.getMessageDraft(draftId);
    },
    async approveMessageDraft(draftId, input) {
      return repository.approveMessageDraft(draftId, input);
    },
    async rejectMessageDraft(draftId, input) {
      return repository.rejectMessageDraft(draftId, input);
    },
    async sendMessage(input) {
      const send = await repository.sendMessage(input);

      try {
        await dependencies.enqueueMessageSend({
          runId: send.id,
          sendId: send.id,
          messageDraftId: input.messageDraftId,
          messageVariantId: input.messageVariantId,
          idempotencyKey: input.idempotencyKey,
          channel: send.channel,
          scheduledAt: input.scheduledAt,
        });
      } catch (error: unknown) {
        // Send record already created with QUEUED status — pg-boss retry will handle it
        console.error('[messaging] Failed to enqueue message send', { error, sendId: send.id });
      }

      return send;
    },
    async listMessageSends(query) {
      return repository.listMessageSends(query);
    },
    async getMessageSend(sendId) {
      return repository.getMessageSend(sendId);
    },
  };
}
