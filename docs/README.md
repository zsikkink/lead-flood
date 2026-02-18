# LEAD-FLOOD Documentation

## Read In Order

1. `README.md`
2. `docs/SETUP_ONBOARDING.md`
3. `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
4. `docs/DEPLOYMENT.md`
5. `docs/TROUBLESHOOTING.md`
6. `docs/DISCOVERY_PROVIDER_STACK.md`
7. `docs/SERPAPI_DISCOVERY.md`
8. `docs/SPRINT_REPORT_DISCOVERY_UI.md`

## What Each Document Covers

- `README.md`
  - Fast local startup
  - Core scripts
  - Common command set

- `docs/SETUP_ONBOARDING.md`
  - New contributor onboarding flow
  - Environment file setup
  - Local run/test troubleshooting

- `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
  - Current architecture and module boundaries
  - Implemented API and worker pipeline behavior
  - Data model and extension points

- `docs/DEPLOYMENT.md`
  - CI checks
  - Image build/publish flow
  - Staging/production deployment triggers

- `docs/TROUBLESHOOTING.md`
  - Setup/runtime/test failure handling
  - Known warnings/deprecations
  - Current limitations and mitigation notes

- `docs/DISCOVERY_PROVIDER_STACK.md`
  - Discovery/enrichment provider toggles and required env vars
  - Fanout ordering and rollout plan
  - Cost/rate and operational risk notes

- `docs/SERPAPI_DISCOVERY.md`
  - SerpAPI-based task seeding and worker processing flow
  - Required runtime env vars and local commands
  - New discovery persistence tables and dedupe guarantees

- `docs/SPRINT_REPORT_DISCOVERY_UI.md`
  - Discovery console implementation summary
  - Admin endpoints, telemetry, and provenance linkage details
  - Verification commands and SQL checks

## Core Paths

- API entrypoint: `apps/api/src/index.ts`
- API server routes: `apps/api/src/server.ts`
- Worker entrypoint: `apps/worker/src/index.ts`
- Contracts: `packages/contracts/src`
- Prisma schema: `packages/db/prisma/schema.prisma`
- CI workflow: `.github/workflows/ci.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
