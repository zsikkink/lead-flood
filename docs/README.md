# LEAD-FLOOD Documentation

## Start Here
- `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
  - System purpose and current implemented scope
  - Repository map (every top-level directory and file responsibilities)
  - Runtime/data flow narratives (lead creation, outbox, worker lifecycle)
  - Developer workflow and extension patterns
  - Environment/operations model and CI/deploy behavior
  - Verified command audit and onboarding Q&A

## Quick Orientation
- Project root quick start: `README.md`
- API bootstrap entry: `apps/api/src/index.ts`
- Worker bootstrap entry: `apps/worker/src/index.ts`
- Web entry page: `apps/web/app/page.tsx`
- Contracts source of truth: `packages/contracts/src`
- Database schema/migrations: `packages/db/prisma`
- CI pipeline: `.github/workflows/ci.yml`
- Deploy workflow: `.github/workflows/deploy.yml`

## Learning Utilities
- Backfill feature snapshots:
  - `pnpm learning:backfill-features -- --icpProfileId <icp_id> --batchSize 200`
  - Dry run: `pnpm learning:backfill-features -- --dry-run`
