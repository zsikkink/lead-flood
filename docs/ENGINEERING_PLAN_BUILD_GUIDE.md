# LEAD-FLOOD Engineering Plan and Build Guide

Status: implementation-verified guide (not a speculative roadmap)

Last verified: 2026-02-12

## 1) Project Overview

### What problem this system solves
LEAD-FLOOD is a monorepo for a lead-processing walking skeleton:
- Create a lead from the web UI.
- Persist lead + job records in Postgres.
- Queue background enrichment work through pg-boss.
- Execute the worker job and write status/results back to Postgres.
- Poll status from UI until completion.

### Core implemented user flows
1. Log in with seeded demo user credentials.
2. Create a lead from the web form.
3. Watch lead/job status move from queued to completed.
4. Observe worker heartbeat and queue/outbox processing in logs.

### Explicit non-goals in current implementation
These are not implemented in this repository state:
- ICP CRUD/search endpoints and UI.
- Sequence management or inbox workflows.
- Provider integrations beyond stub lead enrichment.
- Multi-tenant access control and route-level authorization.

## 2) Architecture Overview

### Runtime components (as implemented)
```text
Browser (Next.js app)
  -> POST /v1/leads
  -> GET  /v1/leads/:id
  -> GET  /v1/jobs/:id

API (Fastify, apps/api)
  -> validates payloads with Zod contracts (packages/contracts)
  -> writes Lead + JobExecution + OutboxEvent in one transaction (packages/db)
  -> sends job to pg-boss queue (Postgres-backed)
  -> falls back to outbox retry when immediate publish fails

Worker (apps/worker)
  -> consumes queue jobs (lead.enrich.stub, system.heartbeat)
  -> dispatches pending outbox events on interval
  -> updates Lead/JobExecution status in Postgres

Postgres
  -> application tables: User, Session, Lead, JobExecution, OutboxEvent
  -> pg-boss schema for queue state
```

### Data model (current)
Source of truth: `packages/db/prisma/schema.prisma`.

Main entities:
- `User` and `Session` for login/refresh session persistence.
- `Lead` for inbound leads.
- `JobExecution` for async work tracking.
- `OutboxEvent` for transactional publish reliability.

State models:
- `Lead.status`: `new -> processing -> enriched | failed`
- `JobExecution.status`: `queued -> running -> completed | failed`
- `OutboxEvent.status`: `pending -> processing -> sent | failed | dead_letter`

## 3) Repository Map (Top-Level)

This map covers every top-level directory currently present.

### `.github/`
- Why it exists: CI/CD workflows.
- Contains: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.
- Must not contain: app runtime code.
- Interacts with: Dockerfiles in `infra/docker/`, scripts in root/package scripts.

### `.turbo/`
- Why it exists: Turborepo local cache and daemon state.
- Contains: build cache artifacts.
- Must not contain: source code or docs.
- Interacts with: all workspace tasks via `turbo.json`.

### `apps/`
- Why it exists: runnable applications.
- Contains:
  - `apps/web` (Next.js UI)
  - `apps/api` (Fastify API)
  - `apps/worker` (pg-boss consumers + outbox dispatcher)
- Must not contain: shared contracts/db client logic duplicated across apps.
- Interacts with: `packages/contracts`, `packages/db`, `packages/observability`.

### `docs/`
- Why it exists: human documentation and development guides.
- Contains: `docs/README.md`, this guide (`docs/ENGINEERING_PLAN_BUILD_GUIDE.md`).
- Must not contain: executable app code.
- Interacts with: all directories by documenting conventions and flows.

### `infra/`
- Why it exists: container and runtime packaging assets.
- Contains:
  - `infra/docker/docker-compose.local.yml`
  - `infra/docker/Dockerfile.api`
  - `infra/docker/Dockerfile.web`
  - `infra/docker/Dockerfile.worker`
- Must not contain: feature/domain business logic.
- Interacts with: local startup, CI image builds, deploy workflow.

### `node_modules/`
- Why it exists: package manager install artifacts.
- Contains: dependencies.
- Must not contain: authored source.
- Interacts with: all packages at runtime/build time.

### `packages/`
- Why it exists: shared workspace libraries.
- Contains:
  - `packages/contracts` (Zod schemas + typed contracts)
  - `packages/db` (Prisma schema/client/migrations/seed)
  - `packages/observability` (pino logger factory)
  - `packages/config` (shared tsconfig base package)
  - `packages/testkit` (small test helpers)
  - `packages/ui` (currently minimal placeholder)
- Must not contain: app-specific route orchestration.
- Interacts with: imported by apps via workspace dependencies.

### `scripts/`
- Why it exists: convenience shell entrypoints.
- Contains:
  - `scripts/bootstrap.sh`
  - `scripts/migrate.sh`
  - `scripts/seed.sh`
- Must not contain: hidden deployment logic not reflected in CI.
- Interacts with: root package scripts and local dev workflows.

### `src/`
- Why it exists: reserved top-level source folder.
- Current state: empty.
- Must not contain: active production code unless a top-level package/app is intentionally introduced.
- Interacts with: currently none.

### `.git/`
- Why it exists: Git metadata (history, refs, index).
- Contains: internal VCS state only.
- Must not contain: application source or runtime assets.
- Interacts with: contributor workflows and CI checkout behavior, not runtime execution.

## 4) Top-Level File Map

- `.dockerignore`: excludes cache/node/env artifacts from Docker build context.
- `.gitignore`: excludes build/cache/env/log artifacts from Git.
- `.prettierrc.json`: formatting rules (single quotes, semicolons, trailing commas).
- `eslint.config.mjs`: shared lint config with strict TypeScript rules.
- `LICENSE`: project license text.
- `package.json`: root scripts, workspace orchestration, turbo entrypoint.
- `pnpm-lock.yaml`: deterministic dependency lockfile.
- `pnpm-workspace.yaml`: workspace package globs (`apps/*`, `packages/*`).
- `README.md`: root quick-start pointer to docs.
- `tsconfig.base.json`: strict TypeScript baseline shared by apps/packages.
- `tsconfig.json`: root no-emit type-check include set.
- `turbo.json`: task graph and cache/output behavior.

## 5) System Flow Narratives

### A) Lead creation (implemented)
References:
- Web entry: `apps/web/app/page.tsx`
- API route: `apps/api/src/server.ts` (`POST /v1/leads`)
- API orchestration: `apps/api/src/index.ts`

Flow:
1. User submits lead form in web UI.
2. Web POSTs JSON to `POST /v1/leads`.
3. API validates request with `CreateLeadRequestSchema` from `packages/contracts/src/leads.contract.ts`.
4. API transaction creates:
   - `Lead` row with status `new`.
   - `JobExecution` row with status `queued`.
   - `OutboxEvent` row with status `pending`.
5. API attempts immediate pg-boss publish (`lead.enrich.stub`).
6. If publish succeeds:
   - Outbox marked `sent` and `processedAt` set.
7. If publish fails:
   - Outbox marked `failed`, `attempts +1`, `nextAttemptAt` set.
8. API returns `{ leadId, jobId }`.

Failure points:
- Contract validation failure -> `400` typed error.
- Duplicate lead email (Prisma unique constraint) -> `409`.
- Unhandled server error -> `500` typed error.

### B) Background job lifecycle (implemented)
References:
- Worker bootstrap: `apps/worker/src/index.ts`
- Enrichment job: `apps/worker/src/jobs/lead-enrich.job.ts`
- Outbox dispatcher: `apps/worker/src/outbox-dispatcher.ts`

Flow:
1. Worker starts, ensures queues exist.
2. Worker registers consumers for:
   - `system.heartbeat`
   - `lead.enrich.stub`
3. Worker also runs outbox dispatch cycle every 5 seconds.
4. For `lead.enrich.stub`:
   - Set `JobExecution` to `running` and lead to `processing`.
   - Simulate enrichment (`sleep 2s`).
   - Write enrichment payload, set lead `enriched`, job `completed`.
5. On job error:
   - lead `failed`, job `failed`, error captured.
   - throw to allow queue retry behavior.

Outbox retry/state behavior:
- Eligible outbox rows: `pending`, retryable `failed`, stale `processing`.
- Invalid payload/missing job/max-attempt rows -> `dead_letter`.
- Non-queued job target -> mark `sent` without publish (duplicate-work guard).
- Retry backoff: exponential from 5s capped at 60s.
- Max attempts before dead-letter: 5.

### C) ICP search flow (not implemented yet)
Current state:
- No ICP models in Prisma.
- No `/v1/icps` routes in API.
- No ICP UI pages/components.

Implication:
- Any prior plan text describing ICP runtime should be treated as future work, not current behavior.

### D) Sequence / inbox flow (not implemented yet)
Current state:
- No sequence/inbox models in Prisma.
- No sequence/inbox endpoints.
- No sequence/inbox web routes.

Implication:
- Messaging functionality currently ends at stub enrichment job completion.

## 6) Architecture Rationale and Tradeoffs

### Monorepo + pnpm workspace + Turborepo
Why used:
- Shared contracts and DB client are versioned atomically with apps.
- Single lockfile (`pnpm-lock.yaml`) supports deterministic installs.
- Turbo gives task graph + selective rebuilds.

Tradeoffs:
- Requires strict boundaries to avoid app-to-app coupling.
- Cache artifacts can obscure stale-state issues when local env differs.

Rejected alternative:
- Separate repos per service: cleaner ownership, but higher overhead for shared schema/contract coordination at current team size.

### Modular monolith shape
Why used:
- API + worker share one database and shared packages.
- Simpler operational footprint than full microservices at MVP stage.

Tradeoffs:
- Strong DB coupling between API and worker.
- Scaling boundaries are logical, not process-isolated by domain yet.

### Worker/queue model (pg-boss on Postgres)
Why used:
- Reuses Postgres instead of introducing Redis/Kafka for MVP.
- Supports retries and scheduling with fewer moving parts.

Tradeoffs:
- Queue load and OLTP load share one database.
- Long-term high-throughput workloads may need queue isolation.

### Zod contracts (`packages/contracts`)
Why used:
- Runtime validation + static typing for request/response payloads.
- Shared schema package keeps web/API data contracts aligned.

Tradeoffs:
- Adds validation maintenance overhead for every contract change.
- Requires discipline to validate both ingress and egress.

### Fastify + Next.js
Why used:
- Fastify: lightweight, typed server hooks/request IDs.
- Next.js: rapid app-router UI scaffolding with SSR/client flexibility.

Tradeoffs:
- Two independent runtimes/processes to coordinate in dev/prod.
- Next build behavior differs between dev/prod; smoke tests are required.

## 7) Developer Workflow Guide

### Daily local workflow
1. Install deps:
```bash
pnpm install --frozen-lockfile
```
2. Start local infra:
```bash
pnpm dev:infra
```
3. Apply schema and seed:
```bash
pnpm db:migrate
pnpm db:seed
```
4. Start all apps:
```bash
pnpm dev
```
5. Validate before commit:
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

### Branching and QA gates
Repository evidence:
- CI runs on pull requests and pushes to `main`: `.github/workflows/ci.yml`.
- Deploy pipeline consumes successful CI on `main`: `.github/workflows/deploy.yml`.

Practical expectation:
- Keep feature work on branch -> open PR -> pass CI.
- Do not merge with failing `lint/typecheck/test/build`.

### Where new code should go
- New HTTP behavior: `apps/api/src` + contract update in `packages/contracts/src`.
- Persistent model changes: `packages/db/prisma/schema.prisma` + migration.
- Async execution: `apps/worker/src/jobs` (job handler) + queue dispatch from API.
- Shared utility: `packages/*` if needed by multiple apps.

### How to add a new endpoint
1. Add/extend contract schema in `packages/contracts/src/*.contract.ts`.
2. Export from `packages/contracts/src/index.ts`.
3. Implement Fastify route in `apps/api/src/server.ts` (or domain module if created).
4. Wire DB operations in `apps/api/src/index.ts` dependency functions.
5. Add unit/integration tests in `apps/api/src/*.test.ts` and `apps/api/test/integration/*`.

### How to add a new worker job
1. Add job payload type + handler in `apps/worker/src/jobs/<job>.ts`.
2. Create queue and worker registration in `apps/worker/src/index.ts`.
3. Ensure API enqueues through outbox pattern when transactional integrity is required.
4. Add job state transitions in `JobExecution` updates.
5. Add unit and integration tests in worker test folders.

### How to add a new provider
Current provider model is stub-only, so first real provider should:
1. Add provider adapter module under worker (for external calls).
2. Keep adapter input/output mapped to internal contract types.
3. Handle provider failure classes (retryable vs terminal) explicitly.
4. Add deterministic tests for mapping and failure behavior.

### How to add a new domain
Suggested pattern in current repo:
1. Create `packages/contracts/src/<domain>.contract.ts`.
2. Add Prisma models/enums and migration.
3. Add API routes + orchestration in `apps/api/src`.
4. Add worker jobs only if domain work is asynchronous.
5. Add web pages/components in `apps/web/app`.

## 8) Environment and Operations Model

### Local environment
- Infrastructure: Postgres + Mailhog via `infra/docker/docker-compose.local.yml`.
- Queue backend: pg-boss uses Postgres (`PG_BOSS_SCHEMA`).
- App ports:
  - Web: `3000`
  - API: `5050`
  - Postgres: `5434`
  - Mailhog UI: `8025`

### Staging/production model
Defined by workflows, not by local compose:
- CI builds and validates artifacts.
- Deploy workflow builds/pushes container images to GHCR.
- Staging deploy auto-triggers after successful CI on `main` (if webhook secret is present).
- Production deploy is manual via workflow dispatch.

### Secrets handling
Observed in repo:
- Local: `.env.local` files (ignored by Git).
- CI: environment variables in workflow job env.
- Deploy: GitHub secrets for webhook/smoke URLs (`STAGING_*`, `PRODUCTION_*`).

Not present yet:
- No in-repo secret manager integration (Vault/SSM/etc.).

### Failure propagation model
- API publish failure does not drop work: outbox row remains retryable.
- Worker failure writes terminal status to `Lead` and `JobExecution`.
- Outbox dispatcher retries with backoff and eventually dead-letters.
- API health/readiness endpoints support probe-based monitoring.

### Rollback model (current)
What exists:
- Versioned image tags in deploy workflow (`staging-<sha>`, `production-<sha>`).

What does not exist:
- No automated rollback workflow in repo.

Current rollback approach:
1. Repoint deployment target to previous known-good image tag.
2. Re-trigger deployment webhook.
3. Run smoke URL checks.

### Incident debugging checklist
1. Confirm API process:
```bash
curl -fsS http://localhost:5050/health
curl -fsS http://localhost:5050/ready
```
2. Confirm DB connectivity:
```bash
docker compose -f infra/docker/docker-compose.local.yml ps
```
3. Confirm worker running and queue dispatch:
- Check worker logs for `Worker started` and outbox dispatch messages.
4. Check row states in DB (`Lead`, `JobExecution`, `OutboxEvent`) to locate stuck stage.

## 9) Accuracy Audit (Verified Against Current Repo)

Verification run date: 2026-02-13.

### Path and script audit
- Verified existing top-level directories and files from repo root.
- Verified `docs/` exists and contains:
  - `docs/README.md`
  - `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
- Verified workflow files present:
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`

### Command audit results
Executed successfully in this repository:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm test` (after local Postgres started)
- `pnpm test:e2e`
- `pnpm build`
- `pnpm dev` smoke:
  - API `/health` responded `{"status":"ok"}`.
  - Web root responded.
  - Worker startup log detected.

Important operational note:
- `pnpm test` fails if Postgres is not running on `localhost:5434`.

### CI/doc alignment notes
- CI in `.github/workflows/ci.yml` matches documented quality gates (`lint`, `typecheck`, `test`, `test:e2e`, `build`).
- Deploy behavior in docs reflects `.github/workflows/deploy.yml` (GHCR image build + optional webhook trigger + optional smoke URL checks).

## 10) Stable Interfaces, Boundaries, and Risks

### Stable interfaces (safe to build on)
- HTTP contracts exported by `packages/contracts/src/index.ts`.
- API health/readiness endpoints in `apps/api/src/server.ts`.
- Lead/job status schema and lifecycle enums in Prisma.
- Outbox dispatcher status model in `apps/worker/src/outbox-dispatcher.ts`.

### Experimental or thinly implemented areas
- `packages/ui` and `packages/testkit` are placeholders.
- Provider integration is stubbed (`lead-enrich.job.ts` sleeps and returns mock payload).
- Auth exists for login/session issuance but is not yet applied as authorization middleware to lead/job routes.

### Technical debt and risky assumptions
- Queue and OLTP traffic share one Postgres instance.
- API route composition is still centralized in `apps/api/src/server.ts` (domain modularization pending).
- Top-level `src/` is empty and can become ambiguous if used without conventions.
- Some cached logs include legacy absolute workspace paths (from turbo cache), which can confuse path-based diagnostics.

### Planned refactor targets (based on current boundaries)
- Split API route handlers into domain modules under `apps/api/src/<domain>/`.
- Add authorization middleware and session/refresh validation to protected routes.
- Replace enrichment stub with provider adapters and explicit retry classification.

## 11) New Engineer Questions Resolved

These are the questions a new engineer would likely ask on day one, with answers grounded in current code.

1. Do I need Redis for queues?
- No. Queueing uses pg-boss on Postgres (`apps/api/src/index.ts`, `apps/worker/src/index.ts`).

2. Does `pnpm dev` start infrastructure for me?
- No. Start infra separately with `pnpm dev:infra`.

3. Where is the canonical request/response schema?
- `packages/contracts/src/*.contract.ts` and exports in `packages/contracts/src/index.ts`.

4. Which routes are actually implemented?
- `/health`, `/ready`, `/v1/auth/login`, `/v1/leads`, `/v1/leads/:id`, `/v1/jobs/:id` in `apps/api/src/server.ts`.

5. Are ICP/search, sequences, and inbox available now?
- No; not implemented in this codebase state.

6. Where do I debug async job failures?
- Start with `JobExecution` and `OutboxEvent` tables, then worker logs and queue registration in `apps/worker/src/index.ts`.

7. What is the minimal smoke test for full stack?
- Start infra -> migrate/seed -> `pnpm dev` -> hit `http://localhost:5050/health` and `http://localhost:3000`.

8. Where should I add a new domain without creating hidden coupling?
- Contracts in `packages/contracts`, persistence in `packages/db`, HTTP orchestration in `apps/api`, async jobs in `apps/worker`.

No unresolved onboarding blockers remain in this guide for the currently implemented scope.
