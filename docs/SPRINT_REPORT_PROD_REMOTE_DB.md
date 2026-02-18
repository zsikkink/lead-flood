# Sprint Report: Production Remote DB

> Superseded by `docs/SPRINT_REPORT_SUPABASE_MIGRATIONS_SWITCH.md` for current canonical production migration flow.

## Summary

- Added a definitive production remote Postgres strategy for this monorepo.
- Standardized runtime vs migration connection guidance around `DATABASE_URL` and `DIRECT_URL`.
- Added repeatable production migration and verification scripts under `scripts/db/`.
- Intentionally omitted `seed-prod.sh` because existing seed flow is demo/bootstrap oriented and not production-safe.
- Added Vercel deployment checklist for the web app (`apps/web`) as API client.
- Updated environment templates with production-safe connection comments.
- Verified build/typecheck for API, worker, and web after changes.
- Verified new scripts fail fast with clear errors when required env vars are missing.

## Files Changed

- `.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `package.json`
- `scripts/db/migrate-prod.sh`
- `scripts/db/verify-prod.sh`
- `README.md`
- `docs/README.md`
- `docs/DEPLOYMENT.md`
- `docs/PROD_REMOTE_DB_STRATEGY.md`
- `docs/VERCEL_PROD_SETUP.md`
- `docs/SPRINT_REPORT_DISCOVERY_UI.md`
- `docs/SPRINT_REPORT_PROD_REMOTE_DB.md`

## Manual Provider Setup (UI)

Primary: Supabase Postgres (fallback: Neon)

1. Create a provider project in the region nearest API/worker runtime.
2. Create database and app DB user.
3. Copy pooled runtime connection URL.
4. Copy direct connection URL.
5. Ensure SSL-required URL format.
6. Store credentials in deployment environment-variable manager.

## Runtime Environment Variables

## API runtime

- `DATABASE_URL` (pooled URL)
- `DIRECT_URL` (direct URL)
- `PG_BOSS_SCHEMA`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ADMIN_API_KEY`

## Worker runtime

- `DATABASE_URL` (pooled URL)
- `DIRECT_URL` (recommended)
- `PG_BOSS_SCHEMA`

## Vercel (`apps/web`)

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ADMIN_API_KEY`

## Commands

```bash
# Migrate production DB
export DATABASE_URL='postgresql://...'
export DIRECT_URL='postgresql://...'
pnpm db:migrate:prod

# Verify production DB connectivity + migration state
pnpm db:verify:prod

# Optional env-file mode
ENV_FILE=.env.production.local pnpm db:migrate:prod
ENV_FILE=.env.production.local pnpm db:verify:prod
```

## Vercel Setup Checklist

1. In Vercel, create/import project with root directory `apps/web`.
2. Set framework preset to Next.js.
3. Set env vars for Preview and Production:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ADMIN_API_KEY`
4. Deploy.
5. Verify API DB readiness:

```bash
curl -sS https://<api-domain>/health
curl -sS https://<api-domain>/ready
```

Expected:
- `/health` returns `{"status":"ok"}`
- `/ready` returns `{"status":"ready","db":"ok"}`

## Validation Run Results

Executed:

```bash
pnpm --filter @lead-flood/api build
pnpm --filter @lead-flood/worker build
pnpm --filter @lead-flood/web build
DATABASE_URL= DIRECT_URL= bash scripts/db/migrate-prod.sh
DATABASE_URL= DIRECT_URL= bash scripts/db/verify-prod.sh
```

Observed:
- All three builds passed.
- `migrate-prod.sh` failed fast with: `Missing required env var: DATABASE_URL`.
- `verify-prod.sh` failed fast with: `Missing required env var: DATABASE_URL`.

## Risks / Limitations

- Free tiers can autosuspend inactive DBs.
- Backup/restore guarantees are limited on free plans.
- Migration rollback is forward-fix oriented in current workflow.
