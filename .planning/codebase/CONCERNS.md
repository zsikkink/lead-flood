# Codebase Concerns

**Analysis Date:** 2026-02-17

## Tech Debt

**Stub/Unimplemented Repositories (Critical):**
- Issue: 8 repository modules contain stub implementations that throw `NotImplementedError` exceptions. These are placeholder methods that prevent core pipeline functionality from executing.
- Files:
  - `apps/api/src/modules/learning/learning.repository.ts` (7 stub methods)
  - `apps/api/src/modules/discovery/discovery.repository.ts` (4 stub methods)
  - `apps/api/src/modules/scoring/scoring.repository.ts` (7 stub methods)
  - `apps/api/src/modules/icp/icp.repository.ts` (8 stub methods)
  - `apps/api/src/modules/enrichment/enrichment.repository.ts` (5 stub methods)
  - `apps/api/src/modules/messaging/messaging.repository.ts` (8 stub methods)
  - `apps/api/src/modules/feedback/feedback.repository.ts` (3 stub methods)
  - `apps/api/src/modules/analytics/analytics.repository.ts` (5 stub methods)
- Impact: Any request to Learning, Scoring, ICP endpoints will fail at runtime. Discovery status queries will fail. Message draft operations will fail. Feedback operations will fail. These are blocking issues for MVP.
- Fix approach: Implement persistence layer for each module. Each repository needs database interactions using Prisma. Start with Learning and ICP (blocking discovery scoring workflow), then proceed to Messaging (WhatsApp integration).

**Excessive TODO Comments (High):**
- Issue: 132 TODO/FIXME comments scattered across service and repository layers indicating missing business logic.
- Files: Throughout `apps/api/src/modules/` across all service files
- Impact: Indicates incomplete feature implementation. Business logic is stubbed out.
- Fix approach: Prioritize by pipeline stage: Discovery → Enrichment → Scoring → Messaging → Learning. Group TODOs by module and address in batches.

**Type Safety Issues (Medium):**
- Issue: 172 instances of unsafe type casts (`as unknown as Type`, `as any`) primarily in test files, but also in production code.
- Files:
  - `apps/worker/src/outbox-dispatcher.test.ts` (3 casts)
  - `apps/worker/test/integration/` tests (12+ casts)
  - `apps/worker/src/schedules.ts` (5 casts using `satisfies`)
- Impact: Reduces type safety during testing and makes mocking harder. Could mask bugs in job dispatch.
- Fix approach: Create proper typed mock builders for PgBoss and fetch. Replace `as unknown as Type` with proper type constructors. Use Vitest's type-safe mocking.

## Known Bugs

**Outbox Dead Letter Queue Accumulation Risk:**
- Symptoms: Events that fail 5 times are moved to dead letter queue (`dead_letter` status) but are never retried or processed
- Files: `apps/worker/src/outbox-dispatcher.ts` (lines 93-98)
- Trigger: Any job that fails 5 times consecutively. Rate-limited APIs (Apollo, LinkedIn, Apify) with quota exhaustion could trigger this.
- Workaround: None. Dead lettered events are lost. Manual database intervention required to retry.
- Fix: Add monitoring/alerting for dead_letter events. Consider implementing exponential backoff decay or queue-specific retry policies.

**Stale Processing Window Could Miss Events:**
- Symptoms: Events marked as `processing` but not updated for 5 minutes are re-processed, but intermediate crashes may cause duplicate processing.
- Files: `apps/worker/src/outbox-dispatcher.ts` (line 47, STALE_PROCESSING_WINDOW_MS = 5 * 60 * 1000)
- Trigger: Worker crashes during processing. Race condition if two workers claim same event.
- Workaround: Ensure idempotency keys are used for all outgoing API calls.
- Fix: Implement advisory locks on outbox event processing or use pg-boss's native transaction support.

## Security Considerations

**Insufficient API Request Validation for Discovery:**
- Risk: Discovery endpoints accept filter arrays (industries, countries, technologies) with no validation on array size or string length. Could allow injection of large payloads or SQL-like constructs passed to external APIs.
- Files:
  - `apps/api/src/modules/discovery/discovery.routes.ts`
  - `apps/worker/src/jobs/discovery.run.job.ts` (query building logic)
- Current mitigation: External APIs (Apollo, Google Search, Apify) likely validate inputs, but no first-line validation in Lead-Flood.
- Recommendations: Add Zod validators for array bounds (max 50 items per filter), string length limits (max 256 chars), and character whitelist for search terms.

**Raw SQL Health Check Vulnerable to Connection Strings:**
- Risk: `SELECT 1` health check query executed with credentials in DATABASE_URL. If DATABASE_URL is logged or exposed, credentials leak.
- Files:
  - `apps/api/src/index.ts` (line 37)
  - `apps/api/test/e2e/lead-flow.e2e.test.ts` (line 128)
- Current mitigation: DATABASE_URL is environment variable (not committed to git).
- Recommendations: Use Prisma's built-in health check API or connection validation instead of raw SQL. Never log DATABASE_URL.

**No Rate Limiting on API Endpoints:**
- Risk: Discovery/enrichment endpoints can be hit repeatedly, causing downstream API quota exhaustion against Apollo, Google Search, LinkedIn.
- Files: `apps/api/src/server.ts`, `apps/api/src/modules/discovery/discovery.routes.ts`
- Current mitigation: None. Relies on Zbooni user trust.
- Recommendations: Implement per-user rate limiting (e.g., 10 discovery runs/hour). Add quota tracking per discovery provider.

**Insufficient Input Sanitization for OpenAI Integration:**
- Risk: Company data from discovery passed to OpenAI for enrichment/scoring without sanitization. HTML in company descriptions must be escaped.
- Files: `apps/worker/src/jobs/enrichment.run.job.ts`, `apps/worker/src/jobs/scoring.compute.job.ts`
- Current mitigation: CLAUDE.md mentions "Sanitize HTML: JSON.stringify(html).slice(1,-1)" but this is not consistently applied.
- Recommendations: Create utility function `sanitizeHtmlForOpenAI()` and use throughout enrichment/scoring. Validate OpenAI responses against expected schema.

## Performance Bottlenecks

**ICP Rule Evaluation is O(n*m) Complexity:**
- Problem: For each discovered lead, all rules are evaluated (in `icp.repository.ts` evaluateRule function). With 100+ rules and large result sets, this becomes slow.
- Files: `apps/api/src/modules/icp/icp.repository.ts` (lines 86-133)
- Cause: Sequential rule matching without indexing or early exit optimization.
- Improvement path: Implement rule compilation to SQL or in-database evaluation. Cache rule evaluation context. Pre-compile rule AST.

**Discovery Job Processes Leads Sequentially:**
- Problem: Each discovered lead is normalized, deduplicated, and stored one at a time in the discovery.run.job.ts. With 100+ leads, this causes N database round trips.
- Files: `apps/worker/src/jobs/discovery.run.job.ts` (lines 150+)
- Cause: No batch insert implementation.
- Improvement path: Collect leads into batches of 50, then bulk insert via `prisma.discoveredLead.createMany()`. This reduces database calls from N to N/50.

**No Connection Pooling Configuration Visible:**
- Problem: Prisma uses default connection pool (5 connections). Under load, connection exhaustion may occur.
- Files: All Prisma usage across API and worker
- Cause: No explicit `connection_limit` set in DATABASE_URL or prisma client configuration.
- Improvement path: Set connection_limit to 20-50 based on expected concurrency. Monitor with `prisma metrics`.

**Discovery Rate Limits Not Cascaded:**
- Problem: When Apollo/LinkedIn/Google Search API hits rate limit, entire discovery.run.job stops. No graceful degradation to next provider.
- Files: `apps/worker/src/jobs/discovery.run.job.ts`
- Cause: RateLimitError thrown but not caught with fallback logic.
- Improvement path: Implement provider fallback: if Apollo 429, try Google Search. If all fail, mark run as PARTIAL and stop.

## Fragile Areas

**Discovery Query Building is Tightly Coupled to Filter Model:**
- Files: `apps/worker/src/jobs/discovery.run.job.ts` (lines 350-442 for Google, LinkedIn, CompanySearch query building)
- Why fragile: Query syntax differs per provider. Changing filter types requires updating 3+ query builders.
- Safe modification: Abstract query building into provider-specific adapters (GoogleQueryBuilder, LinkedInQueryBuilder). Use type-safe filter-to-query mapping.
- Test coverage: 17 test files found, but integration tests for discovery query building are minimal. Add snapshot tests for each provider query.

**Outbox Dispatcher State Machine Has Missing Transitions:**
- Files: `apps/worker/src/outbox-dispatcher.ts`
- Why fragile: Status enum is `pending | processing | sent | failed | dead_letter`. Logic for `processing → sent` is missing; only `processing → failed` exists.
- Safe modification: Explicitly document all valid state transitions. Add assertion before every status update.
- Test coverage: `apps/worker/src/outbox-dispatcher.test.ts` has 202 lines but gaps in state transition testing.

**ICP Repository Filter Context Building is Complex:**
- Files: `apps/api/src/modules/icp/icp.repository.ts` (lines 150-200+)
- Why fragile: Building filter context from rules involves multiple helper functions (uniqueStrings, normalizeComparable, evaluateRule). Adding new field types requires touching multiple functions.
- Safe modification: Consolidate rule→filter logic into single visitor pattern function. Add type-safe field key registry.
- Test coverage: No dedicated tests for filter context building found. Add unit tests for each field type mapping.

## Scaling Limits

**Database Indexes Missing on High-Query Tables:**
- Current capacity: Outbox event query uses two indexes: `status_createdAt` and `nextAttemptAt`.
- Limit: With >1M outbox events, the `status_createdAt` scan becomes slow. No indexes on `lead.email` (fast lookup is critical for deduplication).
- Scaling path: Add missing indexes: `lead(email, icpProfileId)`, `discoveredLead(email, source)`, `jobExecution(type, status, createdAt)`. Implement index monitoring via pg_stat_statements.

**pg-boss Single Schema Bottleneck:**
- Current capacity: One pg-boss schema shared across API and Worker.
- Limit: High job volume (>10k/day) could cause table locks during job claiming.
- Scaling path: Split pg-boss schema into sharded schemas (discovery.run, enrichment.run, scoring.compute each in separate schema). Distribute workers by schema.

**No Horizontal Scaling of Worker Processes:**
- Current capacity: Single worker instance processes all job types sequentially.
- Limit: With 1000+ discovery leads/day, enrichment job queue backs up while discovery jobs are processing.
- Scaling path: Run separate worker processes per job type (discovery-worker, enrichment-worker, scoring-worker). Use process manager (PM2) or Kubernetes for orchestration.

**Bulk API Requests Not Batched:**
- Current capacity: Each discovered lead is enriched/scored individually against OpenAI/external APIs.
- Limit: 1000 leads = 1000 API calls. This exceeds Trengo (~50/day) and strains OpenAI quota.
- Scaling path: Batch enrichment requests (e.g., 20 leads per OpenAI call). Implement batch processing in enrichment.run.job.ts.

## Dependencies at Risk

**pg-boss Version 10.4.2 Has No Recent Updates:**
- Risk: Older job queue library. Security patches may be slow.
- Impact: If critical pg-boss vulnerability found, upgrade path unclear.
- Migration plan: No immediate risk, but monitor for abandonment. Fallback: Migrate to Bull/BullMQ with Redis backend (more actively maintained).

**OpenAI SDK Version Not Pinned:**
- Risk: If package.json uses `^x.y.z` or `*`, breaking API changes could occur on `pnpm install`.
- Impact: Enrichment/scoring jobs fail silently if OpenAI client changes.
- Migration plan: Audit package.json to ensure OpenAI SDK is exactly pinned (e.g., `4.52.0` not `^4.0.0`). Lock all critical external SDK versions.

## Missing Critical Features

**No Audit Logging for ICP Changes:**
- Problem: ICP profile updates (qualification rules, target industries) are not logged. Zbooni cannot track who changed what and when.
- Blocks: Compliance, debugging, user trust.
- Solution: Implement audit log table. Capture user_id, action, old_value, new_value, timestamp on every ICP update.

**No Idempotency Keys on Messaging Endpoints:**
- Problem: WhatsApp sends to Trengo endpoint can be retried by network layer, causing duplicate messages.
- Blocks: CLAUDE.md mentions "Idempotency key per message" but not implemented.
- Solution: Add idempotency_key field to message sends. Check for duplicate before calling Trengo API.

**No Monitoring for Webhook Callbacks from Trengo:**
- Problem: Trengo webhooks (message delivery status, customer replies) are not handled.
- Blocks: Feedback loop closure (lead replies flow back into system).
- Solution: Implement POST `/webhooks/trengo` endpoint. Parse webhook signature. Update lead status based on delivery/reply events.

## Test Coverage Gaps

**Untested Discovery Job Error Paths:**
- What's not tested: Error handling for RateLimitError, network timeouts, malformed responses from Apollo/Google/LinkedIn.
- Files: `apps/worker/src/jobs/discovery.run.job.ts`
- Risk: If Apollo API returns 429, job crashes without proper retry. If Google Search returns HTML instead of JSON, silent failure.
- Priority: High. Add integration tests mocking rate limit responses.

**No E2E Tests for Full Pipeline:**
- What's not tested: Full journey: Create ICP → Run Discovery → Enrich leads → Score leads → Generate messages → Approve & send → Collect feedback.
- Files: Tests exist (`apps/api/test/e2e/lead-flow.e2e.test.ts`) but only cover lead creation, not full pipeline.
- Risk: Regressions in inter-module communication discovered only in production.
- Priority: High. Extend E2E test to cover all pipeline stages.

**Insufficient Outbox Retry Testing:**
- What's not tested: Behavior when outbox dispatcher encounters database deadlocks, connection timeouts, or pg-boss schema issues.
- Files: `apps/worker/src/outbox-dispatcher.test.ts` (202 lines, but scenarios are limited)
- Risk: Production outages if outbox dispatcher fails silently.
- Priority: Medium. Add chaos engineering tests (kill database, restart worker mid-dispatch).

**No Test Coverage for ICP Rule Evaluation Edge Cases:**
- What's not tested: Null values in featureValue, empty arrays in IN operator, special characters in CONTAINS comparisons.
- Files: `apps/api/src/modules/icp/icp.repository.ts` (evaluateRule function)
- Risk: ICP rules produce unexpected false positives, filtering out valid leads.
- Priority: Medium. Add parametrized tests for all operator types with edge cases.

---

*Concerns audit: 2026-02-17*
