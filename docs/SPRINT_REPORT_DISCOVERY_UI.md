# Sprint Report: Discovery UI

## Summary

- Added a production-oriented discovery console in the existing Next.js app under `/discovery`.
- Implemented leads browsing with server-side filters, sorting, pagination, and 4s auto-refresh.
- Added lead detail view with score breakdown, evidence timeline, and provenance to `search_tasks`.
- Added search-task explorer with list/detail views, params JSON, derived request fields, and linked outputs.
- Added job controls UI for triggering seed and bounded discovery runs.
- Added durable job telemetry via new `job_runs` table and API endpoints.
- Added admin endpoint protection via optional `ADMIN_API_KEY` (`x-admin-key` header).
- Added evidence-to-task provenance linkage via `business_evidence.search_task_id`.
- Added business signal/score fields on `businesses` and worker-side scoring updates during ingestion.
- Added API module `/v1/admin/*` for leads/tasks/jobs with typed Zod contracts.

## Files Changed / Added

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260218043000_add_discovery_ui_job_runs_and_provenance/migration.sql`
- `packages/contracts/src/discovery-admin.contract.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/src/modules/index.ts`
- `apps/api/src/modules/discovery-admin/discovery-admin.errors.ts`
- `apps/api/src/modules/discovery-admin/discovery-admin.repository.ts`
- `apps/api/src/modules/discovery-admin/discovery-admin.routes.ts`
- `apps/api/src/modules/discovery-admin/discovery-admin.service.ts`
- `apps/api/src/modules/discovery-admin/index.ts`
- `apps/worker/src/jobs/discovery.seed.job.ts`
- `apps/worker/src/jobs/discovery.run_search_task.job.ts`
- `packages/discovery/src/workers/run_search_task.ts`
- `apps/web/src/lib/env.ts`
- `apps/web/src/lib/discovery-admin.ts`
- `apps/web/app/page.tsx`
- `apps/web/app/discovery/layout.tsx`
- `apps/web/app/discovery/discovery.css`
- `apps/web/app/discovery/page.tsx`
- `apps/web/app/discovery/leads/[id]/page.tsx`
- `apps/web/app/discovery/search-tasks/page.tsx`
- `apps/web/app/discovery/search-tasks/[id]/page.tsx`
- `apps/web/app/discovery/jobs/page.tsx`
- `apps/web/app/discovery/jobs/[id]/page.tsx`
- `.env.example`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docs/SERPAPI_DISCOVERY.md`
- `docs/README.md`
- `README.md`

## Schema Changes + Migrations

Migration applied:

- `packages/db/prisma/migrations/20260218043000_add_discovery_ui_job_runs_and_provenance/migration.sql`

Database additions:

- New enum: `JobRunStatus` (`RUNNING`, `SUCCESS`, `FAILED`, `CANCELED`)
- New table: `job_runs`
  - `job_name`, `started_at`, `finished_at`, `duration_ms`, `status`
  - `params_json`, `counters_json`, `resource_json`, `error_text`
  - indexed by `(job_name, started_at)` and `(status, started_at)`
- `business_evidence`
  - added `search_task_id` FK to `search_tasks(id)`
  - index on `search_task_id`
- `businesses`
  - added scoring/signal fields:
    - `deterministic_score`, `score_band`
    - `has_whatsapp`, `has_instagram`, `accepts_online_payments`
    - `follower_count`, `physical_address_present`, `recent_activity`
  - added indexes for `score_band`, `deterministic_score`

## How To Run + Verify

### 1) Setup

```bash
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm db:migrate
```

### 2) Environment

Set in `apps/api/.env.local`:

```bash
ADMIN_API_KEY=local-admin-key
```

Set in `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:5050
NEXT_PUBLIC_ADMIN_API_KEY=local-admin-key
```

Set in `apps/worker/.env.local`:

```bash
SERPAPI_API_KEY=REAL_KEY
DISCOVERY_RUN_MAX_TASKS=40
```

### 3) Start services

```bash
pnpm --filter @lead-flood/api dev
pnpm --filter @lead-flood/worker dev
pnpm --filter @lead-flood/web dev
```

### 4) UI click-path

- Open `http://localhost:3000/discovery`
- Leads page:
  - apply filters/sort, paginate, click a row for detail
- Lead detail:
  - inspect score breakdown + evidence timeline + linked search task
- Search Tasks page:
  - filter by status/type/country/time bucket and open task detail
- Jobs page:
  - trigger seed (`small`) and then bounded run
  - observe live run counters/status
- Job detail:
  - inspect `params_json`, `counters_json`, `resource_json`

### 5) API calls

```bash
curl -sS -H "x-admin-key: local-admin-key" "http://localhost:5050/v1/admin/leads?page=1&pageSize=20"
curl -sS -H "x-admin-key: local-admin-key" "http://localhost:5050/v1/admin/search-tasks?page=1&pageSize=20"
curl -sS -X POST -H "content-type: application/json" -H "x-admin-key: local-admin-key" \
  "http://localhost:5050/v1/admin/jobs/discovery/seed" \
  -d '{"profile":"small","maxTasks":40,"maxPages":1,"bucket":"ui-validation"}'
curl -sS -X POST -H "content-type: application/json" -H "x-admin-key: local-admin-key" \
  "http://localhost:5050/v1/admin/jobs/discovery/run" \
  -d '{"maxTasks":40,"concurrency":1,"timeBucket":"2026-W08:ui-validation"}'
curl -sS -H "x-admin-key: local-admin-key" "http://localhost:5050/v1/admin/jobs/runs?page=1&pageSize=20"
```

### 6) SQL verification

```sql
-- job telemetry
SELECT id, job_name, status, started_at, finished_at, duration_ms, counters_json, resource_json, error_text
FROM job_runs
ORDER BY started_at DESC
LIMIT 20;

-- search-task progress for a specific seed bucket
SELECT time_bucket, status, COUNT(*) AS task_count
FROM search_tasks
WHERE time_bucket LIKE '%:ui-validation'
GROUP BY time_bucket, status
ORDER BY time_bucket, status;

-- leads/businesses written recently with scores
SELECT id, name, country_code, city, deterministic_score, score_band, created_at
FROM businesses
WHERE created_at >= NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 25;

-- provenance linkage: evidence -> search task
SELECT be.id AS evidence_id, b.name, st.id AS search_task_id, st.task_type, st.query_text, st.language, st.time_bucket
FROM business_evidence be
JOIN businesses b ON b.id = be.business_id
LEFT JOIN search_tasks st ON st.id = be.search_task_id
ORDER BY be.created_at DESC
LIMIT 25;
```

## What Is Proven Working vs Assumed

Proven (executed locally):

- `pnpm --filter @lead-flood/db build`
- `pnpm --filter @lead-flood/contracts build`
- `pnpm --filter @lead-flood/discovery build`
- `pnpm --filter @lead-flood/worker build`
- `pnpm --filter @lead-flood/api build`
- `pnpm --filter @lead-flood/web build`
- `pnpm --filter @lead-flood/api test:unit`
- `pnpm --filter @lead-flood/discovery test:unit`
- `pnpm --filter @lead-flood/db prisma:migrate`

Assumed (not fully exercised in this sprint):

- Full UI E2E with live SerpAPI key and long-running worker session.
- Multi-user admin-key security beyond local environment.
- Exact SerpAPI cached-response counts (resource telemetry currently best-effort).

## Known Gaps / Risks

- Business-level score is deterministic and heuristic, not ICP-specific model scoring.
- Job-run resource metrics are best-effort estimates (`serpapi_requests` ~= processed tasks).
- `cpu_ms` and `memory_mb_peak` are not captured yet.
- Existing historical businesses created before this migration may have default score/signal fields until reprocessed.
- Bounded run telemetry assumes a single worker process coordinating in-memory run state.

## Next Steps

1. Move run-state coordination from in-memory map to DB-backed coordination for multi-worker safety.
2. Add API integration tests for `/v1/admin/*` endpoints and trigger flows.
3. Add ICP-specific scoring overlays for business leads (optional model version binding).
4. Add SSE stream for job/lead updates to reduce polling latency.
5. Add explicit cost dashboard fields (credits used, estimated spend) once provider billing signals are available.

## Live Updates Toggle Patch

### Summary of Changes

- Added a user-toggleable Live Updates control for Discovery console pages.
- Added persisted local settings in `localStorage`:
  - `discovery.live.enabled`
  - `discovery.live.intervalMs`
  - `discovery.live.onlyWhenRunning`
- Default behavior is now no polling (`enabled=false`), which removes idle flicker.
- Added interval presets (2s/5s/10s/30s/60s) and custom interval input (seconds).
- Added `Only while jobs running` guard (default `true`).
- When guard is enabled, pages pause polling when no jobs are `RUNNING` and resume automatically once jobs are running.
- Updated Leads, Search Tasks, and Jobs pages to avoid full loading states during background refresh.
- Added subtle status metadata: `Updating...` and `Last updated`.

### Files Changed

- `apps/web/src/lib/discovery-live.ts`
- `apps/web/src/components/live-updates-control.tsx`
- `apps/web/app/discovery/page.tsx`
- `apps/web/app/discovery/search-tasks/page.tsx`
- `apps/web/app/discovery/jobs/page.tsx`
- `apps/web/app/discovery/discovery.css`

### Manual Verification Steps

1. Start services:

```bash
pnpm dev:infra
pnpm db:migrate
pnpm --filter @lead-flood/api dev
pnpm --filter @lead-flood/worker dev
pnpm --filter @lead-flood/web dev
```

2. Open `http://localhost:3000/discovery`.

3. Verify default idle behavior:
- Live Updates is OFF by default.
- No periodic list refresh when idle.
- Existing table content remains stable with no flicker.

4. Turn Live Updates ON and set interval to `2s`:
- Lists refresh at the selected interval.
- Prior table data stays visible during updates.
- Status shows `Updating...` briefly and `Last updated` time advances.

5. Enable `Only while jobs running`:
- With zero `RUNNING` jobs, list polling pauses.
- Trigger run from `http://localhost:3000/discovery/jobs`.
- Polling resumes automatically within one interval.

6. Reload the browser tab:
- Live settings persist across reload (`enabled`, `intervalMs`, `onlyWhenRunning`).
