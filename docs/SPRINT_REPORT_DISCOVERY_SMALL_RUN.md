# Sprint Report: Discovery Small Validation Run

## 1) Summary

- Added a `small` seed profile to the existing `pnpm discovery:seed` flow.
- Kept default seed behavior unchanged (`DISCOVERY_SEED_PROFILE=default` still generates the full frontier).
- Removed SerpAPI key requirement from seeding; `discovery:seed` now works without `SERPAPI_API_KEY`.
- Added small-profile env controls for countries, languages, pages, task types, optional seed bucket, and hard max tasks.
- Implemented a hard cap check for small-profile seeding; seed aborts with a clear error if generated tasks exceed `DISCOVERY_SEED_MAX_TASKS`.
- Added bounded processing mode for `discovery.run_search_task` via `DISCOVERY_RUN_MAX_TASKS`.
- Bounded run loop now stops re-enqueueing when max tasks is reached or when queue is empty in bounded mode.
- Updated env examples and SerpAPI docs with copy/paste commands and SQL verification queries.

## 2) Files Changed / Added

- `.env.example`
- `apps/worker/.env.example`
- `apps/worker/src/env.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/jobs/discovery.run_search_task.job.ts`
- `packages/discovery/src/config.ts`
- `packages/discovery/src/queries/seeds.ts`
- `packages/discovery/src/queries/generate_tasks.ts`
- `packages/discovery/src/seed_tasks.ts`
- `packages/discovery/src/cli/seed.ts`
- `docs/SERPAPI_DISCOVERY.md`
- `docs/SPRINT_REPORT_DISCOVERY_SMALL_RUN.md`

## 3) Behavior Changes

- `pnpm discovery:seed` no longer fails when `SERPAPI_API_KEY` is missing.
- New seed profile support:
  - `DISCOVERY_SEED_PROFILE=default` uses full/default frontier generation.
  - `DISCOVERY_SEED_PROFILE=small` generates a deterministic tiny frontier.
- Small profile currently generates tasks from:
  - 1–2 major cities per configured country.
  - 8-category small taxonomy per language.
  - 1 template per language.
  - configured task types and pages.
- Hard cap enforcement is active for small profile:
  - if generated task count exceeds `DISCOVERY_SEED_MAX_TASKS`, seed aborts before inserts.
- New optional seed bucket suffix:
  - `DISCOVERY_SEED_BUCKET=<suffix>` appends `:<suffix>` to `time_bucket`.
- New bounded worker mode:
  - `DISCOVERY_RUN_MAX_TASKS=<N>` limits processed tasks in the existing `discovery.run_search_task` loop.
  - bounded mode stops loop on max reached or empty queue.

## 4) How To Run

```bash
# 1) Apply migrations
pnpm db:migrate

# 2) Seed a tiny deterministic frontier (no SERPAPI_API_KEY required)
DISCOVERY_SEED_PROFILE=small \
DISCOVERY_SEED_MAX_TASKS=40 \
DISCOVERY_SEED_MAX_PAGES=1 \
DISCOVERY_SEED_BUCKET=small-validation \
pnpm discovery:seed

# 3) Run worker against real SerpAPI with bounded processing
DISCOVERY_RUN_MAX_TASKS=40 \
SERPAPI_API_KEY=<your-serpapi-key> \
pnpm --filter @lead-flood/worker dev
```

## 5) How To Verify

### A) Task counts by status for latest bucket

```sql
SELECT
  time_bucket,
  status,
  COUNT(*) AS task_count
FROM search_tasks
WHERE time_bucket = (SELECT MAX(time_bucket) FROM search_tasks)
GROUP BY time_bucket, status
ORDER BY time_bucket, status;
```

Expected:
- Status counts should move from `PENDING` toward `DONE`/`FAILED` as worker runs.

### B) Task counts by status for an explicit small run bucket

```sql
SELECT
  time_bucket,
  status,
  COUNT(*) AS task_count
FROM search_tasks
WHERE time_bucket LIKE '%' || ':small-validation'
GROUP BY time_bucket, status
ORDER BY time_bucket, status;
```

Expected:
- Only rows for the small validation run bucket are returned.

### C) Businesses inserted in the last hour

```sql
SELECT COUNT(*) AS businesses_last_hour
FROM businesses
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

Expected:
- Count increases when local business results are parsed and persisted.

### D) Sources inserted in the last hour

```sql
SELECT COUNT(*) AS sources_last_hour
FROM sources
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

Expected:
- Count increases from organic/local URLs discovered by worker processing.

### E) Sample businesses with joined evidence

```sql
SELECT
  b.id,
  b.name,
  b.city,
  b.country_code,
  b.phone_e164,
  b.website_domain,
  e.source_type,
  e.source_url,
  e.created_at AS evidence_created_at
FROM businesses b
LEFT JOIN LATERAL (
  SELECT be.source_type, be.source_url, be.created_at
  FROM business_evidence be
  WHERE be.business_id = b.id
  ORDER BY be.created_at DESC
  LIMIT 1
) e ON TRUE
WHERE b.created_at >= NOW() - INTERVAL '1 hour'
ORDER BY b.created_at DESC
LIMIT 10;
```

Expected:
- Rows with business metadata and at least one evidence source URL for recent inserts.

## 6) Known Issues / Limitations

- `DISCOVERY_RUN_MAX_TASKS` is process-local in-memory counting; it is not globally coordinated across multiple worker processes.
- In bounded mode with high concurrency, processed task count can slightly overshoot the target due concurrent job execution.
- If seeding without `DISCOVERY_SEED_BUCKET` in a bucket that already has matching hashes, inserts may be `0` because dedupe is working as designed.
- Worker runtime still requires `SERPAPI_API_KEY`; only seeding is key-free.

## 7) Next Steps (Prioritized)

1. Persist bounded-run counters/state in DB for strict multi-worker max-task enforcement.
2. Add an optional seed preflight output mode (`--plan`) to print generated task counts before insert.
3. Add discovery worker integration tests for bounded-run stop behavior (`max reached`, `empty queue`).
4. Add docs examples for multiple named `DISCOVERY_SEED_BUCKET` values per developer/session.

## Patch: Maps Zoom

- Updated SerpAPI maps-local request building to include default `z=13` when:
  - `engine=google_maps`
  - `location` is present
  - neither `z` nor `m` is already set
- Added runtime override env var: `DISCOVERY_MAPS_ZOOM` (valid range `3..20`).
- Invalid `DISCOVERY_MAPS_ZOOM` now falls back to `13` and emits a startup warning once.
- Improved provider error message context for task errors:
  - includes HTTP status
  - includes SerpAPI `.error` string when present
  - includes request context fields: `engine`, `q`, `location`, `gl`, `hl`, `z`, `m`
  - API key is not included in logs/messages.

### Patch Verification Commands

```bash
# 1) Seed a small bucket including maps + google_local
DISCOVERY_SEED_PROFILE=small \
DISCOVERY_SEED_TASK_TYPES=SERP_MAPS_LOCAL,SERP_GOOGLE_LOCAL \
DISCOVERY_SEED_MAX_TASKS=40 \
DISCOVERY_SEED_MAX_PAGES=1 \
DISCOVERY_SEED_BUCKET=small-validation-maps-patch \
pnpm discovery:seed

# 2) Run bounded worker with maps zoom override
DISCOVERY_RUN_MAX_TASKS=40 \
DISCOVERY_MAPS_ZOOM=13 \
SERPAPI_API_KEY=<your-serpapi-key> \
pnpm --filter @lead-flood/worker dev
```

### Patch Verification SQL

```sql
SELECT
  task_type,
  status,
  COUNT(*) AS task_count
FROM search_tasks
WHERE time_bucket LIKE '%:small-validation-maps-patch'
GROUP BY task_type, status
ORDER BY task_type, status;
```

```sql
SELECT
  COUNT(*) AS missing_zoom_failures
FROM search_tasks
WHERE time_bucket LIKE '%:small-validation-maps-patch'
  AND task_type = 'SERP_MAPS_LOCAL'
  AND status = 'FAILED'
  AND error ILIKE '%Missing ''z'' or ''m'' parameter%';
```

Expected:
- `SERP_MAPS_LOCAL` should show meaningful `DONE` counts.
- `missing_zoom_failures` should be `0`.
