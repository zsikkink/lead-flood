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

export function buildMessagingService(repository: MessagingRepository): MessagingService {
  return {
    async generateMessageDraft(input) {
      // TODO: apply grounding and prompt templates.
      return repository.generateMessageDraft(input);
    },
    async listMessageDrafts(query) {
      // TODO: add approval-state derived flags.
      return repository.listMessageDrafts(query);
    },
    async getMessageDraft(draftId) {
      // TODO: include variant ranking details.
      return repository.getMessageDraft(draftId);
    },
    async approveMessageDraft(draftId, input) {
      // TODO: apply compliance checks on approval.
      return repository.approveMessageDraft(draftId, input);
    },
    async rejectMessageDraft(draftId, input) {
      // TODO: persist rejection taxonomy.
      return repository.rejectMessageDraft(draftId, input);
    },
    async sendMessage(input) {
      // TODO: enforce messaging guardrails and rate limits.
      return repository.sendMessage(input);
    },
    async listMessageSends(query) {
      // TODO: include delivery latency aggregates.
      return repository.listMessageSends(query);
    },
    async getMessageSend(sendId) {
      // TODO: include feedback linkage details.
      return repository.getMessageSend(sendId);
    },
  };
}
