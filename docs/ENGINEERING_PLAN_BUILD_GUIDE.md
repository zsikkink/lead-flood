# Lead Flood Engineering Plan / Build Guide (Greenfield)

Status: Draft for implementation kickoff  
Owner: Zack Sikkink
Last updated: 2026-02-12

## 1) Project overview

### Problem this system solves
Lead Flood helps small-to-mid-market sales teams find qualified prospects, enrich contact data, run multi-step outreach, and manage inbound/outbound conversations in one workflow.

### Core user flows (MVP)
1. ICP setup and search run
   - User defines an ICP profile.
   - User runs a search (initially Apollo provider).
   - Leads are created and linked to that ICP.
2. Lead review and enrichment
   - User sees lead list and lead detail.
   - User triggers enrichment and receives updated contact/company fields.
3. Sequence enrollment and sending
   - User creates a sequence and enrolls leads.
   - Background worker sends messages over configured channels.
4. Inbox and manual reply
   - User views conversation history.
   - User sends manual replies and sees delivery status.
5. Basic analytics
   - User sees counts and trend summaries for leads, messages, and sequences.

### Non-goals (not in MVP scope)
- No multi-tenant enterprise feature set (advanced RBAC, SSO, billing, invoicing).
- No full microservices split at day 1.
- No sophisticated AI decision engine in message generation (only deterministic templates + optional prompt fields).
- No advanced workflow orchestration platform (Temporal, Cadence) until measured need.

---

## 2) Architecture overview

### High-level diagram (text)
```text
[Next.js Web]
    |
    | HTTPS (typed API client using shared contracts)
    v
[Fastify API]
    |  \
    |   \ enqueue jobs
    |    \
    v     v
[Postgres]   [Worker app (pg-boss consumers)]
    ^              |
    |              | provider adapters (Apollo/Hunter/Trengo...)
    +--------------+

Observability:
- Structured logs (pino) from Web/API/Worker
- OpenTelemetry traces + metrics
- Sentry errors
```

### Data model overview (main entities)
- `User` 1:N `Session`
- `ICP` 1:N `Lead`
- `Lead` 1:N `Message`
- `Sequence` 1:N `SequenceStep`
- `Lead` N:M `Sequence` via `Enrollment`
- `SearchRun` 1:N `SearchResult`
- `Lead` 1:N `EnrichmentRun`
- `JobExecution` links background work to domain objects

### Async/workers overview
Use background workers for:
- ICP searches (external API calls, pagination, retries)
- Lead enrichment (slow/fragile provider calls)
- Sequence step execution (scheduled and retryable)
- Outbound message delivery

Why:
- Keeps API response times low.
- Isolates transient provider failures.
- Supports safe retries and job deduplication.

---

## 3) Repository layout

### Target folder tree
```text
lead-flood/
  apps/
    web/                         # Next.js app (UI routes, pages, components)
    api/                         # Fastify app (HTTP API modules)
    worker/                      # Job consumers and schedulers
  packages/
    contracts/                   # Zod schemas + typed request/response contracts
    db/                          # Prisma schema, migrations, seed, db client
    observability/               # logger/tracing/metrics helpers
    config/                      # shared lint/ts/vitest/prettier configs
    ui/                          # shared UI primitives
    testkit/                     # test factories and helpers
  infra/
    docker/
      docker-compose.local.yml   # local services
    terraform/
      modules/
      envs/
        staging/
        production/
  scripts/
    bootstrap.sh
    migrate.sh
    seed.sh
  .github/
    workflows/
      ci.yml
      deploy-staging.yml
      deploy-production.yml
  docs/
    adr/
    runbooks/
    ENGINEERING_PLAN_BUILD_GUIDE.md
```

### What belongs where
- `apps/web`: rendering/UI state only. No direct DB access.
- `apps/api`: request auth, validation, domain orchestration.
- `apps/worker`: job execution and provider calls.
- `packages/contracts`: canonical API and event schemas shared by FE + BE.
- `packages/db`: Prisma and DB-only utilities.
- `packages/observability`: no business logic, only telemetry helpers.

### Naming conventions and module boundaries
- API route modules: `apps/api/src/modules/<domain>/<domain>.routes.ts`
- API service modules: `apps/api/src/modules/<domain>/<domain>.service.ts`
- Worker consumers: `apps/worker/src/jobs/<domain>.<action>.job.ts`
- Contract files: `packages/contracts/src/<domain>/<operation>.contract.ts`
- Use singular model names: `Lead`, `ICP`, `Sequence`.
- Do not import from `apps/*` into other apps; only import shared code from `packages/*`.

---

## 4) Local development setup

### Prerequisites
- Node.js `>=22.0.0` (TODO(team): pin exact version in `.nvmrc`)
- pnpm `>=10.0.0`
- Docker Desktop or Docker Engine with Compose v2
- GitHub CLI optional (`gh`) for issue workflow

### Environment variables
Create:
- `apps/api/.env.local`
- `apps/worker/.env.local`
- `apps/web/.env.local`
- `packages/db/.env`

Use this baseline:

| Name | Purpose | Example | Required |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | `development` | Yes |
| `APP_ENV` | Environment marker | `local` | Yes |
| `DATABASE_URL` | Prisma + app DB connection | `postgresql://postgres:postgres@localhost:5434/lead_flood` | Yes |
| `DIRECT_URL` | Direct DB URL for Prisma migrations | `postgresql://postgres:postgres@localhost:5434/lead_flood` | Yes |
| `API_PORT` | API port | `5050` | Yes |
| `WEB_PORT` | Web port | `3000` | Yes |
| `CORS_ORIGIN` | Allowed web origin | `http://localhost:3000` | Yes |
| `JWT_ACCESS_SECRET` | Access token signing secret | `TODO(generate-32-byte-secret)` | Yes |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | `TODO(generate-32-byte-secret)` | Yes |
| `SESSION_COOKIE_DOMAIN` | Cookie domain | `localhost` | Yes |
| `PG_BOSS_SCHEMA` | Queue schema in Postgres | `pgboss` | Yes |
| `LOG_LEVEL` | Structured log level | `debug` | Yes |
| `SENTRY_DSN` | Error reporting DSN | `TODO(optional-local-empty)` | No |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint | `http://localhost:4318` | No |
| `APOLLO_API_KEY` | ICP search provider key | `TODO(staging-secret)` | No (required for real search) |
| `HUNTER_API_KEY` | Enrichment provider key | `TODO(staging-secret)` | No |
| `TRENGO_API_KEY` | Messaging provider key | `TODO(staging-secret)` | No |
| `RATE_LIMIT_RPM` | API rate limit requests per minute | `120` | Yes |

### Docker Compose services
File: `infra/docker/docker-compose.local.yml`

```yaml
services:
  postgres:
    image: postgres:16
    container_name: lead-flood-postgres
    ports:
      - "5434:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: lead_flood
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d lead_flood"]
      interval: 5s
      timeout: 5s
      retries: 10

  mailhog:
    image: mailhog/mailhog:latest
    container_name: lead-flood-mailhog
    ports:
      - "8025:8025"
      - "1025:1025"

volumes:
  postgres_data:
```

### One-command bootstrap
From repo root:

```bash
# 1) Install dependencies
pnpm install

# 2) Start local infrastructure
docker compose -f infra/docker/docker-compose.local.yml up -d

# 3) Prepare env files (first run only)
cp apps/api/.env.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env.local
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env

# 4) Run migrations + seed
pnpm db:migrate
pnpm db:seed

# 5) Start all apps
pnpm dev
```

Expected local endpoints:
- Web: `http://localhost:3000`
- API health: `http://localhost:5050/health`
- Mailhog: `http://localhost:8025`

### Common troubleshooting
- DB not reachable:
  ```bash
  docker compose -f infra/docker/docker-compose.local.yml ps
  docker compose -f infra/docker/docker-compose.local.yml logs postgres
  ```
- Prisma client mismatch after schema change:
  ```bash
  pnpm --filter @lead-flood/db prisma generate
  ```
- Port already in use:
  ```bash
  lsof -iTCP:3000 -sTCP:LISTEN -n -P
  lsof -iTCP:5050 -sTCP:LISTEN -n -P
  ```
- Worker not processing:
  ```bash
  pnpm --filter @lead-flood/worker dev
  ```
- Contract drift:
  ```bash
  pnpm contracts:check
  ```

---

## 5) Implementation roadmap (phased)

## Phase 0 - Foundation and walking repo skeleton

### Goal
Create a reproducible monorepo with healthy local startup, baseline observability, and CI gates.

### Scope
Included:
- Repo scaffolding, shared configs, local DB infra, health checks.
- Basic auth scaffolding and request validation pipeline.

Excluded:
- ICP search, enrichment, sequence logic.

### Step-by-step tasks
1. Initialize pnpm workspace and Turborepo pipeline.
2. Create `apps/web`, `apps/api`, `apps/worker`, and shared `packages/*`.
3. Add base lint/typecheck/test scripts in root `package.json`.
4. Add Docker Compose local file and DB health check.
5. Add Prisma schema with initial `User`, `Session`, `Lead`.
6. Add API `/health` and `/ready` endpoints.
7. Add structured logging package and request-id middleware.
8. Add GitHub Actions `ci.yml` with required checks.

### API endpoints to implement
| Method | Path | Contract |
|---|---|---|
| `GET` | `/health` | `{ status: "ok" }` |
| `GET` | `/ready` | `{ status: "ready", db: "ok" \| "fail" }` |
| `POST` | `/v1/auth/login` | `LoginRequest -> LoginResponse` (stub acceptable in Phase 0) |

### DB changes (Prisma)
- Add models:
  - `User`
  - `Session`
  - `Lead` (minimal fields only)
- Migration commands:
  ```bash
  pnpm db:migrate
  pnpm db:generate
  ```

### Worker jobs/workflows
- Add `system.heartbeat` recurring job every minute.
- Idempotency: fixed dedupe key `system.heartbeat:<minute>`.
- Retry policy: 2 attempts, linear backoff 5s.
- DLQ: not required yet (store failed attempts in `JobExecution`).

### Tests to add
- Unit:
  - logger config returns JSON output in non-test env.
  - env parser fails on missing required vars.
- Integration:
  - `/ready` returns `db: ok` with running Postgres.
- E2E:
  - smoke check web loads and API health returns 200.

### Definition of Done
- [ ] `pnpm install && pnpm dev` works on clean machine.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] CI required checks block merges when failing.
- [ ] Logs include `requestId` for API requests.
- [ ] Staging environment booted with `/health` and `/ready`.

---

## Phase 1 - Walking skeleton vertical slice

### Goal
Prove end-to-end path: Web -> API -> DB -> Worker -> DB update, with shared contracts and CI coverage.

### Scope
Included:
- Create lead flow with async enrichment stub.
- Job status endpoint and UI status polling.

Excluded:
- Real provider integrations.

### Step-by-step tasks
1. Define contracts in `packages/contracts`:
   - `CreateLeadRequest`, `CreateLeadResponse`, `GetLeadResponse`, `GetJobStatusResponse`.
2. Implement API `POST /v1/leads` with zod validation.
3. Persist lead with status `new`, enqueue `lead.enrich.stub`.
4. Implement worker consumer:
   - sleep 2s
   - update lead status to `enriched` or `failed`.
5. Implement API `GET /v1/leads/:id` and `GET /v1/jobs/:id`.
6. Build web create lead form and status detail page.
7. Add correlation IDs for API request and job execution.

### API endpoints to implement
| Method | Path | Contract |
|---|---|---|
| `POST` | `/v1/leads` | `CreateLeadRequest -> { leadId, jobId }` |
| `GET` | `/v1/leads/:id` | `GetLeadResponse` |
| `GET` | `/v1/jobs/:id` | `GetJobStatusResponse` |

### DB changes (Prisma)
- Extend `Lead`:
  - `status` enum/string (`new`, `processing`, `enriched`, `failed`)
  - `source`, `enrichmentData`, `error`
- Add `JobExecution`:
  - `id`, `type`, `status`, `attempts`, `payload`, `result`, `error`, `leadId`, timestamps.
- Migration:
  ```bash
  pnpm db:migrate
  pnpm db:seed
  ```

### Worker jobs/workflows
- Job: `lead.enrich.stub`
- Trigger: API `POST /v1/leads`
- Idempotency:
  - `idempotencyKey = "lead.enrich.stub:" + leadId`
  - skip duplicate pending/running jobs
- Retry:
  - max 3 attempts
  - exponential backoff (`5s`, `15s`, `45s`)
- Failure handling:
  - mark lead `failed`
  - persist error message

### Tests to add
- Unit:
  - request contract parser rejects malformed lead payload.
  - job retry utility calculates expected backoff.
- Integration:
  - posting lead creates DB row and queue record.
  - worker completion updates lead status.
- E2E:
  - create lead in UI, see status transition to `enriched` or `failed`.

### Definition of Done
- [ ] Lead creation works from UI and API.
- [ ] Worker processes queued job and updates DB.
- [ ] Contract package is imported by both web and api.
- [ ] CI runs unit + integration + e2e smoke.
- [ ] Staging deployment runs same flow successfully.

---

## Phase 2 - ICP CRUD + search runs

### Goal
Implement usable ICP management and async lead search with status visibility.

### Scope
Included:
- ICP create/edit/delete/list.
- Search run trigger and status endpoint.
- Apollo adapter (or stubbed adapter if key absent).

Excluded:
- Multi-provider strategy optimization.
- Advanced dedupe scoring.

### Step-by-step tasks
1. Add contracts:
   - `CreateIcpRequest`, `UpdateIcpRequest`, `SearchIcpRequest`, `SearchRunStatusResponse`.
2. Implement API modules for ICP CRUD.
3. Add search trigger endpoint `POST /v1/icps/:id/search`.
4. Implement worker `icp.search.apollo`.
5. Persist `SearchRun` and `SearchResult`.
6. Upsert leads from search results by email dedupe.
7. Build web ICP page:
   - CRUD
   - run search button
   - search run status panel.
8. Add explicit handling when provider key is missing.

### API endpoints to implement
| Method | Path | Contract |
|---|---|---|
| `GET` | `/v1/icps` | `ListIcpResponse[]` |
| `POST` | `/v1/icps` | `CreateIcpRequest -> IcpResponse` |
| `PUT` | `/v1/icps/:id` | `UpdateIcpRequest -> IcpResponse` |
| `DELETE` | `/v1/icps/:id` | `{ success: true }` |
| `POST` | `/v1/icps/:id/search` | `SearchIcpRequest -> { runId, jobId }` |
| `GET` | `/v1/icps/:id/search-runs/:runId` | `SearchRunStatusResponse` |

### DB changes (Prisma)
- Add:
  - `ICP`
  - `SearchRun` (state, source, params, error)
  - `SearchResult` (provider payload, mapped fields, runId, leadId?)
- Update:
  - `Lead.icpId`
- Migration:
  ```bash
  pnpm db:migrate
  pnpm db:generate
  ```

### Worker jobs/workflows
- Job: `icp.search.run`
- Trigger: API search endpoint.
- Idempotency:
  - hash `(icpId, source, normalizedParams, dayBucket)` to prevent accidental duplicate runs.
- Retry:
  - provider 429/5xx => retry up to 4 attempts.
  - validation errors => no retry (terminal fail).
- DLQ:
  - in Phase 2, store terminal failures in `SearchRun` + `JobExecution`.
  - true DLQ queue comes in Phase 4.

### Tests to add
- Unit:
  - ICP validation and params normalization.
  - adapter response mapping to internal lead shape.
- Integration:
  - search run creation + job enqueue.
  - search status endpoint reflects queued/running/completed/failed.
- E2E:
  - create ICP -> run search -> status visible in UI.

### Definition of Done
- [ ] ICP CRUD works from UI and API.
- [ ] Search run can be started and tracked.
- [ ] Missing provider key returns clear `400`/`503` contract error.
- [ ] Lead upsert by email dedupe works.
- [ ] CI includes contract drift checks.

---

## Phase 3 - Sequences + inbox baseline

### Goal
Enable sequence-driven outreach and manual conversation replies.

### Scope
Included:
- Sequence CRUD, activate/pause.
- Enroll leads and execute steps.
- Inbox thread view + reply.

Excluded:
- AI-optimized sequence generation.

### Step-by-step tasks
1. Add sequence contracts and models.
2. Implement sequence activation and enrollment endpoints.
3. Build worker step scheduler and send job processing.
4. Implement inbox list/reply endpoints.
5. Build web pages for sequences and inbox.

### Definition of Done
- [ ] Sequence lifecycle actions work end-to-end.
- [ ] Replies persist and enqueue send jobs.
- [ ] Demo flow `ICP -> leads -> enroll -> outbound -> inbox` works in staging.

---

## Phase 4 - Reliability hardening

### Goal
Reduce operational risk and improve observability/performance.

### Scope
Included:
- Idempotency middleware
- dead-letter replay
- provider circuit breakers
- query/index tuning

### Definition of Done
- [ ] SLO dashboards live.
- [ ] DLQ replay runbook tested.
- [ ] Load baseline documented and tracked.

---

## Phase 5 - Launch readiness

### Goal
Finalize security, release controls, and production operations.

### Scope
Included:
- RBAC hardening
- audit logs
- backup/restore drills
- release gates and rollback drills

### Definition of Done
- [ ] Production checklist approved.
- [ ] Recovery drill completed.
- [ ] Runbooks reviewed by team.

---

## 5.8 GitHub Issues backlog (ready to create)

Create these as GitHub Issues with labels:
- `phase:0`, `phase:1`, ...
- `type:feature|chore|bug|ops`
- `priority:high|medium|low`

### Phase 0 issues
1. Bootstrap pnpm + turborepo workspace  
   Acceptance criteria: `pnpm install && pnpm build` succeeds from clean clone.
2. Add shared config package (`eslint`, `tsconfig`, `vitest`)  
   Acceptance criteria: all apps consume shared config; root lint/typecheck pass.
3. Add local Docker Compose for Postgres and Mailhog  
   Acceptance criteria: `docker compose ... up -d` yields healthy containers.
4. Scaffold Fastify API app with health/readiness endpoints  
   Acceptance criteria: `/health` and `/ready` return 200 with valid payload.
5. Scaffold Next.js web app shell  
   Acceptance criteria: root app loads and displays environment banner.
6. Create `packages/contracts` with first zod schemas  
   Acceptance criteria: API compiles using shared schemas.
7. Add request-id middleware + pino logging package  
   Acceptance criteria: every API log includes `requestId`.
8. Add base CI workflow (`lint`, `typecheck`, `unit`, `build`)  
   Acceptance criteria: required checks enforced on protected `main`.

### Phase 1 issues
9. Add Prisma `Lead` + `JobExecution` models  
   Acceptance criteria: migration applies and seed runs successfully.
10. Implement `POST /v1/leads` with zod validation  
    Acceptance criteria: invalid payload returns contract error; valid payload persists lead.
11. Enqueue `lead.enrich.stub` job from create lead API  
    Acceptance criteria: API response includes `jobId`.
12. Implement worker consumer for `lead.enrich.stub`  
    Acceptance criteria: lead status transitions to terminal state.
13. Implement `GET /v1/leads/:id` endpoint  
    Acceptance criteria: returns normalized lead contract.
14. Implement `GET /v1/jobs/:id` endpoint  
    Acceptance criteria: reports queued/running/completed/failed.
15. Build web Create Lead page and status view  
    Acceptance criteria: UI can create lead and display status updates.
16. Add integration tests for lead creation + job processing  
    Acceptance criteria: tests pass in CI with ephemeral DB.
17. Add Playwright e2e for walking skeleton  
    Acceptance criteria: e2e passes in CI on PR.

### Phase 2 issues
18. Add Prisma models for `ICP`, `SearchRun`, `SearchResult`  
    Acceptance criteria: migration applied and schema documented.
19. Implement ICP CRUD endpoints  
    Acceptance criteria: contract tests pass for all CRUD operations.
20. Build ICP management page in web app  
    Acceptance criteria: user can create/edit/delete ICP entries.
21. Implement `POST /v1/icps/:id/search` endpoint  
    Acceptance criteria: returns `runId` and enqueues worker job.
22. Implement `GET /v1/icps/:id/search-runs/:runId` endpoint  
    Acceptance criteria: status transitions are visible.
23. Add provider adapter interface + Apollo adapter  
    Acceptance criteria: adapter swapped by config without API changes.
24. Upsert lead results from search by unique email  
    Acceptance criteria: duplicate search runs do not duplicate lead records.
25. Add UI run-status panel for ICP search  
    Acceptance criteria: shows queued/running/completed/failed with counts.
26. Add integration tests for search flow  
    Acceptance criteria: run creation and completion statuses validated.

### Phase 3 issues
27. Add Prisma models for `Sequence`, `SequenceStep`, `Enrollment`  
    Acceptance criteria: migration and constraints tested.
28. Implement sequence CRUD + activate/pause endpoints  
    Acceptance criteria: invalid transitions rejected with typed errors.
29. Implement enrollment endpoint and queue trigger  
    Acceptance criteria: lead enrollment creates step execution jobs.
30. Add message models (`Message`, `DeliveryAttempt`)  
    Acceptance criteria: send attempts tracked and queryable.
31. Implement inbox list and reply endpoints  
    Acceptance criteria: reply persists message and enqueues send job.
32. Build sequence and inbox UI pages  
    Acceptance criteria: end-to-end demo flow functional in local.

### Phase 4 issues
33. Add API idempotency-key middleware  
    Acceptance criteria: duplicate POST with same key returns same result.
34. Implement DLQ table + replay CLI command  
    Acceptance criteria: failed jobs can be replayed successfully.
35. Add provider circuit breaker + timeout policy  
    Acceptance criteria: repeated provider failures no longer saturate workers.
36. Add observability dashboards and alert policies  
    Acceptance criteria: alerts fire in staging fault-injection test.

### Phase 5 issues
37. Implement RBAC guard middleware and policy map  
    Acceptance criteria: role-restricted endpoints block unauthorized roles.
38. Add immutable audit logs for admin actions  
    Acceptance criteria: all privileged operations emit audit events.
39. Add backup/restore automation and drill script  
    Acceptance criteria: restore drill completes within TODO(SLO-RTO).
40. Add production release workflow with canary + rollback  
    Acceptance criteria: production deploy requires approval and can rollback in one command.

---

## 6) Quality gates

### CI pipeline stages (all blocking unless noted)
1. `install`
   - `pnpm install --frozen-lockfile`
2. `lint`
   - `pnpm lint`
3. `typecheck`
   - `pnpm typecheck`
4. `unit-tests`
   - `pnpm test:unit`
5. `integration-tests`
   - `pnpm test:integration`
6. `contracts`
   - `pnpm contracts:check`
7. `build`
   - `pnpm build`
8. `e2e-smoke` (blocking for main features)
   - `pnpm test:e2e --grep @smoke`

### Lint/typecheck/test standards
- TypeScript strict mode enabled in all apps/packages.
- No `any` without explicit `// TODO(types)` annotation and issue link.
- Minimum test coverage target:
  - API: 80% statements, 70% branches
  - Worker core jobs: 85% statements
  - Web critical flows: e2e smoke required
- Every new API endpoint must include:
  - contract schema
  - integration test
  - error contract cases

### Security baseline
- Secrets:
  - never commit secrets to git.
  - use `TODO(secret-manager): <platform>` for staging/prod.
- Auth:
  - short-lived access token + refresh token rotation.
- Least privilege:
  - DB user roles for app vs migration jobs.
- Rate limits:
  - apply global + auth endpoint limits.
- Input validation:
  - zod validation at API boundary; reject unknown fields.
- Dependency hygiene:
  - weekly `pnpm audit` triage job.

---

## 7) Operational playbook (minimum viable)

### Logging and error reporting
- Use `pino` JSON logs with required fields:
  - `timestamp`, `level`, `service`, `env`, `requestId`, `userId?`, `jobId?`, `message`.
- API middleware must inject `requestId` into response header `x-request-id`.
- Worker must include `jobId` and `attempt` in all job logs.
- Send unhandled exceptions to Sentry with release tag `TODO(release-id)`.

### Basic metrics to track
- API:
  - request count, error rate, p95 latency by endpoint.
- Worker:
  - queue depth, running jobs, failed jobs, retry count.
- Domain:
  - lead creation count/day
  - ICP search success rate
  - message delivery success rate

### How to debug a failed job
1. Find `jobId` from UI/API response.
2. Query DB:
   ```sql
   SELECT * FROM "JobExecution" WHERE id = '<jobId>';
   ```
3. Check worker logs for that `jobId` + `requestId`.
4. Classify failure:
   - validation / permanent
   - provider transient
   - infrastructure
5. For transient failures:
   - replay job (Phase 4+)
6. For permanent failures:
   - patch source data, create new run.

### Release process (staging -> production)
1. Merge PR to `main` (all checks green).
2. Auto-deploy to staging.
3. Run staging smoke suite.
4. Manual approval step for production deploy.
5. Run post-deploy smoke checks and verify dashboards.

### Rollback plan
- If release fails health checks:
  1. Revert deployment to previous image/tag.
  2. Re-run smoke checks.
  3. If DB migration is destructive, execute rollback migration script (`TODO(add-safe-rollback-script)`).
  4. Open incident ticket with timeline and remediation.

---

## 8) Appendix

### Glossary
- ICP: Ideal Customer Profile.
- Search Run: One execution of a lead search against an ICP and source.
- Enrichment Run: One execution of lead enrichment provider calls.
- Enrollment: Link between a lead and a sequence.
- DLQ: Dead Letter Queue for failed jobs needing manual replay.
- Contract Drift: FE/BE request or response schema mismatch.

### ADR template
File: `docs/adr/NNN-title.md`

```md
# ADR NNN: <Title>

Date: YYYY-MM-DD  
Status: Proposed | Accepted | Superseded

## Context
What problem are we solving?

## Decision
What are we choosing?

## Alternatives considered
- Option A
- Option B

## Consequences
Positive, negative, and follow-up actions.
```

### Initial ADRs to create
1. ADR-001: Monorepo + modular monolith architecture.
2. ADR-002: Fastify + Zod contracts as API baseline.
3. ADR-003: Prisma + Postgres schema and migration strategy.
4. ADR-004: pg-boss queue strategy and idempotency rules.
5. ADR-005: CI gates and branch protection policy.
6. ADR-006: Observability baseline (pino + OTEL + Sentry).

### First week for a new dev checklist
- [ ] Install Node, pnpm, Docker.
- [ ] Clone repo and run bootstrap commands.
- [ ] Run lint, typecheck, unit, integration tests locally.
- [ ] Read ADR-001 through ADR-006.
- [ ] Implement one small contract + endpoint change with tests.
- [ ] Ship one PR through full staging deploy pipeline.
- [ ] Pair on one failed-job debugging exercise.

---

## Next actions
1. Create the repository skeleton and scripts exactly as defined in Phase 0.
2. Open GitHub issues 1-17 first (Phase 0 + Phase 1 only) and assign owners.
3. Add ADR-001 to ADR-003 before writing app code.
4. Implement and verify the walking skeleton end-to-end before beginning Phase 2.
