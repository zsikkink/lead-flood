import type {
  FeedbackSummaryQuery,
  FeedbackSummaryResponse,
  IngestFeedbackEventRequest,
  IngestFeedbackEventResponse,
  ListFeedbackEventsQuery,
  ListFeedbackEventsResponse,
} from '@lead-flood/contracts';

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
