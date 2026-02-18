# Discovery Coverage Report (Website + Instagram)

Audit date: 2026-02-18  
Scope: discovery ingestion coverage for `businesses.website_domain` and `businesses.instagram_handle`.

## Snapshot Used

- Data source: local Postgres (`lead_flood`) using `scripts/discovery/coverage.sql`
- Focus bucket: `2026-W08:small-validation-maps-patch`
- Supplementary payload inspection: `scripts/discovery/inspect_payloads.ts --limit 20 --timeBucket 2026-W08:small-validation-maps-patch`

## Coverage Metrics

### Overall (`businesses`)

- Total businesses: `471`
- With non-null `website_domain`: `87` (`18.47%`)
- With non-null `instagram_handle`: `1` (`0.21%`)

### Coverage by `task_type` (via evidence linkage)

| task_type | businesses | with website_domain | website % | with instagram_handle | instagram % |
|---|---:|---:|---:|---:|---:|
| `SERP_GOOGLE_LOCAL` | 100 | 0 | 0.00% | 0 | 0.00% |
| `SERP_MAPS_LOCAL` | 79 | 51 | 64.56% | 0 | 0.00% |
| `UNKNOWN` (no linked task) | 338 | 39 | 11.54% | 1 | 0.30% |

### Coverage by `time_bucket` + `task_type` (recent bucket)

| time_bucket | task_type | businesses | with website_domain | website % | with instagram_handle | instagram % |
|---|---|---:|---:|---:|---:|---:|
| `2026-W08:small-validation-maps-patch` | `SERP_GOOGLE_LOCAL` | 100 | 0 | 0.00% | 0 | 0.00% |
| `2026-W08:small-validation-maps-patch` | `SERP_MAPS_LOCAL` | 79 | 51 | 64.56% | 0 | 0.00% |

## Top Failure Modes

Grouped from `search_tasks`:

- `SERP_MAPS_LOCAL` `FAILED`: `6`
  - Error: `SerpApiRequestError: SerpAPI request failed with status 400`
- `SERP_MAPS_LOCAL` `RUNNING`: `7` (in-flight at snapshot time)
- `SERP_GOOGLE_LOCAL` `DONE`: `24`
- `SERP_MAPS_LOCAL` `DONE`: `12`

Primary failing task family is still `SERP_MAPS_LOCAL` with status `400` responses for a subset of tasks.

## Payload Inspection Findings

From `inspect_payloads.ts` on `2026-W08:small-validation-maps-patch`:

- `SERP_GOOGLE_LOCAL` sample (`n=20`):
  - Parsed website present: `0`
  - Parsed instagram present: `0`
  - Raw payload with website-like signal: `20`
  - Raw payload with instagram signal: `3`
  - Potential website parse misses: `20`
  - Potential instagram parse misses: `3`
- `SERP_MAPS_LOCAL` sample (`n=20`):
  - Parsed website present: `14`
  - Parsed instagram present: `0`
  - Raw payload with website-like signal: `20`
  - Potential website parse misses: `6`

Direct SQL payload samples confirm many `SERP_GOOGLE_LOCAL` rows contain website/IG in nested `links.website` (e.g., `https://saopaulomicroblading.com/`, `https://www.instagram.com/...`) while parsed fields remained null.

## Root Cause Assessment

### A) Missing upstream in provider payload?

- **Partially.**
- `SERP_GOOGLE_LOCAL`: upstream often includes website/IG hints in nested `links.website`.
- `SERP_MAPS_LOCAL`: often includes website; some rows only include SerpAPI utility links (photos/reviews), not business website/IG.

### B) Parser/normalization dropping available fields?

- **Yes (primary root cause for `SERP_GOOGLE_LOCAL`).**
- Existing parser handled `value.website`, `value.link`, `value.domain`, and `value.links` only when `links` was an array.
- Real payload shape frequently uses `links` as an object (`links.website`), which was not extracted.

### C) DB write path losing extracted fields?

- **Not primary.**
- For `SERP_MAPS_LOCAL`, when parser emits `websiteUrl`, writes to `website_domain` do persist.
- This indicates write path is working when normalized fields are present.

### D) Provenance/join issue in UI?

- **Not primary for this symptom.**
- Evidence rows are linked to `search_tasks`; null `website_domain`/`instagram_handle` corresponds to missing parsed values at ingest time for affected rows.

## Minimal Fix Implemented

Updated parser in `packages/discovery/src/providers/serpapi.client.ts`:

- Added extraction for nested `links` object and array candidates.
- Added website candidate selection that ignores Google Maps utility URLs and social profile URLs for canonical website capture.
- Added Instagram handle extraction from:
  - `instagram` field
  - website/link/domain candidates
  - nested `links.website` / `links.url` / `links.link`

Added unit tests in `packages/discovery/src/providers/serpapi.client.test.ts`:

- Verifies `SERP_GOOGLE_LOCAL` with `links.website` object path now extracts website and IG handle.
- Verifies links arrays and filtering of Google Maps links.

## Smallest Next-Step Experiment (for residual gaps)

Residual gaps remain where provider payload does not include canonical website/IG.

Recommended minimal experiment (no crawler buildout):

1. Add a small bounded organic supplement:
   - Include `SERP_GOOGLE` tasks for only top categories/cities from small profile.
   - Cap at `20–40` tasks per run.
2. Join by business name + city heuristics to attach candidate website domains.
3. Keep strict guardrails:
   - `DISCOVERY_RUN_MAX_TASKS=40`
   - limit to one extra page (`DISCOVERY_SEED_MAX_PAGES=1`)
   - separate seed bucket (e.g., `coverage-organic-exp-1`)

Expected outcome: improved `website_domain` coverage without introducing website crawling.

## Repro Commands

```bash
# Coverage SQL
DB_URL="postgresql://postgres:postgres@localhost:5434/lead_flood"
psql "$DB_URL" -f scripts/discovery/coverage.sql

# Payload inspection summary
pnpm --filter @lead-flood/worker exec tsx ../../scripts/discovery/inspect_payloads.ts \
  --limit 20 \
  --timeBucket "2026-W08:small-validation-maps-patch"

# Parser regression tests
pnpm --filter @lead-flood/discovery test:unit
```
