# LEAD-FLOOD

Monorepo for a lead discovery, enrichment, and scoring pipeline.

## Stack

- Next.js App Router (`apps/web`)
- Fastify (`apps/api`)
- Postgres + Prisma (`packages/db`)
- pg-boss workers (`apps/worker`)
- Zod contracts (`packages/contracts`)
- TypeScript + pnpm workspace + turborepo

## Prerequisites

- Node.js `22+` (repo pin: `.nvmrc`)
- pnpm `10.14.0` (from `packageManager`)
- Docker Desktop (or local Postgres on `localhost:5434`)

## Quick Start

1. Clone and enter the repo.

```bash
git clone <repo-url>
cd lead-flood
```

2. Use Node 22.

```bash
nvm use
```

3. Run preflight checks.

```bash
pnpm doctor
```

4. Install dependencies with pnpm.

```bash
corepack enable
pnpm install --frozen-lockfile
```

5. Create local env files.

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env.local
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

6. Start local infrastructure.

```bash
pnpm dev:infra
```

7. Apply migrations and seed.

```bash
pnpm db:migrate
pnpm db:seed
pnpm icp:seed
```

8. Start all apps.

```bash
pnpm dev
```

## Local URLs

- Web: `http://localhost:3000`
- Login: `http://localhost:3000/login` (Supabase Auth)
- Discovery console: `http://localhost:3000/discovery`
- API health: `http://localhost:5050/health`
- API ready: `http://localhost:5050/ready`
- Mailhog UI: `http://localhost:8025`
- Postgres: `localhost:5434`

## Test and Quality Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Useful Scripts

- `pnpm doctor` validates Node/pnpm/Docker prerequisites
- `pnpm bootstrap` runs preflight, installs deps, creates env files, starts infra, migrates, and seeds
- `pnpm db:link` links Supabase CLI to the configured project (default: `cbcgrzvqidtrtrtnzlso`)
- `pnpm db:migrate:prod` applies SQL migrations from `supabase/migrations` to linked prod DB
- `pnpm db:verify:prod` verifies remote DB migration metadata and readiness
- `pnpm db:prisma:sync` introspects DB into Prisma schema and regenerates client
- `pnpm db:pull:drift -- --confirm` captures remote schema drift into a SQL migration (review required)
- `pnpm discovery:seed` seeds SerpAPI discovery frontier tasks (`search_tasks`)
- `pnpm learning:backfill-features -- --icpProfileId <id> --batchSize 200`
- `pnpm learning:backfill-features -- --dry-run`

## Production DB

Primary provider strategy is documented in `docs/PROD_REMOTE_DB_STRATEGY.md`.
Canonical production migration files live in `supabase/migrations/*.sql`.

Canonical production schema flow:

```bash
pnpm db:link
pnpm db:migrate:prod
pnpm db:verify:prod
pnpm db:prisma:sync
```

> Do not do this:
> - Do not run `prisma migrate deploy` for production rollout.
> - Do not edit production schema manually without capturing a SQL migration.
> - Do not commit `SUPABASE_SERVICE_ROLE_KEY`, DB passwords, or access tokens.

## Documentation

- Entry point: `docs/README.md`
- Setup and onboarding: `docs/SETUP_ONBOARDING.md`
- Engineering guide: `docs/ENGINEERING_PLAN_BUILD_GUIDE.md`
- Deployment: `docs/DEPLOYMENT.md`
- Production remote DB strategy: `docs/PROD_REMOTE_DB_STRATEGY.md`
- Vercel production setup: `docs/VERCEL_PROD_SETUP.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Discovery providers: `docs/DISCOVERY_PROVIDER_STACK.md`
- SerpAPI discovery: `docs/SERPAPI_DISCOVERY.md`
- Discovery UI sprint report: `docs/SPRINT_REPORT_DISCOVERY_UI.md`

## Package Manager Policy

Use pnpm only. Do not run `npm install` in this repository.
