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
  MessageVariantResponse,
  RejectMessageDraftRequest,
  SendMessageRequest,
} from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';

import { MessagingNotFoundError, MessagingNotImplementedError } from './messaging.errors.js';

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

type PrismaMessageVariant = {
  id: string;
  messageDraftId: string;
  variantKey: string;
  channel: 'EMAIL';
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  ctaText: string | null;
  qualityScore: number | null;
  isSelected: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaMessageDraft = {
  id: string;
  leadId: string;
  icpProfileId: string;
  scorePredictionId: string | null;
  promptVersion: string;
  generatedByModel: string;
  groundingKnowledgeIds: string[];
  groundingContextJson: unknown;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED';
  approvedByUserId: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  variants: PrismaMessageVariant[];
  createdAt: Date;
  updatedAt: Date;
};

type PrismaMessageSend = {
  id: string;
  leadId: string;
  messageDraftId: string;
  messageVariantId: string;
  channel: 'EMAIL';
  provider: 'RESEND';
  providerMessageId: string | null;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'REPLIED' | 'BOUNCED' | 'FAILED';
  idempotencyKey: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  repliedAt: Date | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapVariantToResponse(variant: PrismaMessageVariant): MessageVariantResponse {
  return {
    id: variant.id,
    messageDraftId: variant.messageDraftId,
    variantKey: variant.variantKey,
    channel: variant.channel,
    subject: variant.subject,
    bodyText: variant.bodyText,
    bodyHtml: variant.bodyHtml,
    ctaText: variant.ctaText,
    qualityScore: variant.qualityScore,
    isSelected: variant.isSelected,
    createdAt: variant.createdAt.toISOString(),
    updatedAt: variant.updatedAt.toISOString(),
  };
}

function mapDraftToResponse(draft: PrismaMessageDraft): MessageDraftResponse {
  return {
    id: draft.id,
    leadId: draft.leadId,
    icpProfileId: draft.icpProfileId,
    scorePredictionId: draft.scorePredictionId,
    promptVersion: draft.promptVersion,
    generatedByModel: draft.generatedByModel,
    groundingKnowledgeIds: draft.groundingKnowledgeIds,
    groundingContextJson:
      draft.groundingContextJson !== null && draft.groundingContextJson !== undefined
        ? draft.groundingContextJson
        : null,
    approvalStatus: draft.approvalStatus,
    approvedByUserId: draft.approvedByUserId,
    approvedAt: draft.approvedAt?.toISOString() ?? null,
    rejectedReason: draft.rejectedReason,
    variants: draft.variants.map((variant) => mapVariantToResponse(variant)),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

function mapSendToResponse(send: PrismaMessageSend): MessageSendResponse {
  return {
    id: send.id,
    leadId: send.leadId,
    messageDraftId: send.messageDraftId,
    messageVariantId: send.messageVariantId,
    channel: send.channel,
    provider: send.provider,
    providerMessageId: send.providerMessageId,
    status: send.status,
    idempotencyKey: send.idempotencyKey,
    scheduledAt: send.scheduledAt?.toISOString() ?? null,
    sentAt: send.sentAt?.toISOString() ?? null,
    deliveredAt: send.deliveredAt?.toISOString() ?? null,
    repliedAt: send.repliedAt?.toISOString() ?? null,
    failureCode: send.failureCode,
    failureReason: send.failureReason,
    createdAt: send.createdAt.toISOString(),
    updatedAt: send.updatedAt.toISOString(),
  };
}

function variantsInclude() {
  return {
    variants: {
      orderBy: [{ variantKey: 'asc' as const }, { createdAt: 'asc' as const }],
    },
  };
}

export class PrismaMessagingRepository extends StubMessagingRepository {
  override async generateMessageDraft(
    input: GenerateMessageDraftRequest,
  ): Promise<GenerateMessageDraftResponse> {
    const draft = await prisma.messageDraft.create({
      data: {
        leadId: input.leadId,
        icpProfileId: input.icpProfileId,
        scorePredictionId: input.scorePredictionId ?? null,
        promptVersion: input.promptVersion,
        generatedByModel: 'stub',
        groundingKnowledgeIds: input.knowledgeEntryIds,
        groundingContextJson: Prisma.JsonNull,
        approvalStatus: 'PENDING',
        variants: {
          create: [
            {
              variantKey: 'variant_a',
              channel: input.channel,
              bodyText: 'TODO: LLM generation',
              isSelected: false,
            },
            {
              variantKey: 'variant_b',
              channel: input.channel,
              bodyText: 'TODO: LLM generation',
              isSelected: false,
            },
          ],
        },
      },
      include: variantsInclude(),
    });

    return {
      draftId: draft.id,
      variantIds: draft.variants.map((variant) => variant.id),
    };
  }

  override async listMessageDrafts(query: ListMessageDraftsQuery): Promise<ListMessageDraftsResponse> {
    const where = {
      ...(query.leadId !== undefined ? { leadId: query.leadId } : {}),
      ...(query.icpProfileId !== undefined ? { icpProfileId: query.icpProfileId } : {}),
      ...(query.approvalStatus !== undefined ? { approvalStatus: query.approvalStatus } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.messageDraft.count({ where }),
      prisma.messageDraft.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: variantsInclude(),
      }),
    ]);

    return {
      items: rows.map((row) => mapDraftToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getMessageDraft(draftId: string): Promise<MessageDraftResponse> {
    const draft = await prisma.messageDraft.findUnique({
      where: { id: draftId },
      include: variantsInclude(),
    });
    if (!draft) {
      throw new MessagingNotFoundError('Message draft not found');
    }
    return mapDraftToResponse(draft);
  }

  override async approveMessageDraft(
    draftId: string,
    input: ApproveMessageDraftRequest,
  ): Promise<MessageDraftResponse> {
    try {
      const now = new Date();

      if (input.selectedVariantId !== undefined) {
        await prisma.messageVariant.updateMany({
          where: { messageDraftId: draftId },
          data: { isSelected: false },
        });
        await prisma.messageVariant.update({
          where: { id: input.selectedVariantId },
          data: { isSelected: true },
        });
      }

      const draft = await prisma.messageDraft.update({
        where: { id: draftId },
        data: {
          approvalStatus: 'APPROVED',
          approvedByUserId: input.approvedByUserId,
          approvedAt: now,
        },
        include: variantsInclude(),
      });

      return mapDraftToResponse(draft);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new MessagingNotFoundError('Message draft not found');
      }
      throw error;
    }
  }

  override async rejectMessageDraft(
    draftId: string,
    input: RejectMessageDraftRequest,
  ): Promise<MessageDraftResponse> {
    try {
      const draft = await prisma.messageDraft.update({
        where: { id: draftId },
        data: {
          approvalStatus: 'REJECTED',
          rejectedReason: input.rejectedReason,
        },
        include: variantsInclude(),
      });
      return mapDraftToResponse(draft);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new MessagingNotFoundError('Message draft not found');
      }
      throw error;
    }
  }

  override async sendMessage(input: SendMessageRequest): Promise<MessageSendResponse> {
    const variant = await prisma.messageVariant.findUnique({
      where: { id: input.messageVariantId },
      select: {
        channel: true,
        messageDraft: {
          select: { leadId: true },
        },
      },
    });
    if (!variant) {
      throw new MessagingNotFoundError('Message variant not found');
    }

    const send = await prisma.messageSend.create({
      data: {
        leadId: variant.messageDraft.leadId,
        messageDraftId: input.messageDraftId,
        messageVariantId: input.messageVariantId,
        channel: variant.channel,
        provider: 'RESEND',
        status: 'QUEUED',
        idempotencyKey: input.idempotencyKey,
        scheduledAt: input.scheduledAt !== undefined ? new Date(input.scheduledAt) : null,
      },
    });

    return mapSendToResponse(send);
  }

  override async listMessageSends(query: ListMessageSendsQuery): Promise<ListMessageSendsResponse> {
    const where = {
      ...(query.leadId !== undefined ? { leadId: query.leadId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
      ...(query.provider !== undefined ? { provider: query.provider } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            createdAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.messageSend.count({ where }),
      prisma.messageSend.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapSendToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getMessageSend(sendId: string): Promise<MessageSendResponse> {
    const send = await prisma.messageSend.findUnique({
      where: { id: sendId },
    });
    if (!send) {
      throw new MessagingNotFoundError('Message send not found');
    }
    return mapSendToResponse(send);
  }
}
