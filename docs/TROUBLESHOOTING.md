# Troubleshooting and Known Limitations

This document lists common setup/runtime failures, expected warnings, and current repository limitations.

## 1) Prerequisite Failures

### `pnpm install` warns about unsupported engine

Cause:

- Node version is below `22`.

Fix:

```bash
nvm install
nvm use
node -v
```

Then re-run:

```bash
pnpm install --frozen-lockfile
```

### `pnpm doctor` fails on Docker checks

Cause:

- Docker Desktop is not installed/running, or Compose plugin is unavailable.

Fix:

1. Start Docker Desktop.
2. Verify:

```bash
docker info
docker compose version
```

3. Re-run:

```bash
pnpm doctor
```

## 2) Database and Queue Failures

### `pnpm db:migrate` / `pnpm db:seed` cannot connect

Cause:

- Postgres is not running on `localhost:5434`.
- `DATABASE_URL` / `DIRECT_URL` mismatch.

Fix:

```bash
pnpm dev:infra
cat packages/db/.env
```

Expected local DB URLs:

- `postgresql://postgres:postgres@localhost:5434/lead_flood`

### Worker/API queue issues (jobs not processing)

Cause:

- `PG_BOSS_SCHEMA` mismatch between API and worker env.

Fix:

1. Check `apps/api/.env.local`.
2. Check `apps/worker/.env.local`.
3. Ensure both use the same `PG_BOSS_SCHEMA` (default `pgboss`).

## 3) Environment Validation Errors

### API fails to start with JWT env errors

Cause:

- `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` missing or too short.

Fix:

- Set both values in `apps/api/.env.local` with at least 32 characters.

### Provider-related runtime errors

Cause:

- Provider enabled but corresponding API key missing.

Fix:

- Either disable the provider toggle (`*_ENABLED=false`) or supply its key.
- For local default flow, keep optional providers disabled unless actively testing them.

## 4) Testing and Build Failures

### `pnpm test` fails in integration/e2e suites

Cause:

- Postgres dependency is unavailable.

Fix:

```bash
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm test
```

### `pnpm test:e2e` hangs or times out

Cause:

- API startup or DB readiness issue during test bootstrap.

Fix:

1. Run `pnpm db:migrate`.
2. Verify DB connectivity.
3. Re-run only API e2e for faster iteration:

```bash
pnpm --filter @lead-flood/api test:e2e
```

## 5) Expected Warnings

### Next.js warning during `pnpm build`

Warning:

- `The Next.js plugin was not detected in your ESLint configuration`

Status:

- Non-blocking build warning; does not fail CI/build.

Current handling:

- Documented as known limitation.
- Lint/typecheck/test/build remain green.

### Prisma update banner during generate/migrate/seed

Warning:

- Prisma CLI may print an update-available banner (for example, `Update available 6.x -> 7.x`).

Status:

- Informational only; does not indicate a failed migration/seed/build.

Current handling:

- Keep current pinned versions in `packages/db/package.json` unless a planned upgrade is scheduled.

### pnpm warning about ignored build scripts

Warning:

- `Ignored build scripts: @prisma/client, @prisma/engines, esbuild, prisma, sharp`

Status:

- Non-blocking in current workflows; install/bootstrap/test/build still pass.

When to act:

- If dependency install behavior changes in your environment and build artifacts are missing, run:

```bash
pnpm approve-builds
```

- Then rerun:

```bash
pnpm install --frozen-lockfile
pnpm bootstrap
```

## 6) Resolved Deprecations

### Prisma `package.json#prisma` deprecation

Status:

- Deprecated `package.json#prisma` configuration has been removed from `packages/db/package.json`.

Impact:

- No functional change to existing `pnpm db:*` workflows.

## 7) Known Limitations (Current State)

1. API module scaffolds for learning/messaging/feedback/analytics exist but are not mounted in `apps/api/src/server.ts`.
2. Several repository methods in those modules intentionally throw `NotImplemented` errors.
3. Queue load and OLTP load share the same Postgres instance.
4. Provider integrations are feature-flag driven and require manual API key setup per environment.

## 8) Fast Recovery Path

If local state is uncertain, run this sequence:

```bash
pnpm doctor
pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm icp:seed
pnpm test
pnpm build
```
