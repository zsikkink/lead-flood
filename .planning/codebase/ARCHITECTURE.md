# Architecture

**Analysis Date:** 2025-02-17

## Pattern Overview

**Overall:** Modular monorepo with microservice-like job processing architecture.

The system follows a **pipeline pattern** where the API layer handles synchronous REST operations and orchestration, while the Worker layer executes asynchronous jobs through a message queue (pg-boss). Data flows through discovery → enrichment → feature computation → scoring → messaging pipeline.

**Key Characteristics:**
- **Outbox Pattern**: API writes transactional events to `OutboxEvent` table; Worker continuously dispatches pending events to job queues
- **Job-based Processing**: Long-running operations (discovery, enrichment, scoring) execute as pg-boss jobs with retry strategies
- **Modular Domain Logic**: Each feature area (discovery, enrichment, scoring, ICP, messaging) is isolated in separate modules
- **Dependency Injection**: Adapters and services are injected at startup; core business logic is pure/testable
- **Contract-Driven**: Shared `@lead-flood/contracts` package defines all API schemas (request/response), provider types, and domain enums

## Layers

**API Layer (Express/Fastify):**
- Purpose: Handle HTTP requests, validate inputs with Zod schemas, orchestrate business logic
- Location: `apps/api/src/`
- Contains: Route handlers, service layer, repository layer, error handling
- Depends on: `@lead-flood/db`, `@lead-flood/contracts`, `@lead-flood/observability`
- Used by: Web frontend, external clients

**Module Layer (API):**
- Purpose: Encapsulate domain-specific logic (ICP, Discovery, Enrichment, Scoring, Messaging, Learning, Analytics)
- Location: `apps/api/src/modules/*/`
- Pattern: Each module has `.routes.ts` (HTTP handlers), `.service.ts` (business logic), `.repository.ts` (data access), `.errors.ts` (custom exceptions)
- Example: `apps/api/src/modules/discovery/discovery.routes.ts` → `discovery.service.ts` → `discovery.repository.ts`

**Worker Layer (Job Processing):**
- Purpose: Execute long-running jobs asynchronously via pg-boss message queue
- Location: `apps/worker/src/`
- Contains: Job handlers, queue configuration, outbox dispatcher, adapter initialization
- Depends on: `@lead-flood/db`, `@lead-flood/providers`, `@lead-flood/observability`
- Used by: API via outbox events, scheduled tasks

**Job Handlers:**
- Purpose: Implement async job logic for pipeline stages
- Location: `apps/worker/src/jobs/`
- Files:
  - `discovery.run.job.ts` - Query external providers (Apollo, Google, LinkedIn, etc.)
  - `enrichment.run.job.ts` - Enrich leads with email, phone, etc.
  - `features.compute.job.ts` - Extract and normalize features from discovery/enrichment
  - `scoring.compute.job.ts` - Apply ICP rules and generate predictions
  - `labels.generate.job.ts` - Generate training labels from user feedback
  - `model.train.job.ts` - Train logistic regression model
  - `model.evaluate.job.ts` - Evaluate model against test set
  - `message.generate.job.ts` - Generate personalized WhatsApp messages with LLM
  - `message.send.job.ts` - Send messages via Trengo API
  - `analytics.rollup.job.ts` - Compute daily metrics (valid emails, domain matches, etc.)

**Persistence Layer:**
- Purpose: Database abstraction and ORM
- Location: `packages/db/`
- Contains: Prisma schema, migrations, client wrapper
- Exports: `prisma` client, `Prisma` types

**Adapter Layer (External Integrations):**
- Purpose: Encapsulate third-party API clients
- Location: `packages/providers/src/`
- Adapters:
  - **Discovery**: `ApolloDiscoveryAdapter`, `GoogleSearchAdapter`, `LinkedInScrapeAdapter`, `CompanySearchAdapter`
  - **Enrichment**: `PdlEnrichmentAdapter`, `HunterAdapter`, `ClearbitAdapter`, `PublicWebLookupAdapter`
- Pattern: Each adapter implements consistent interface with error handling, rate limiting, response normalization

**Contract Layer:**
- Purpose: Shared type definitions, API schemas, domain enums
- Location: `packages/contracts/src/`
- Contains: Zod schemas for all routes, TypeScript types for job payloads, provider types, enums (DiscoveryProvider, EnrichmentProvider, LeadStatus, etc.)

**Observability Layer:**
- Purpose: Logging and monitoring utilities
- Location: `packages/observability/src/`
- Exports: `createLogger()` function for structured logging

**UI/Web Layer:**
- Purpose: Next.js frontend for Zbooni sales team
- Location: `apps/web/app/`
- Uses: API client to communicate with backend

## Data Flow

**Lead Discovery & Enrichment Pipeline:**

1. **User Creates Discovery Run** (API synchronous)
   - POST `/v1/discovery/runs` with ICP profile, provider, limit
   - API validates request, creates `DiscoveryRun` record
   - Enqueues `discovery.run` job to pg-boss

2. **Worker Processes Discovery** (Async)
   - `handleDiscoveryRunJob()` in `apps/worker/src/jobs/discovery.run.job.ts`
   - Calls appropriate adapter (Apollo, Google, LinkedIn) based on provider
   - For each discovered person/company, creates `LeadDiscoveryRecord`
   - If new lead detected (not in DB), creates `Lead` record
   - Enqueues `enrichment.run` job for next stage

3. **Worker Enriches Lead** (Async)
   - `handleEnrichmentRunJob()` in `apps/worker/src/jobs/enrichment.run.job.ts`
   - Calls enrichment adapters (PDL, Hunter, Clearbit) to get email/phone/profile
   - Creates `LeadEnrichmentRecord` with normalized payload
   - Enqueues `features.compute` job

4. **Worker Computes Features** (Async)
   - `handleFeaturesComputeJob()` in `apps/worker/src/jobs/features.compute.job.ts`
   - Extracts features from discovery + enrichment records
   - Applies hard filters from ICP profile
   - Creates `LeadFeatureSnapshot` with feature vector hash
   - Enqueues `scoring.compute` job

5. **Worker Scores Lead** (Async)
   - `handleScoringComputeJob()` in `apps/worker/src/jobs/scoring.compute.job.ts`
   - Evaluates ICP rules against features
   - Generates `LeadScorePrediction` with score band (LOW/MEDIUM/HIGH)
   - Optionally enqueues `message.generate` job if score is HIGH

6. **User Views Results** (API synchronous)
   - GET `/v1/leads` - Lists all leads with latest discovery, enrichment, score records
   - GET `/v1/leads/:id` - Single lead detail with full record history
   - POST `/v1/discovery/runs/:id/inspect` - Inspection tool for debugging discovery logic

**Outbox Pattern:**

1. API creates `OutboxEvent` in same transaction as business entity (Lead, JobExecution)
2. API attempts immediate queue publish; if fails, outbox event stays in DB
3. Worker runs `dispatchPendingOutboxEvents()` every 5 seconds (runs/outbox-dispatcher.ts)
4. Dispatcher finds events with status = 'pending', 'failed', or stale 'processing'
5. Retries with exponential backoff (max 5 attempts)
6. On success, marks event as 'sent'
7. On failure after max attempts, promotes to 'dead_letter'

**State Management:**

- **Lead Status**: `new` → `processing` → `enriched` or `failed`
- **JobExecution Status**: `queued` → `running` → `completed` or `failed`
- **OutboxEvent Status**: `pending` → `processing` → `sent` or `dead_letter`/`failed`
- **DiscoveryRecord Status**: `DISCOVERED`, `DUPLICATE`, `REJECTED`, `ERROR`
- **EnrichmentStatus**: `PENDING` → `COMPLETED` or `FAILED`

## Key Abstractions

**IcpProfile:**
- Purpose: Represents customer's ideal customer profile with industry/country filters, company size limits, required technologies
- Location: `apps/api/src/modules/icp/`
- Usage: Filters leads during discovery, applies hard filters during feature computation, generates labels for training
- Example: `{ name: 'FinTech in UAE', targetIndustries: ['financial-services'], targetCountries: ['AE'], minCompanySize: 50 }`

**QualificationRule:**
- Purpose: Encodes business logic for ICP matching (weighted scoring or hard filters)
- Location: Database model `QualificationRule`
- Types: `WEIGHTED` (contributes to score) or `HARD_FILTER` (must pass)
- Pattern: `{ fieldKey: 'companyEmployee', operator: 'GTE', value: 100, weight: 0.3 }`

**DiscoveryRunJobPayload:**
- Purpose: Serializable request to execute discovery
- Files: `apps/api/src/modules/discovery/discovery.service.ts`, `apps/worker/src/jobs/discovery.run.job.ts`
- Fields: `icpProfileId`, `provider`, `limit`, `cursor`, `runId`, `requestedByUserId`
- Pattern: Cursor-based pagination for multi-page provider results

**EnrichmentRunJobPayload:**
- Purpose: Serializable request to enrich a lead
- Files: `apps/worker/src/jobs/enrichment.run.job.ts`
- Fields: `leadId`, `discoveryRecordId`, `provider`, `icpProfileId`, `correlationId`

**LeadFeatureSnapshot:**
- Purpose: Immutable snapshot of extracted features at a point in time
- Contains: Feature vector (JSON), hash, snapshot version, source version
- Used for: Model training, reproducibility, audit trail
- Unique constraint: `(leadId, icpProfileId, snapshotVersion, sourceVersion, featureVectorHash)`

**ModelVersion:**
- Purpose: Represents trained logistic regression model at a point in time
- Fields: Model type, stage (SHADOW/ACTIVE/ARCHIVED), training config, metrics
- Lifecycle: Created from `TrainingRun`, promoted through stages for A/B testing

## Entry Points

**API Entry:**
- Location: `apps/api/src/index.ts`
- Triggers: Application startup, `pnpm dev` or `node dist/index.js`
- Responsibilities:
  - Loads environment config
  - Initializes Prisma client
  - Creates pg-boss instance for outbox publishing
  - Builds Fastify server with routes
  - Registers error handler and 404 handler
  - Listens on port 5050

**Worker Entry:**
- Location: `apps/worker/src/index.ts`
- Triggers: Application startup, `pnpm dev` or `node dist/index.js`
- Responsibilities:
  - Loads environment config
  - Initializes Prisma client
  - Creates pg-boss instance for job processing
  - Creates provider adapters (Apollo, Hunter, PDL, etc.) with API keys
  - Ensures queues exist, registers schedules
  - Registers job handlers for each queue
  - Runs outbox dispatcher loop (every 5 seconds)
  - Listens for SIGINT/SIGTERM for graceful shutdown

**Web Entry:**
- Location: `apps/web/app/page.tsx`
- Triggers: `pnpm dev` or Next.js server start
- Responsibilities: Renders dashboard, fetches leads/runs from API

## Error Handling

**Strategy:** Classified errors with per-queue retry limits.

**Patterns:**

**API Layer:**
- Custom error classes extend `Error` with `.name` property
- Example: `LeadAlreadyExistsError`, `DiscoveryRunNotFoundError`, `IcpNotFoundError`
- Route handlers catch errors, map to HTTP status codes (400, 404, 409, 500)
- Unhandled errors caught by Fastify global error handler, logged as 500

**Job Layer:**
- Retryable errors: Re-throw from job handler; pg-boss retries based on queue config
- Permanent errors: Catch and mark job execution as failed, don't re-throw
- Rate limit errors (from providers): Classified as retryable, pg-boss backs off
- Database errors: Catch, log, promote to dead letter if can't recover

**Example from enrichment.run.job.ts:**
```typescript
catch (error: unknown) {
  if (error instanceof HunterRateLimitError) {
    throw error; // Retryable - pg-boss will retry
  }
  // Permanent error - mark job failed
  await prisma.jobExecution.update({
    where: { id: jobId },
    data: { status: 'failed', error: errorMessage }
  });
}
```

**Provider Adapters:**
- Throw domain-specific errors: `ApolloRateLimitError`, `GoogleSearchRateLimitError`, etc.
- Normalize API responses; empty results are valid, not errors (e.g., no Apollo people found is OK)
- Network timeouts caught as error, not fatal

## Cross-Cutting Concerns

**Logging:**
- Framework: `@lead-flood/observability` with `createLogger()`
- Approach: Structured logging with context object + message
- Usage: `logger.info({ leadId, provider }, 'Started enrichment')`
- Fields: `service`, `env`, `level`, `requestId` (API), `correlationId` (jobs)

**Validation:**
- Framework: Zod schemas in `@lead-flood/contracts`
- Usage: All API requests validated with `safeParse()` before reaching handlers
- Pattern: Invalid requests return 400 with error message
- Job payloads validated on deserialization from pg-boss

**Authentication:**
- Method: JWT access token + refresh token
- Service: `buildAuthenticateUser()` in `apps/api/src/auth/service.ts`
- Flow: Login endpoint validates email/password, returns { accessToken, refreshToken, expiresAt }
- Persistence: Sessions stored in `Session` table linked to `User`
- TODO: Route guards not yet implemented (feature incomplete)

**Idempotency:**
- Implementation: pg-boss `singletonKey` option
- Pattern: `singletonKey: 'discovery.run:${runId}'` prevents duplicate job enqueue
- Ensures: Single-run discovery can't be triggered twice concurrently

**Rate Limiting:**
- Per-adapter: `ApolloDiscoveryAdapter` has `minRequestIntervalMs` (rate limit delay between requests)
- Approach: Sleep between requests to avoid exceeding provider limits
- Provider errors: Classified as retryable; pg-boss backs off

---

*Architecture analysis: 2025-02-17*
