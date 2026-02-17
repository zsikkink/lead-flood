# Codebase Structure

**Analysis Date:** 2025-02-17

## Directory Layout

```
lead-flood/
├── apps/                           # Runnable applications
│   ├── api/                        # REST API server (Fastify)
│   ├── web/                        # Next.js dashboard frontend
│   └── worker/                     # Async job processor (pg-boss)
├── packages/                       # Shared libraries
│   ├── contracts/                  # API schemas, types, enums (Zod)
│   ├── db/                         # Prisma ORM, migrations, client
│   ├── observability/              # Logging utilities
│   ├── providers/                  # External API adapters (Apollo, Hunter, etc.)
│   ├── config/                     # ESLint/TypeScript shared config
│   ├── testkit/                    # Testing utilities
│   └── ui/                         # React UI components
├── scripts/                        # Utility scripts
│   ├── learning/                   # ML training scripts
│   └── icp/                        # ICP seeding scripts
├── infra/                          # Infrastructure config
│   └── docker/                     # Docker Compose for local PostgreSQL
├── docs/                           # Documentation
├── .planning/                      # GSD planning artifacts
│   └── codebase/                   # Architecture analysis documents (this)
├── pnpm-workspace.yaml             # Monorepo workspace definition
├── package.json                    # Root package.json, Turbo config
└── turbo.json                      # Turbo build orchestration
```

## Directory Purposes

**apps/api/**
- Purpose: RESTful API server that handles lead operations and orchestrates background jobs
- Contains: Route handlers, service layer, repositories, auth, env config
- Key files: `src/index.ts` (entry point), `src/server.ts` (Fastify setup)
- Dependencies: `@lead-flood/db`, `@lead-flood/contracts`, `@lead-flood/observability`

**apps/api/src/modules/**
- Purpose: Domain-driven modules for each feature area
- Structure: Each module has `*.routes.ts`, `*.service.ts`, `*.repository.ts`, `*.errors.ts`
- Modules:
  - `discovery/` - Trigger and inspect discovery runs against external providers
  - `enrichment/` - View enrichment results (triggered from worker)
  - `scoring/` - Manage score predictions and inspect model performance
  - `icp/` - Create/update ideal customer profiles and qualification rules
  - `messaging/` - WhatsApp message generation and send history
  - `learning/` - Feedback collection for model training
  - `feedback/` - User feedback on lead quality
  - `analytics/` - Quality metrics and rollup statistics

**apps/api/test/**
- Purpose: Integration and E2E tests
- Structure:
  - `integration/` - Test individual API endpoints and flows
  - `e2e/` - Test complete lead flow from creation to scoring
- Examples: `auth.integration.test.ts`, `discovery.run.integration.test.ts`, `lead-flow.e2e.test.ts`

**apps/worker/**
- Purpose: Async job processor that executes pipeline stages
- Contains: Job handlers, queue management, outbox dispatcher, adapter initialization
- Key files: `src/index.ts` (entry point), `src/queues.ts` (queue definitions), `src/outbox-dispatcher.ts`

**apps/worker/src/jobs/**
- Purpose: Job handlers for each async operation
- Job types:
  - `discovery.run.job.ts` - Execute discovery queries
  - `enrichment.run.job.ts` - Enrich leads with contact info
  - `features.compute.job.ts` - Extract and normalize features
  - `labels.generate.job.ts` - Generate training labels from feedback
  - `scoring.compute.job.ts` - Apply ICP rules and predict scores
  - `model.train.job.ts` - Train logistic regression model
  - `model.evaluate.job.ts` - Evaluate model on test set
  - `message.generate.job.ts` - Generate personalized messages with LLM
  - `message.send.job.ts` - Send WhatsApp messages via Trengo
  - `analytics.rollup.job.ts` - Compute daily quality metrics
  - `heartbeat.job.ts` - System health check
  - `lead-enrich.job.ts` - Legacy enrichment stub
- Pattern: Each job is a function `handle<Name>Job(logger, job, dependencies?)` that returns Promise<void>

**apps/worker/src/scoring/**
- Purpose: Core scoring logic (separated from job handler for testability)
- Files: Feature extraction, rule evaluation, score band assignment

**apps/web/**
- Purpose: Next.js dashboard for Zbooni sales team
- Entry: `app/page.tsx` - Main dashboard
- Pages: Lead list, lead detail, discovery runs, model performance

**packages/contracts/src/**
- Purpose: Single source of truth for API request/response shapes and domain types
- Files:
  - `*.contract.ts` - Zod schemas and TypeScript types for each feature
  - Example: `leads.contract.ts` - `CreateLeadRequestSchema`, `ListLeadsResponseSchema`, lead status enums
  - Example: `discovery.contract.ts` - `CreateDiscoveryRunRequestSchema`, discovery provider enums
- Exports: All combined in `index.ts` for convenient importing

**packages/db/**
- Purpose: Database schema, migrations, and ORM client
- Files:
  - `prisma/schema.prisma` - Complete data model with relations
  - `prisma/migrations/` - Migration history numbered by timestamp
  - `src/client.ts` - Prisma client wrapper
  - `src/index.ts` - Exports `prisma` and `Prisma` type
- Key models:
  - `Lead` - Core entity, one per email address
  - `IcpProfile` - Qualification rules and filters
  - `LeadDiscoveryRecord` - One per lead/provider combination
  - `LeadEnrichmentRecord` - One per lead/provider combination
  - `LeadFeatureSnapshot` - Immutable feature vectors for reproducibility
  - `LeadScorePrediction` - Score predictions and bands
  - `TrainingRun` - Model training execution
  - `ModelVersion` - Trained model artifact
  - `OutboxEvent` - Event outbox for reliable job queueing
  - `JobExecution` - Job execution history and status

**packages/providers/src/**
- Purpose: Adapters for external provider APIs
- Structure:
  - `discovery/` - Discovery provider adapters
    - `apollo.adapter.ts` - Apollo API adapter
    - `googleSearch.adapter.ts` - Google Custom Search adapter
    - `linkedInScrape.adapter.ts` - LinkedIn scraper adapter
    - `companySearch.adapter.ts` - Free company search adapter
  - `enrichment/` - Enrichment provider adapters
    - `pdl.adapter.ts` - People Data Labs adapter
    - `hunter.adapter.ts` - Hunter.io adapter
    - `clearbit.adapter.ts` - Clearbit adapter
    - `publicWebLookup.adapter.ts` - Free web lookup adapter
  - `enrichment/normalized.types.ts` - Shared normalized enrichment types
- Pattern: Each adapter normalizes provider-specific response to common interface

**packages/observability/src/**
- Purpose: Logging and monitoring utilities
- Exports: `createLogger()` function
- Usage: `logger.info()`, `logger.warn()`, `logger.error()` with structured context

**packages/testkit/src/**
- Purpose: Testing utilities shared across test suites
- Contains: Test data factories, mock builders, assertion helpers

**packages/config/**
- Purpose: Shared configuration for linting and type checking
- Files: `eslint.config.mjs`, `tsconfig.json` base configs

**packages/ui/src/**
- Purpose: React component library for web frontend
- Contains: Reusable UI components (buttons, inputs, tables, etc.)

**scripts/learning/**
- Purpose: ML training utility scripts
- Files: `backfill-features.ts` - Backfill features for historical leads

**scripts/icp/**
- Purpose: ICP seeding and initialization
- Files: `seed-zbooni-icps.ts` - Create default ICPs for Zbooni

**infra/docker/**
- Purpose: Docker Compose for local development
- Files: `docker-compose.local.yml` - PostgreSQL service configuration

**docs/**
- Purpose: Documentation
- Generated from JSDoc/comments

**.planning/codebase/**
- Purpose: GSD codebase analysis documents
- Files: `ARCHITECTURE.md`, `STRUCTURE.md`, `STACK.md`, `INTEGRATIONS.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md`

## Key File Locations

**Entry Points:**
- API: `apps/api/src/index.ts` - Bootstraps server, queues, routes
- Worker: `apps/worker/src/index.ts` - Bootstraps job handlers, adapters, outbox dispatch
- Web: `apps/web/app/page.tsx` - Next.js app directory entry

**Configuration:**
- API env: `apps/api/src/env.ts` - Environment variable loading with defaults
- Worker env: `apps/worker/src/env.ts` - Environment variable loading with defaults
- Web env: `apps/web/src/lib/env.ts` - Browser environment variable loading
- Database: `packages/db/prisma/schema.prisma` - Data model definition
- Workspace: `pnpm-workspace.yaml` - Monorepo package definitions
- Build: `turbo.json` - Turbo task definitions
- Root: `package.json` - Root dependencies, scripts, Turbo config

**Core Logic:**
- API server setup: `apps/api/src/server.ts` - Fastify routes and middleware
- Module pattern: `apps/api/src/modules/*/` - Service, repository, routes, errors
- Job handlers: `apps/worker/src/jobs/` - Job execution logic
- Adapter pattern: `packages/providers/src/` - External API integrations
- Database client: `packages/db/src/client.ts` - Prisma client singleton

**Testing:**
- API integration tests: `apps/api/test/integration/` - Route and flow testing
- API E2E tests: `apps/api/test/e2e/` - End-to-end lead flow testing
- Worker integration tests: `apps/worker/test/integration/` - Job and outbox testing
- Unit tests: Colocated with source files (`.test.ts`, `.spec.ts`)

## Naming Conventions

**Files:**
- Services: `<domain>.service.ts` (e.g., `discovery.service.ts`)
- Routes: `<domain>.routes.ts` (e.g., `discovery.routes.ts`)
- Repositories: `<domain>.repository.ts` (e.g., `discovery.repository.ts`)
- Errors: `<domain>.errors.ts` (e.g., `discovery.errors.ts`)
- Job handlers: `<name>.job.ts` (e.g., `discovery.run.job.ts`)
- Tests: `<name>.test.ts` or `<name>.spec.ts`
- Adapters: `<provider>.adapter.ts` (e.g., `apollo.adapter.ts`)

**Directories:**
- Module dirs: lowercase plural for domain (e.g., `discovery/`, `enrichment/`)
- Feature dirs: camelCase (e.g., `packages/providers/`, `apps/worker/`)
- Utility dirs: lowercase descriptive names (e.g., `scripts/learning/`, `infra/docker/`)

**TypeScript:**
- Interfaces: PascalCase prefix `I` or describe usage (e.g., `DiscoveryRunDependencies`, `JobHandler<TPayload>`)
- Types: PascalCase (e.g., `LeadStatus`, `DiscoveryProvider`)
- Enums: PascalCase in database, uppercase with underscores in Prisma (e.g., `LeadStatus`, `DISCOVERED`)
- Classes: PascalCase (e.g., `LeadAlreadyExistsError`, `PrismaDiscoveryRepository`)
- Functions: camelCase (e.g., `buildDiscoveryService`, `handleDiscoveryRunJob`)
- Variables: camelCase (e.g., `leadId`, `discoveryRunPayload`)
- Constants: UPPER_SNAKE_CASE (e.g., `MAX_OUTBOX_ATTEMPTS`, `HEARTBEAT_QUEUE_NAME`)

**Database:**
- Models: PascalCase (e.g., `Lead`, `IcpProfile`, `LeadDiscoveryRecord`)
- Fields: camelCase (e.g., `firstName`, `createdAt`)
- Enums: PascalCase (e.g., `LeadStatus`, `DiscoveryProvider`)
- Relations: camelCase (e.g., `discoveryRecords`, `icpProfile`)

## Where to Add New Code

**New API Route:**
1. Create schema in `packages/contracts/src/<domain>.contract.ts` with Zod
2. Add handler in `apps/api/src/modules/<domain>/<domain>.routes.ts`
3. Call service method from `apps/api/src/modules/<domain>/<domain>.service.ts`
4. Update repository if needed in `apps/api/src/modules/<domain>/<domain>.repository.ts`
5. Add tests in `apps/api/test/integration/<domain>.integration.test.ts`

**New Job Type:**
1. Create job handler in `apps/worker/src/jobs/<name>.job.ts`
2. Define `interface <Name>JobPayload` and `const <NAME>_JOB_NAME = '...'`
3. Define retry options: `const <NAME>_RETRY_OPTIONS = { retryLimit, retryDelay, retryBackoff, deadLetter }`
4. Register handler in `apps/worker/src/index.ts` with `registerWorker()`
5. Add queue definition to `apps/worker/src/queues.ts` if new queue name
6. Add tests in `apps/worker/test/integration/` or `apps/worker/src/jobs/<name>.test.ts`

**New Module (Feature Area):**
- Create `apps/api/src/modules/<domain>/` directory with:
  - `<domain>.routes.ts` - Route handlers
  - `<domain>.service.ts` - Business logic
  - `<domain>.repository.ts` - Database queries
  - `<domain>.errors.ts` - Custom error classes
  - `index.ts` - Public exports
- Register routes in `apps/api/src/server.ts` with `register<Domain>Routes(app)`

**New Provider Adapter:**
1. Create `packages/providers/src/<discovery|enrichment>/<name>.adapter.ts`
2. Implement standard interface (input types, output types, request method)
3. Handle rate limits, retries, response normalization
4. Export from `packages/providers/src/index.ts`
5. Initialize in `apps/worker/src/index.ts`

**Utilities (Shared Helpers):**
- Shared logic across modules: `apps/api/src/<utility>/` or `apps/worker/src/<utility>/`
- Shared types/schemas: `packages/contracts/src/`
- Shared adapters: `packages/providers/src/`
- Shared observability: `packages/observability/src/`
- Shared testing: `packages/testkit/src/`

## Special Directories

**packages/db/prisma/migrations/**
- Purpose: Manages database schema evolution
- Generated: Yes (automatically by `prisma migrate dev`)
- Committed: Yes (must be committed to track schema history)
- Usage: `pnpm db:migrate` applies pending migrations; `pnpm db:migrate:dev` creates new migration

**apps/api/test/integration/ and apps/api/test/e2e/**
- Purpose: API contract and flow testing
- Generated: No
- Committed: Yes (required for CI/CD)
- Usage: Run with `pnpm test:integration` and `pnpm test:e2e`

**apps/worker/test/integration/**
- Purpose: Worker job and outbox testing
- Generated: No
- Committed: Yes
- Usage: Run with `pnpm test:integration`

**.turbo/ and dist/ and .next/**
- Purpose: Build artifacts and cache
- Generated: Yes (by build tools)
- Committed: No (in .gitignore)

**node_modules/**
- Purpose: Installed dependencies
- Generated: Yes (by pnpm install)
- Committed: No (in .gitignore)
- Lockfile: `pnpm-lock.yaml` is committed

---

*Structure analysis: 2025-02-17*
