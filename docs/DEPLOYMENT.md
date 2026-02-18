# Deployment

Deployment is controlled by GitHub Actions.

For remote Postgres provider setup and SQL-first migration strategy, see `docs/PROD_REMOTE_DB_STRATEGY.md`.

## CI Workflow

File: `.github/workflows/ci.yml`

Triggers:

- Pull requests
- Pushes to `main`

CI runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm db:migrate`
3. `pnpm db:seed`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm test`
7. `pnpm test:e2e`
8. `pnpm build`

Runtime in CI:

- Node 22
- Postgres service on port `5434`

## Deploy Workflow

File: `.github/workflows/deploy.yml`

### Staging

- Auto-triggered after successful CI on `main` pushes.
- Can also be triggered manually with `workflow_dispatch` + `environment=staging`.
- Builds and pushes images for:
  - `api`
  - `web`
  - `worker`
- Publishes to GHCR tags:
  - `staging-<sha>`
  - `staging-latest`
- Optional webhook trigger:
  - `STAGING_DEPLOY_WEBHOOK`
- Optional smoke check:
  - `STAGING_SMOKE_URL`

### Production

- Manual only (`workflow_dispatch` + `environment=production`).
- Builds and pushes images for:
  - `api`
  - `web`
  - `worker`
- Publishes to GHCR tags:
  - `production-<sha>`
  - `production-latest`
- Optional webhook trigger:
  - `PRODUCTION_DEPLOY_WEBHOOK`
- Optional smoke check:
  - `PRODUCTION_SMOKE_URL`

## Required Repository Secrets (if deployment hooks are used)

- `STAGING_DEPLOY_WEBHOOK`
- `STAGING_SMOKE_URL`
- `PRODUCTION_DEPLOY_WEBHOOK`
- `PRODUCTION_SMOKE_URL`

If webhook secrets are not set, the workflow still builds and publishes images.

## Local Pre-Deploy Checklist

Before merging to `main`:

```bash
pnpm doctor
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Production DB Migration Steps

Production migrations are SQL-first via Supabase CLI.

```bash
pnpm db:link
pnpm db:migrate:prod
pnpm db:verify:prod
pnpm db:prisma:sync
```

## Data Migration: Local -> Remote

Use `pnpm db:push:local-to-remote` to move existing local development data into the remote Supabase database.

Required env:

- `REMOTE_DATABASE_URL` (must include `sslmode=require`)

Optional env:

- `LOCAL_DATABASE_URL` (defaults to `postgresql://postgres:postgres@localhost:5434/lead_flood`)
- `TABLES_INCLUDE` (comma-separated table list)
- `TABLES_EXCLUDE` (comma-separated table list)
- `CONFIRM_REMOTE_OVERWRITE=1` (required to allow remote writes)

Dry run (safe default, no remote writes):

```bash
REMOTE_DATABASE_URL='postgresql://...sslmode=require' pnpm db:push:local-to-remote
```

Execute overwrite migration (destructive on target tables):

```bash
CONFIRM_REMOTE_OVERWRITE=1 \
REMOTE_DATABASE_URL='postgresql://...sslmode=require' \
pnpm db:push:local-to-remote
```

Example table-scoped run:

```bash
CONFIRM_REMOTE_OVERWRITE=1 \
REMOTE_DATABASE_URL='postgresql://...sslmode=require' \
TABLES_INCLUDE='search_tasks,businesses,sources,business_evidence,job_runs' \
pnpm db:push:local-to-remote
```

Notes:

- The script validates schema/table compatibility before any write.
- If `CONFIRM_REMOTE_OVERWRITE` is not set, it exits after plan/count reporting.
- If restore fails via Supabase pooler URL, retry with direct Postgres host URL.

## Forbidden Production Actions

- Do not use `prisma migrate deploy` as the production migration driver.
- Do not apply manual production schema edits without committing a SQL migration.
- Do not commit Supabase service-role keys or DB secrets.

## Rollback Approach

Rollback is image-tag based.

1. Repoint deployment target to previous known-good GHCR image tag.
2. Re-trigger deployment webhook.
3. Run smoke checks.
