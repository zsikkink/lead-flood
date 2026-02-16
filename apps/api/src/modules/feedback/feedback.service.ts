import type {
  FeedbackSummaryQuery,
  FeedbackSummaryResponse,
  IngestFeedbackEventRequest,
  IngestFeedbackEventResponse,
  ListFeedbackEventsQuery,
  ListFeedbackEventsResponse,
} from '@lead-flood/contracts';

import type { FeedbackRepository } from './feedback.repository.js';

export interface FeedbackService {
  ingestFeedbackEvent(input: IngestFeedbackEventRequest): Promise<IngestFeedbackEventResponse>;
  listFeedbackEvents(query: ListFeedbackEventsQuery): Promise<ListFeedbackEventsResponse>;
  getFeedbackSummary(query: FeedbackSummaryQuery): Promise<FeedbackSummaryResponse>;
}

export function buildFeedbackService(repository: FeedbackRepository): FeedbackService {
  return {
    async ingestFeedbackEvent(input) {
      // TODO: validate dedupe keys and source trust levels.
      return repository.ingestFeedbackEvent(input);
    },
    async listFeedbackEvents(query) {
      // TODO: include optional grouping in response.
      return repository.listFeedbackEvents(query);
    },
    async getFeedbackSummary(query) {
      // TODO: join summary with messaging funnel context.
      return repository.getFeedbackSummary(query);
    },
  };
}
