# Production Remote DB Strategy

## Canonical Schema Workflow

Supabase SQL-first migrations are the canonical source of truth.

- Canonical migration files: `supabase/migrations/*.sql`
- Production migration driver: Supabase CLI (`supabase db push`)
- Prisma is DB-derived only (`prisma db pull` + `prisma generate`)
- `prisma migrate deploy` is forbidden in production workflows

## Primary Provider (Recommended): Supabase Postgres (Free Tier)

Supabase is the primary production-like remote Postgres provider for this repo.

Why this matches current constraints:
- Free tier available.
- Native Supabase CLI migration workflow.
- Standard Postgres connection strings with SSL.
- Works with Vercel-hosted web app where API remains DB client.

Project context for this repository:
- `SUPABASE_PROJECT_REF=cbcgrzvqidtrtrtnzlso`
- `SUPABASE_PUBLISHABLE_KEY=<set_manually>`
- `SUPABASE_SERVICE_ROLE_KEY` must be set manually when needed and never committed.

## Fallback Provider: Neon Postgres (Free Tier)

If Supabase free tier is unavailable/unusable, fallback to Neon.

- Keep SQL migrations in `supabase/migrations` as canonical.
- Apply with a SQL runner process (psql or CI migration step) if Supabase CLI is not used.
- Continue Prisma DB-derived flow (`db pull` + `generate`).

## Manual Setup (One-Time)

1. Create Supabase project in desired region.
2. Confirm project ref is `cbcgrzvqidtrtrtnzlso` (or set override in env).
3. Retrieve Postgres connection string(s) with SSL required.
4. Set runtime and migration env vars in deployment environments.
5. Install Supabase CLI locally/CI and authenticate:
- `supabase login` or set `SUPABASE_ACCESS_TOKEN`.

## Required Environment Variables

For API + worker runtime:
- `DATABASE_URL` (runtime pooled connection string)
- `DIRECT_URL` (direct connection string for Prisma introspection/sync)
- `PG_BOSS_SCHEMA`

For Supabase migration scripts:
- `SUPABASE_PROJECT_REF` (defaults to `cbcgrzvqidtrtrtnzlso` if unset)
- `SUPABASE_ACCESS_TOKEN` (or prior `supabase login` session)
- `SUPABASE_DB_PASSWORD` (required only when CLI command needs DB password in non-interactive mode)

For web (Vercel):
- `NEXT_PUBLIC_API_BASE_URL`
- `ADMIN_API_KEY` (server-only; used by web `/api/admin/*` proxy)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never commit:
- `SUPABASE_SERVICE_ROLE_KEY`
- DB passwords
- any secret tokens

## Production Commands

Link project (defaults to configured ref):

```bash
pnpm db:link
```

Apply migrations to linked production project:

```bash
pnpm db:migrate:prod
```

Verify migration state and DB readiness:

```bash
pnpm db:verify:prod
```

Optional env-file mode:

```bash
ENV_FILE=.env.production.local pnpm db:link
ENV_FILE=.env.production.local pnpm db:migrate:prod
ENV_FILE=.env.production.local pnpm db:verify:prod
```

## Prisma DB-Derived Sync

After SQL migrations are applied, keep Prisma schema/client synced from DB:

```bash
pnpm db:prisma:sync
```

This runs:
- `prisma db pull`
- `prisma generate`

## Drift Prevention and Recovery

Rules:
- Never edit production schema manually without capturing a migration.
- Never treat `packages/db/prisma/schema.prisma` as source of truth.
- Never run `prisma migrate deploy` for production rollout.

If drift is suspected:

```bash
pnpm db:pull:drift -- --confirm
```

Notes:
- `db pull` can produce noisy diffs.
- Review generated SQL carefully before commit.
- Re-run `pnpm db:verify:prod` after capturing drift.

## Day-2 Operations

## Credential rotation

1. Rotate DB credentials in Supabase dashboard.
2. Update `DATABASE_URL`/`DIRECT_URL` in runtime secret stores.
3. Update `SUPABASE_DB_PASSWORD` in CI/ops secret store if used.
4. Re-run `pnpm db:verify:prod`.

## Backup/retention expectations

- Free-tier retention and restore capabilities are limited.
- Assume reduced RPO/RTO compared to paid plans.

## Inactivity behavior

- Free-tier environments may pause or cold-start after inactivity.

## Region guidance

- Choose region nearest API/worker runtime, not developer laptops.

## Rollback / mitigation

- Migration workflow is forward-first.
- For bad migration, ship a corrective migration.
- Use provider backup restore only when forward fix is not possible.
