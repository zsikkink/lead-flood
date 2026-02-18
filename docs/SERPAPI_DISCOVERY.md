# SerpAPI Discovery Pipeline

## Required Environment Variables

Set in `apps/worker/.env.local`:

```bash
SERPAPI_API_KEY=...
DISCOVERY_COUNTRIES=JO,SA,AE,EG
DISCOVERY_LANGUAGES=en,ar
DISCOVERY_MAX_PAGES_PER_QUERY=3
DISCOVERY_REFRESH_BUCKET=weekly
DISCOVERY_RPS=1
DISCOVERY_CONCURRENCY=3
DISCOVERY_ENABLE_CACHE=true
DISCOVERY_MAPS_ZOOM=13
DISCOVERY_MAX_TASK_ATTEMPTS=5
DISCOVERY_BACKOFF_BASE_SECONDS=30
DISCOVERY_RUN_MAX_TASKS=

DISCOVERY_SEED_PROFILE=default
DISCOVERY_SEED_MAX_TASKS=40
DISCOVERY_SEED_MAX_PAGES=1
DISCOVERY_SEED_COUNTRIES=AE,SA,JO,EG
DISCOVERY_SEED_LANGUAGES=en,ar
DISCOVERY_SEED_TASK_TYPES=SERP_MAPS_LOCAL,SERP_GOOGLE_LOCAL
DISCOVERY_SEED_BUCKET=
```

Set in `apps/api/.env.local` and `apps/web/.env.local` for admin endpoint protection:

```bash
ADMIN_API_KEY=your-local-admin-key
```

Do not expose `ADMIN_API_KEY` in any `NEXT_PUBLIC_*` variable.

## Commands

Seed tasks from CLI:

```bash
pnpm discovery:seed
```

Start the worker:

```bash
pnpm --filter @lead-flood/worker dev
```

The worker runs:

- `discovery.seed`
- `discovery.run_search_task`

Start API and web for the discovery console:

```bash
pnpm --filter @lead-flood/api dev
pnpm --filter @lead-flood/web dev
```

Open `http://localhost:3000/discovery`.

## Small Real Validation Run

### 1) Apply migrations

```bash
pnpm db:migrate
```

### 2) Seed a bounded small frontier (no SerpAPI key required for seeding)

```bash
DISCOVERY_SEED_PROFILE=small \
DISCOVERY_SEED_MAX_TASKS=40 \
DISCOVERY_SEED_MAX_PAGES=1 \
pnpm discovery:seed
```

### 3) Run worker against real SerpAPI responses with bounded processing

```bash
DISCOVERY_RUN_MAX_TASKS=40 \
SERPAPI_API_KEY=<your-serpapi-key> \
pnpm --filter @lead-flood/worker dev
```

### 4) Trigger jobs from UI

In `/discovery/jobs`:

- Trigger seed with profile `small`
- Trigger bounded run with `maxTasks=40`

Live telemetry updates in `/discovery/jobs` and lead/task tables refresh automatically.

## Discovery Admin API Endpoints

- `GET /v1/admin/leads`
- `GET /v1/admin/leads/:id`
- `GET /v1/admin/search-tasks`
- `GET /v1/admin/search-tasks/:id`
- `POST /v1/admin/jobs/discovery/seed`
- `POST /v1/admin/jobs/discovery/run`
- `GET /v1/admin/jobs/runs`
- `GET /v1/admin/jobs/runs/:id`

If `ADMIN_API_KEY` is set, send header `x-admin-key: <value>`.

## Verification SQL (Postgres)

### Task counts by status for latest bucket

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

### Task counts by status for a specific seed bucket override

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

### Businesses inserted in the last hour

```sql
SELECT COUNT(*) AS businesses_last_hour
FROM businesses
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

### Sources inserted in the last hour

```sql
SELECT COUNT(*) AS sources_last_hour
FROM sources
WHERE created_at >= NOW() - INTERVAL '1 hour';
```

### 10 sample businesses joined with one evidence row

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

### Search-task provenance linkage for evidence

```sql
SELECT
  be.id AS evidence_id,
  b.id AS business_id,
  b.name,
  st.id AS search_task_id,
  st.task_type,
  st.query_text,
  st.country_code,
  st.city,
  st.language,
  st.time_bucket
FROM business_evidence be
JOIN businesses b ON b.id = be.business_id
LEFT JOIN search_tasks st ON st.id = be.search_task_id
ORDER BY be.created_at DESC
LIMIT 25;
```

### Job telemetry (seed/run controls)

```sql
SELECT
  id,
  job_name,
  status,
  started_at,
  finished_at,
  duration_ms,
  counters_json,
  resource_json,
  error_text
FROM job_runs
ORDER BY started_at DESC
LIMIT 20;
```

## Database Objects

New tables:

- `search_tasks`
- `sources`
- `businesses`
- `business_evidence`
- `job_runs`

Task uniqueness:

- `UNIQUE(task_type, query_hash)`

Business dedupe indexes:

- unique `website_domain` where not null
- unique `phone_e164` where not null

## Throughput and Cost Controls

- `DISCOVERY_RPS` controls global SerpAPI request rate.
- `DISCOVERY_CONCURRENCY` controls worker batch processing parallelism.
- `DISCOVERY_MAX_PAGES_PER_QUERY` limits total pagination spend per query template.
- `DISCOVERY_ENABLE_CACHE=false` forces fresh API responses (`no_cache=true`) and higher credit usage.
- `DISCOVERY_MAPS_ZOOM` controls `SERP_MAPS_LOCAL` zoom when location is provided (default `z=13` for city-wide results).
- `DISCOVERY_RUN_MAX_TASKS` limits processing volume in bounded validation runs.
- `DISCOVERY_SEED_PROFILE=small` generates a tiny deterministic frontier for local E2E checks.

## Maps Engine Note

- `SERP_MAPS_LOCAL` requests with `location` require `z` or `m`.
- Worker now applies `z=13` by default for city-wide coverage.
- Override with `DISCOVERY_MAPS_ZOOM` (valid range: `3` to `20`).

## Operational Risks

- Invalid/expired `SERPAPI_API_KEY` will prevent task completion.
- Aggressive RPS and concurrency can increase credit consumption and 429 frequency.
- Some local business entries may not contain domains/phones; evidence is still stored for audit and later enrichment.
