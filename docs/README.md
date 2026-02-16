# LEAD-FLOOD Documentation

## Read In Order

1. `README.md`
2. `docs/SETUP_ONBOARDING.md`
3. `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
4. `docs/DEPLOYMENT.md`
5. `docs/TROUBLESHOOTING.md`

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

## Core Paths

- API entrypoint: `apps/api/src/index.ts`
- API server routes: `apps/api/src/server.ts`
- Worker entrypoint: `apps/worker/src/index.ts`
- Contracts: `packages/contracts/src`
- Prisma schema: `packages/db/prisma/schema.prisma`
- CI workflow: `.github/workflows/ci.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
