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

import { MessagingNotImplementedError } from './messaging.errors.js';

export interface MessagingRepository {
  generateMessageDraft(input: GenerateMessageDraftRequest): Promise<GenerateMessageDraftResponse>;
  listMessageDrafts(query: ListMessageDraftsQuery): Promise<ListMessageDraftsResponse>;
  getMessageDraft(draftId: string): Promise<MessageDraftResponse>;
  approveMessageDraft(draftId: string, input: ApproveMessageDraftRequest): Promise<MessageDraftResponse>;
  rejectMessageDraft(draftId: string, input: RejectMessageDraftRequest): Promise<MessageDraftResponse>;
  sendMessage(input: SendMessageRequest): Promise<MessageSendResponse>;
  listMessageSends(query: ListMessageSendsQuery): Promise<ListMessageSendsResponse>;
  getMessageSend(sendId: string): Promise<MessageSendResponse>;
}

export class StubMessagingRepository implements MessagingRepository {
  async generateMessageDraft(_input: GenerateMessageDraftRequest): Promise<GenerateMessageDraftResponse> {
    throw new MessagingNotImplementedError('TODO: generate message draft persistence');
  }

  async listMessageDrafts(_query: ListMessageDraftsQuery): Promise<ListMessageDraftsResponse> {
    throw new MessagingNotImplementedError('TODO: list message drafts persistence');
  }

  async getMessageDraft(_draftId: string): Promise<MessageDraftResponse> {
    throw new MessagingNotImplementedError('TODO: get message draft persistence');
  }

  async approveMessageDraft(
    _draftId: string,
    _input: ApproveMessageDraftRequest,
  ): Promise<MessageDraftResponse> {
    throw new MessagingNotImplementedError('TODO: approve message draft persistence');
  }

  async rejectMessageDraft(
    _draftId: string,
    _input: RejectMessageDraftRequest,
  ): Promise<MessageDraftResponse> {
    throw new MessagingNotImplementedError('TODO: reject message draft persistence');
  }

  async sendMessage(_input: SendMessageRequest): Promise<MessageSendResponse> {
    throw new MessagingNotImplementedError('TODO: send message persistence');
  }

  async listMessageSends(_query: ListMessageSendsQuery): Promise<ListMessageSendsResponse> {
    throw new MessagingNotImplementedError('TODO: list message sends persistence');
  }

  async getMessageSend(_sendId: string): Promise<MessageSendResponse> {
    throw new MessagingNotImplementedError('TODO: get message send persistence');
  }
}
