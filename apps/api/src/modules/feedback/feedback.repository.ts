import type {
  FeedbackEventResponse,
  FeedbackSummaryQuery,
  FeedbackSummaryResponse,
  IngestFeedbackEventRequest,
  IngestFeedbackEventResponse,
  ListFeedbackEventsQuery,
  ListFeedbackEventsResponse,
} from '@lead-flood/contracts';
import { Prisma, prisma } from '@lead-flood/db';

import { FeedbackNotImplementedError } from './feedback.errors.js';

export interface FeedbackRepository {
  ingestFeedbackEvent(input: IngestFeedbackEventRequest): Promise<IngestFeedbackEventResponse>;
  listFeedbackEvents(query: ListFeedbackEventsQuery): Promise<ListFeedbackEventsResponse>;
  getFeedbackSummary(query: FeedbackSummaryQuery): Promise<FeedbackSummaryResponse>;
}

export class StubFeedbackRepository implements FeedbackRepository {
  async ingestFeedbackEvent(_input: IngestFeedbackEventRequest): Promise<IngestFeedbackEventResponse> {
    throw new FeedbackNotImplementedError('TODO: ingest feedback event persistence');
  }

  async listFeedbackEvents(_query: ListFeedbackEventsQuery): Promise<ListFeedbackEventsResponse> {
    throw new FeedbackNotImplementedError('TODO: list feedback events persistence');
  }

  async getFeedbackSummary(_query: FeedbackSummaryQuery): Promise<FeedbackSummaryResponse> {
    throw new FeedbackNotImplementedError('TODO: get feedback summary persistence');
  }
}

function mapFeedbackEventToResponse(event: {
  id: string;
  leadId: string;
  messageSendId: string | null;
  eventType: string;
  source: string;
  providerEventId: string | null;
  dedupeKey: string;
  payloadJson: unknown;
  replyText: string | null;
  replyClassification: string | null;
  occurredAt: Date;
  createdAt: Date;
}): FeedbackEventResponse {
  return {
    id: event.id,
    leadId: event.leadId,
    messageSendId: event.messageSendId,
    eventType: event.eventType as FeedbackEventResponse['eventType'],
    source: event.source as FeedbackEventResponse['source'],
    providerEventId: event.providerEventId,
    dedupeKey: event.dedupeKey,
    payloadJson: event.payloadJson ?? null,
    replyText: event.replyText,
    replyClassification: event.replyClassification,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

function countByEventType(
  groups: Array<{ eventType: string; _count: { id: number } }>,
  type: string,
): number {
  return groups.find((group) => group.eventType === type)?._count.id ?? 0;
}

export class PrismaFeedbackRepository extends StubFeedbackRepository {
  override async ingestFeedbackEvent(input: IngestFeedbackEventRequest): Promise<IngestFeedbackEventResponse> {
    const dedupeKey = input.providerEventId ?? `${input.leadId}:${input.eventType}:${input.occurredAt}`;

    const data = {
      leadId: input.leadId,
      messageSendId: input.messageSendId ?? null,
      eventType: input.eventType,
      source: input.source,
      providerEventId: input.providerEventId ?? null,
      dedupeKey,
      payloadJson: input.payloadJson !== undefined
        ? (JSON.parse(JSON.stringify(input.payloadJson)) as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      occurredAt: new Date(input.occurredAt),
    };

    const event = await prisma.feedbackEvent.upsert({
      where: { dedupeKey },
      create: data,
      update: {},
    });

    return {
      feedbackEventId: event.id,
      dedupeKey: event.dedupeKey,
    };
  }

  override async listFeedbackEvents(query: ListFeedbackEventsQuery): Promise<ListFeedbackEventsResponse> {
    const where: Prisma.FeedbackEventWhereInput = {
      ...(query.leadId !== undefined ? { leadId: query.leadId } : {}),
      ...(query.messageSendId !== undefined ? { messageSendId: query.messageSendId } : {}),
      ...(query.eventType !== undefined ? { eventType: query.eventType } : {}),
      ...(query.source !== undefined ? { source: query.source } : {}),
      ...(query.from !== undefined || query.to !== undefined
        ? {
            occurredAt: {
              ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
              ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.feedbackEvent.count({ where }),
      prisma.feedbackEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => mapFeedbackEventToResponse(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  override async getFeedbackSummary(query: FeedbackSummaryQuery): Promise<FeedbackSummaryResponse> {
    const dateFilter: Prisma.FeedbackEventWhereInput['occurredAt'] = {
      ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
      ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
    };

    let leadIdFilter: Prisma.FeedbackEventWhereInput['leadId'];

    if (query.icpProfileId !== undefined) {
      const discoveryRecords = await prisma.leadDiscoveryRecord.findMany({
        where: { icpProfileId: query.icpProfileId },
        select: { leadId: true },
        distinct: ['leadId'],
      });
      leadIdFilter = { in: discoveryRecords.map((record) => record.leadId) };
    }

    const where: Prisma.FeedbackEventWhereInput = {
      ...(Object.keys(dateFilter ?? {}).length > 0 ? { occurredAt: dateFilter } : {}),
      ...(leadIdFilter !== undefined ? { leadId: leadIdFilter } : {}),
    };

    const groups = await prisma.feedbackEvent.groupBy({
      by: ['eventType'],
      where,
      _count: { id: true },
    });

    const totalEvents = groups.reduce((sum, group) => sum + group._count.id, 0);

    return {
      from: query.from ?? null,
      to: query.to ?? null,
      totalEvents,
      repliedCount: countByEventType(groups, 'REPLIED'),
      meetingBookedCount: countByEventType(groups, 'MEETING_BOOKED'),
      dealWonCount: countByEventType(groups, 'DEAL_WON'),
      dealLostCount: countByEventType(groups, 'DEAL_LOST'),
      unsubscribedCount: countByEventType(groups, 'UNSUBSCRIBED'),
      bouncedCount: countByEventType(groups, 'BOUNCED'),
    };
  }
}
