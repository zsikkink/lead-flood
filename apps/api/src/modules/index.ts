import type { FastifyInstance } from 'fastify';

import { registerAnalyticsRoutes } from './analytics/analytics.routes.js';
import { registerDiscoveryRoutes } from './discovery/discovery.routes.js';
import { registerDiscoveryAdminRoutes } from './discovery-admin/discovery-admin.routes.js';
import { registerEnrichmentRoutes } from './enrichment/enrichment.routes.js';
import { registerFeedbackRoutes } from './feedback/feedback.routes.js';
import { registerIcpRoutes } from './icp/icp.routes.js';
import { registerLearningRoutes } from './learning/learning.routes.js';
import { registerMessagingRoutes } from './messaging/messaging.routes.js';
import { registerScoringRoutes } from './scoring/scoring.routes.js';

export function registerApiModules(app: FastifyInstance): void {
  registerIcpRoutes(app);
  registerDiscoveryRoutes(app);
  registerDiscoveryAdminRoutes(app);
  registerEnrichmentRoutes(app);
  registerScoringRoutes(app);
  registerLearningRoutes(app);
  registerMessagingRoutes(app);
  registerFeedbackRoutes(app);
  registerAnalyticsRoutes(app);
}
