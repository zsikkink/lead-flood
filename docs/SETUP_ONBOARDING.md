# Setup and Onboarding

This guide is the canonical setup for a new contributor starting from zero context.

## 1) Clone

```bash
git clone <repo-url>
cd lead-flood
```

## 2) Install Node and pnpm

The repo requires Node `22+` and pnpm `10.14.0`.

```bash
nvm install
nvm use
corepack enable
```

Verify:

```bash
node -v
pnpm -v
```

## 3) Run Environment Preflight

```bash
pnpm doctor
```

The preflight checks:

- Node version (`22+`)
- `pnpm` availability
- Docker + Docker Compose + daemon availability

## 4) Install Workspace Dependencies

```bash
pnpm install --frozen-lockfile
```

Use pnpm only in this repository.

## 5) Configure Environment Files

Copy these templates once:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/worker/.env.example apps/worker/.env.local
cp apps/web/.env.example apps/web/.env.local
cp packages/db/.env.example packages/db/.env
```

For local defaults, these values should stay aligned:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5434/lead_flood`
- `DIRECT_URL=postgresql://postgres:postgres@localhost:5434/lead_flood`
- `PG_BOSS_SCHEMA=pgboss`

JWT secrets in `apps/api/.env.local` must be at least 32 characters.
Supabase JWT verification requires either:
- `SUPABASE_JWT_ISSUER`
- or `SUPABASE_PROJECT_REF` (issuer is derived)

Web login requires:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Provider keys are optional in local development. Keep providers disabled unless keys are set.

## 6) Start Local Infrastructure

```bash
pnpm dev:infra
```

This starts:

- Postgres on `5434`
- Mailhog UI on `8025`

## 7) Apply Migrations and Seed Data

```bash
pnpm db:migrate
pnpm db:seed
pnpm icp:seed
```

Login is handled by Supabase Auth users. Create users in Supabase Auth and sign in from `/login`.

## 8) Run Applications

```bash
pnpm dev
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:5050`
- Health: `http://localhost:5050/health`
- Ready: `http://localhost:5050/ready`

## 9) Run Tests and Quality Checks

Postgres must be running for integration/e2e tests.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## 10) Common Scripts

- `pnpm bootstrap`
  - Runs preflight checks
  - Installs dependencies with lockfile
  - Creates local env files (if missing)
  - Starts infra
  - Applies migrations
  - Seeds demo data and ICP profiles

- `pnpm learning:backfill-features -- --icpProfileId <icp_id> --batchSize 200`
- `pnpm learning:backfill-features -- --dry-run`
- `pnpm doctor`
  - Runs prerequisite checks only

## 11) Troubleshooting

Use `docs/TROUBLESHOOTING.md` for common failure scenarios and known limitations.
