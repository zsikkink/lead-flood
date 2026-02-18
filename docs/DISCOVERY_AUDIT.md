# Discovery Audit

Audit date: 2026-02-18  
Scope: SerpAPI-powered SMB discovery pipeline changes only.

## Executive Summary

- A new discovery subsystem exists under `packages/discovery` and is wired into the worker.
- New persistence tables exist for task frontier, sources, businesses, and evidence.
- Prisma migrations for the discovery tables are present and are applied by normal `pnpm db:migrate`.
- Task seeding is idempotent at DB level (`ON CONFLICT DO NOTHING` on `(task_type, query_hash)`).
- Worker job scaffolding for `discovery.seed` and `discovery.run_search_task` is registered with pg-boss.
- SerpAPI client includes retry/backoff behavior and an in-process global RPS limiter.
- Local compile/typecheck/test/build checks pass for discovery/worker/api/db.
- End-to-end external provider execution was not proven in this audit (no external API calls were made).
- A high-priority retry-limit gap exists: failed tasks remain re-runnable after max attempts.
- Current observability is basic (structured logs + in-memory counters), with no durable metrics sink/dashboard.

## Implemented Components

### 1) Database Schema and Migrations

Files:
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260218022000_add_serp_discovery_pipeline_tables/migration.sql`
- `packages/db/prisma/migrations/20260218012500_add_discovery_provider_fanout_metadata/migration.sql`

What it does:
- Adds enums: `SearchTaskType`, `SearchTaskStatus`, `DiscoverySourceType`.
- Adds tables: `search_tasks`, `sources`, `businesses`, `business_evidence`.
- Adds dedupe constraints and indexes:
  - `UNIQUE(search_tasks.task_type, search_tasks.query_hash)`
  - partial unique indexes on `businesses.website_domain` and `businesses.phone_e164` when non-null.
- Adds provider fanout metadata fields on `LeadDiscoveryRecord`.

Key env/config dependency:
- No direct env dependency for schema; migration application depends on `DATABASE_URL`.

Done means:
- `prisma migrate status` reports up to date.
- New tables and indexes exist and accept inserts.

### 2) Provider Abstraction + SerpAPI Client

Files:
- `packages/discovery/src/providers/types.ts`
- `packages/discovery/src/providers/serpapi.client.ts`

What it does:
- Defines provider interface for `searchGoogle`, `searchGoogleLocal`, `searchMapsLocal`.
- Normalizes organic and local business results into internal typed shapes.
- Implements retry/backoff for transient HTTP statuses (`429`, `5xx`) and request timeout handling.
- Applies `DISCOVERY_ENABLE_CACHE` behavior (`no_cache=true` when disabled).

Key env/config dependency:
- `SERPAPI_API_KEY`
- `DISCOVERY_RPS`
- `DISCOVERY_ENABLE_CACHE`
- `DISCOVERY_MAX_TASK_ATTEMPTS`
- `DISCOVERY_BACKOFF_BASE_SECONDS`

Done means:
- Provider can be constructed with runtime config.
- Requests are throttled and errors include status/body/url context.

### 3) Query Normalization, Hashing, and Dedupe Keying

Files:
- `packages/discovery/src/dedupe/normalize.ts`
- `packages/discovery/src/dedupe/task_key.ts`
- `packages/discovery/src/dedupe/normalize.test.ts`
- `packages/discovery/src/dedupe/task_key.test.ts`

What it does:
- Normalizes query text and country synonyms (`KSA` -> `SA`, `UAE` -> `AE`).
- Computes daily/weekly time buckets.
- Computes deterministic SHA-256 task hash over task type/country/lang/query/page/bucket.

Key env/config dependency:
- `DISCOVERY_REFRESH_BUCKET` (daily/weekly)

Done means:
- Hashing is deterministic in unit tests.
- Time bucket format is stable (`YYYY-MM-DD` or `YYYY-W##`).

### 4) Frontier Seeding (Task Generation + Insert)

Files:
- `packages/discovery/src/queries/seeds.ts`
- `packages/discovery/src/queries/generate_tasks.ts`
- `packages/discovery/src/seed_tasks.ts`
- `packages/discovery/src/cli/seed.ts`

What it does:
- Generates tasks from country x city x language x category x template x page x engine.
- Supports JO/SA/AE/EG with EN/AR query templates.
- Inserts into `search_tasks` using `ON CONFLICT ("task_type", "query_hash") DO NOTHING` (idempotent).

Key env/config dependency:
- `DISCOVERY_COUNTRIES`
- `DISCOVERY_LANGUAGES`
- `DISCOVERY_MAX_PAGES_PER_QUERY`
- `DISCOVERY_REFRESH_BUCKET`
- `SERPAPI_API_KEY` (currently required by runtime loader, even for seeding)

Done means:
- First seed inserts generated tasks.
- Re-running seed inserts `0` new rows for same bucket/config.

### 5) Worker Runtime Integration and Queue Wiring

Files:
- `apps/worker/src/index.ts`
- `apps/worker/src/queues.ts`
- `apps/worker/src/schedules.ts`
- `apps/worker/src/jobs/discovery.seed.job.ts`
- `apps/worker/src/jobs/discovery.run_search_task.job.ts`

What it does:
- Registers queues with dead-letter queues created first.
- Schedules recurring `discovery.seed` job.
- Registers `discovery.run_search_task` loop with configured batch concurrency.
- Boots with SerpAPI runtime only when config loads successfully.

Key env/config dependency:
- `SERPAPI_API_KEY` and discovery runtime env vars
- `DATABASE_URL`, `PG_BOSS_SCHEMA`
- `DISCOVERY_CONCURRENCY`

Done means:
- Worker starts and registers both discovery jobs.
- Jobs can enqueue follow-up polling work and log structured execution payloads.

### 6) Task Execution, Parsing, and DB Writes

Files:
- `packages/discovery/src/workers/run_search_task.ts`
- `packages/discovery/src/metrics.ts`

What it does:
- Locks next runnable task with `FOR UPDATE SKIP LOCKED`.
- Marks task `RUNNING`, increments attempts, updates runtime params.
- Calls provider by `task_type`.
- Persists:
  - `sources` from organic/local URLs
  - `businesses` deduped by domain then phone
  - `business_evidence` always inserted for local results
- Computes `last_result_hash` and sets task status (`DONE`/`SKIPPED`/`FAILED`).

Key env/config dependency:
- `DISCOVERY_MAX_TASK_ATTEMPTS`
- `DISCOVERY_BACKOFF_BASE_SECONDS`
- `DISCOVERY_REFRESH_BUCKET`

Done means:
- Runnable task transitions to terminal state and writes artifacts.
- Metrics counters/logs are emitted for each run.

### 7) Documentation + Env Wiring

Files:
- `.env.example`
- `apps/worker/.env.example`
- `README.md`
- `docs/README.md`
- `docs/SERPAPI_DISCOVERY.md`
- `docs/DISCOVERY_PROVIDER_STACK.md`

What it does:
- Documents required discovery env vars and command flows.
- Adds a dedicated SerpAPI pipeline doc and provider stack doc.

Key env/config dependency:
- All discovery vars listed in `.env.example` and `apps/worker/.env.example`.

Done means:
- New contributors can find discovery env keys and seed/worker commands in docs.

## Verification Status

### Proven (via local execution in this audit)

1. Command: `pnpm --filter @lead-flood/discovery typecheck`  
Result: pass.

2. Command: `pnpm --filter @lead-flood/discovery build`  
Result: pass.

3. Command: `pnpm --filter @lead-flood/discovery test:unit`  
Result: pass (`2` files, `6` tests).

4. Command: `pnpm --filter @lead-flood/worker typecheck`  
Result: pass.

5. Command: `pnpm --filter @lead-flood/worker build`  
Result: pass.

6. Command: `pnpm --filter @lead-flood/api build`  
Result: pass.

7. Command: `pnpm --filter @lead-flood/db build`  
Result: pass; Prisma client generated from current schema.

8. Command: `pnpm --filter @lead-flood/db exec prisma migrate status --schema prisma/schema.prisma`  
Result: `Database schema is up to date!` after applying migrations.

9. Command: dry generation (no DB write, no network):  
`pnpm --filter @lead-flood/discovery exec node --import tsx -e "..."` using `generateTasks(...)`  
Result: generated `6912` tasks for `maxPagesPerQuery=1`, unique hashes matched task count.

10. Command: `pnpm discovery:seed`  
Result: fail when `SERPAPI_API_KEY` is missing (`SERPAPI_API_KEY is required`).

11. Command: `SERPAPI_API_KEY=dummy pnpm discovery:seed` before migrations  
Result: fail (`relation "search_tasks" does not exist`), confirming migration dependency.

12. Command: `pnpm db:migrate`  
Result: applied discovery migrations successfully.

13. Command: `SERPAPI_API_KEY=dummy pnpm discovery:seed` after migration (twice)  
Result:
- first run: `generated: 20736, inserted: 20736`
- second run: `generated: 20736, inserted: 0` (idempotency proven for same bucket).

14. Command: local mocked task execution (no external API):  
`pnpm --filter @lead-flood/discovery exec node --import tsx -e "..."` calling `runSearchTask` with mock provider  
Result: `status: DONE`, `newBusinesses: 1`, `newSources: 1`, evidence persisted.

15. Command: local DB verification query via Prisma  
Result: `search_tasks` shows `1 DONE + 20735 PENDING`, `sourceCount=1`, `businessCount=1`, `evidenceCount=1`.

### Assumed / Not Proven in this audit

- Real SerpAPI call success path with valid credentials and real responses (not exercised).
- Real pg-boss runtime behavior under multi-process deployment.
- Production scale behavior for concurrency/rate limiting across multiple worker instances.
- End-to-end API-triggered run (`POST /v1/discovery/runs`) coupled to SerpAPI task tables.

## Gaps / To-Do List

Priority 1 (High)

1. Retry ceiling enforcement in `run_search_task`  
Impact: tasks can continue to be picked after max attempts because selection includes all `FAILED` rows and terminal failure is not separated.  
Suggested next step: set terminal status (`SKIPPED` or new terminal enum) once attempts reach max; exclude terminal states from lock query.  
Complexity: M

2. Seed path hard-depends on `SERPAPI_API_KEY` even though seeding is DB-only  
Impact: onboarding friction and unnecessary secret requirement for local seeding/tests.  
Suggested next step: split config loading for seed vs run, or make `SERPAPI_API_KEY` optional for seed command only.  
Complexity: S

3. `DONE` task refresh behavior may rerun immediately when result hash changes  
Impact: potential over-polling and cost spikes; `run_after` set to now for changed results.  
Suggested next step: set explicit minimum cooldown for all completed tasks; use longer interval for unchanged.  
Complexity: S

Priority 2 (Medium)

4. Concurrency race windows on source/business dedupe  
Impact: duplicate create attempts may hit unique constraint under parallel workers and fail task.  
Suggested next step: transactional upsert patterns with conflict-aware retry handling.  
Complexity: M

5. Parser coverage for engine variants is partial  
Impact: missed leads/business fields and inconsistent extraction by result shape drift.  
Suggested next step: expand fixture-driven parser tests for `google`, `google_local`, `google_maps` payload variants.  
Complexity: M

6. No durable metrics sink/dashboard  
Impact: operational blind spots and slow incident response.  
Suggested next step: emit counters to existing observability pipeline or persist rollups in DB.  
Complexity: M

Priority 3 (Low/Planned)

7. Discovery-to-enrichment bridge is not first-class in this Serp task path  
Impact: discovered businesses may not automatically feed enrichment/scoring loop.  
Suggested next step: define explicit handoff job/event from `businesses`/`sources` to enrichment intake.  
Complexity: M

8. Documentation lacks explicit SQL inspection snippets for discovery tables  
Impact: slower debugging for new operators.  
Suggested next step: add quick inspect queries to `docs/SERPAPI_DISCOVERY.md`.  
Complexity: S

## Risks & Mitigations

1. Provider lock-in (SerpAPI single-point dependency)  
Risk: outages/quota issues stop discovery throughput.  
Mitigation: keep provider interface stable (`packages/discovery/src/providers/types.ts`), maintain secondary provider adapters, and add failover routing.

2. Legal/compliance for data usage and scraping-derived results  
Risk: terms-of-service and usage-policy violations.  
Mitigation: legal review of provider terms, enforce allowed-use policy, store evidence provenance for audit.

3. Data quality (duplicates/false positives/stale listings)  
Risk: wasted enrichment cost and noisy scoring.  
Mitigation: strengthen dedupe keys, add freshness windows, and introduce confidence thresholds before downstream actions.

4. Scaling/cost risk (query explosion)  
Risk: task volume grows quickly with city/category/template/page matrix; API cost spikes.  
Mitigation: strict caps (`DISCOVERY_MAX_PAGES_PER_QUERY`, RPS), priority frontier strategy, and budget guardrails/alerts.

5. Security/PII risk  
Risk: storing phone/address/contact data and API keys.  
Mitigation: key rotation policy, env secret hygiene, least-privilege access, and retention policy for evidence payloads.

6. Maintenance risk (brittle parsers + silent field drift)  
Risk: upstream response changes degrade extraction without obvious failures.  
Mitigation: fixture regression tests, parse coverage metrics, and explicit error/warning logs for dropped fields.

## How to Run Locally

```bash
# 1) Install + infra
corepack enable
pnpm install --frozen-lockfile
pnpm dev:infra

# 2) Apply DB migrations (required for search_tasks/sources/businesses/business_evidence)
pnpm db:migrate

# 3) Seed discovery frontier tasks (requires SERPAPI_API_KEY in current implementation)
SERPAPI_API_KEY=dummy pnpm discovery:seed

# 4) Start worker (normal entrypoint)
pnpm --filter @lead-flood/worker dev

# 5) Optional: local compile checks used in this audit
pnpm --filter @lead-flood/discovery typecheck
pnpm --filter @lead-flood/discovery build
pnpm --filter @lead-flood/discovery test:unit
pnpm --filter @lead-flood/worker typecheck
pnpm --filter @lead-flood/worker build
pnpm --filter @lead-flood/api build

# 6) Optional: inspect migration state
pnpm --filter @lead-flood/db exec prisma migrate status --schema prisma/schema.prisma
```

## Appendix: Key Files

- [`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma)
- [`packages/db/prisma/migrations/20260218022000_add_serp_discovery_pipeline_tables/migration.sql`](packages/db/prisma/migrations/20260218022000_add_serp_discovery_pipeline_tables/migration.sql)
- [`packages/discovery/src/providers/types.ts`](packages/discovery/src/providers/types.ts)
- [`packages/discovery/src/providers/serpapi.client.ts`](packages/discovery/src/providers/serpapi.client.ts)
- [`packages/discovery/src/dedupe/normalize.ts`](packages/discovery/src/dedupe/normalize.ts)
- [`packages/discovery/src/dedupe/task_key.ts`](packages/discovery/src/dedupe/task_key.ts)
- [`packages/discovery/src/queries/seeds.ts`](packages/discovery/src/queries/seeds.ts)
- [`packages/discovery/src/queries/generate_tasks.ts`](packages/discovery/src/queries/generate_tasks.ts)
- [`packages/discovery/src/seed_tasks.ts`](packages/discovery/src/seed_tasks.ts)
- [`packages/discovery/src/workers/run_search_task.ts`](packages/discovery/src/workers/run_search_task.ts)
- [`apps/worker/src/jobs/discovery.seed.job.ts`](apps/worker/src/jobs/discovery.seed.job.ts)
- [`apps/worker/src/jobs/discovery.run_search_task.job.ts`](apps/worker/src/jobs/discovery.run_search_task.job.ts)
- [`apps/worker/src/index.ts`](apps/worker/src/index.ts)
- [`apps/worker/src/queues.ts`](apps/worker/src/queues.ts)
- [`apps/worker/src/schedules.ts`](apps/worker/src/schedules.ts)
- [`.env.example`](.env.example)
- [`apps/worker/.env.example`](apps/worker/.env.example)
- [`docs/SERPAPI_DISCOVERY.md`](docs/SERPAPI_DISCOVERY.md)
