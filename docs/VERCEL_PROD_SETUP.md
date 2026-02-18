# Vercel Production Setup (Web App)

The web app runs on Vercel and calls the API. Do not run Postgres on Vercel.

## 1) Vercel Project Settings

- Framework preset: `Next.js`
- Root Directory: `apps/web`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm --filter @lead-flood/web build`
- Output Directory: leave default

## 2) Vercel Environment Variables

Set for both Preview and Production (with environment-specific values):
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_ADMIN_API_KEY` (if admin endpoints are protected)
- optional: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not put database credentials in the Vercel web project.

## 3) API/Worker Environment Variables (non-Vercel runtime)

Set on API + worker deployment:
- `DATABASE_URL`
- `DIRECT_URL`
- `PG_BOSS_SCHEMA`

Set for migration/ops workflows:
- `SUPABASE_PROJECT_REF=cbcgrzvqidtrtrtnzlso`
- `SUPABASE_ACCESS_TOKEN` (or use `supabase login` where scripts run)
- `SUPABASE_DB_PASSWORD` (when CLI cannot prompt)
- `SUPABASE_SERVICE_ROLE_KEY` only if explicitly needed by your ops flow (never commit)

## 4) Production Migration Flow

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

## 5) DB Readiness Verification

Check deployed API:

```bash
curl -sS https://<api-domain>/health
curl -sS https://<api-domain>/ready
```

Expected:
- `/health` returns status ok
- `/ready` returns ready + db ok

## 6) Preview/Production Safety

- Use separate DB credentials for preview and production.
- Never point preview deployments to production DB.
- Run migration commands only against the intended target environment.

## 7) Forbidden Actions

- Do not run `prisma migrate deploy` for production rollout.
- Do not apply manual schema edits in production without SQL migration capture.
- Do not commit service-role keys or DB passwords.

