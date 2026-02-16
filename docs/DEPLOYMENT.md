# Deployment

Deployment is controlled by GitHub Actions.

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

## Rollback Approach

Rollback is image-tag based.

1. Repoint deployment target to previous known-good GHCR image tag.
2. Re-trigger deployment webhook.
3. Run smoke checks.
