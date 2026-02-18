# Sprint Report: Supabase SQL-First Migration Switch

## Summary

- Switched production schema workflow from Prisma migration deploy to Supabase CLI SQL-first migrations.
- Added canonical migration directory at `supabase/migrations` and populated it from existing migration SQL.
- Added Supabase project config at `supabase/config.toml`.
- Added production migration/link/verification/drift scripts under `scripts/db/`.
- Added production guardrail to block `prisma migrate deploy` in production context.
- Updated package scripts to default to Supabase-based production migration flow.
- Added Prisma DB-derived sync script (`db pull` + `generate`).
- Updated env examples and docs with Supabase project ref and key-handling policy.

## Files Changed / Added

- `.env.example`
- `.gitignore`
- `README.md`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/worker/.env.example`
- `docs/DEPLOYMENT.md`
- `docs/README.md`
- `docs/PROD_REMOTE_DB_STRATEGY.md`
- `docs/VERCEL_PROD_SETUP.md`
- `docs/SPRINT_REPORT_DISCOVERY_UI.md`
- `docs/SPRINT_REPORT_PROD_REMOTE_DB.md`
- `docs/SPRINT_REPORT_SUPABASE_MIGRATIONS_SWITCH.md`
- `package.json`
- `packages/db/package.json`
- `scripts/db/guard-no-prisma-migrate-prod.sh`
- `scripts/db/migrate-prod.sh`
- `scripts/db/prisma-sync.sh`
- `scripts/db/pull-drift.sh`
- `scripts/db/supabase-link.sh`
- `scripts/db/verify-prod.sh`
- `supabase/config.toml`
- `supabase/migrations/*.sql`

## New Commands

- `pnpm db:link`
  - Verifies CLI/auth and links project (`cbcgrzvqidtrtrtnzlso` by default).
- `pnpm db:migrate:prod`
  - Applies SQL migrations in `supabase/migrations` to linked project.
- `pnpm db:verify:prod`
  - Verifies migration state via Supabase CLI + SQL metadata checks.
- `pnpm db:pull:drift -- --confirm`
  - Captures remote schema drift into a SQL migration (manual review required).
- `pnpm db:prisma:sync`
  - Runs Prisma introspection + client generation from DB.

All scripts support `ENV_FILE=...`.

## One-Time Manual Setup

1. Install Supabase CLI.
2. Authenticate CLI:

```bash
supabase login
```

3. Set environment variables (locally or in CI/ops secret store):
- `SUPABASE_PROJECT_REF=cbcgrzvqidtrtrtnzlso`
- `SUPABASE_ACCESS_TOKEN` (or rely on login session)
- `SUPABASE_DB_PASSWORD` (for non-interactive CLI operations when required)
- `DATABASE_URL`
- `DIRECT_URL`

4. Link project:

```bash
pnpm db:link
```

## Apply Production Migrations

```bash
pnpm db:link
pnpm db:migrate:prod
pnpm db:verify:prod
pnpm db:prisma:sync
```

With env file:

```bash
ENV_FILE=.env.production.local pnpm db:link
ENV_FILE=.env.production.local pnpm db:migrate:prod
ENV_FILE=.env.production.local pnpm db:verify:prod
ENV_FILE=.env.production.local pnpm db:prisma:sync
```

## Drift Handling Workflow

Use only when schema changed outside committed SQL migrations:

```bash
pnpm db:pull:drift -- --confirm
```

Then:
1. Review generated SQL migration for noise.
2. Re-run `pnpm db:verify:prod`.
3. Commit migration SQL.

## Guardrails Added

- Production guard script blocks `prisma migrate deploy` when:
  - `NODE_ENV=production`, or
  - `ENVIRONMENT=production`, or
  - `PROD_GUARD=1`.
- `packages/db` Prisma migrate script now runs the guard before migration command.
- Docs explicitly forbid Prisma production migration deploy.

## Supabase Project Context

- Project ref: `cbcgrzvqidtrtrtnzlso`
- Publishable key: set via env (`SUPABASE_PUBLISHABLE_KEY`), no hardcoded value
- Service role key: must be set manually outside git and never committed.

## Validation Executed

Build checks:

```bash
pnpm --filter @lead-flood/api build
pnpm --filter @lead-flood/worker build
pnpm --filter @lead-flood/web build
```

Script behavior checks:

```bash
bash scripts/db/supabase-link.sh
bash scripts/db/migrate-prod.sh
DATABASE_URL= bash scripts/db/verify-prod.sh
bash scripts/db/pull-drift.sh
PATH="/usr/bin:/bin" bash scripts/db/supabase-link.sh
TMP_HOME="$(mktemp -d)"; HOME="$TMP_HOME" bash scripts/db/supabase-link.sh; rm -rf "$TMP_HOME"
SUPABASE_PROJECT_REF=aaaaaaaaaaaaaaaaaaaa bash scripts/db/migrate-prod.sh
```

Observed outcomes:
- Builds passed.
- `db:link` linked to default project ref.
- `db:migrate:prod` executed Supabase SQL migration flow.
- `db:verify:prod` failed fast with clear missing `DATABASE_URL` message when unset.
- `db:pull:drift` failed fast without `--confirm`.
- `db:link` failed fast with clear message when Supabase CLI is unavailable.
- `db:link` failed fast with clear message when CLI is unauthenticated.
- `db:migrate:prod` failed fast when target project ref was not linked.

## Known Limitations / Risks

- Supabase CLI must be installed and authenticated where scripts run.
- `db:migrate:prod` now requires project to be linked first (`pnpm db:link`).
- Drift pull may generate noisy SQL and requires careful manual review.
- Free-tier environments can have limits/cold starts.
