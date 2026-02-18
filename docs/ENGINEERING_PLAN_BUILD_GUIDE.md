# LEAD-FLOOD Engineering Plan and Build Guide

Status: implementation-verified guide (current-state)

Last verified: 2026-02-16

## 1) Project Overview

LEAD-FLOOD is a monorepo for lead capture, discovery, enrichment, feature extraction, and deterministic scoring.

Current stack:

- Frontend: Next.js App Router (`apps/web`)
- API: Fastify (`apps/api`)
- Worker: pg-boss consumers (`apps/worker`)
- Database: Postgres via Prisma (`packages/db`)
- Contracts: Zod + shared types (`packages/contracts`)
- Providers: shared provider adapters (`packages/providers`)

## 2) Repository Layout

Top-level directories:

- `apps/`
  - `apps/web`
  - `apps/api`
  - `apps/worker`
- `packages/`
  - `packages/contracts`
  - `packages/db`
  - `packages/observability`
  - `packages/providers`
  - `packages/ui`
  - `packages/testkit`
  - `packages/config`
- `scripts/`
  - `scripts/icp`
  - `scripts/learning`
- `docs/`
- `infra/`

## 3) Data Model (Prisma)

Source of truth: `packages/db/prisma/schema.prisma`.

Core entities:

- Identity/session: `User`, `Session`
- Lead pipeline: `Lead`, `JobExecution`, `OutboxEvent`
- ICP and rules: `IcpProfile`, `QualificationRule`
- Discovery/enrichment: `LeadDiscoveryRecord`, `LeadEnrichmentRecord`
- Learning/scoring: `LeadFeatureSnapshot`, `LeadScorePrediction`, `TrainingRun`, `ModelVersion`, `ModelEvaluation`
- Analytics: `AnalyticsDailyRollup`

Key enums include:

- `DiscoveryProvider` (legacy adapter pipeline metadata): `BRAVE_SEARCH`, `GOOGLE_PLACES`, `LINKEDIN_SCRAPE`, `COMPANY_SEARCH_FREE`, `APOLLO`
- `EnrichmentProvider`: `HUNTER`, `CLEARBIT`, `OTHER_FREE`, `PEOPLE_DATA_LABS`
- `QualificationRuleType`: `WEIGHTED`, `HARD_FILTER`
- `ScoreBand`: `LOW`, `MEDIUM`, `HIGH`

## 4) Runtime Architecture

### API (`apps/api`)

`apps/api/src/server.ts` currently registers:

- Core: `/health`, `/ready`, `/v1/auth/login`, `/v1/leads`, `/v1/leads/:id`, `/v1/jobs/:id`
- Modules: ICP, discovery, enrichment, scoring

Note: learning/messaging/feedback/analytics module scaffolds exist under `apps/api/src/modules/` but are not wired in `server.ts` yet.

### Worker (`apps/worker`)

`apps/worker/src/index.ts`:

- Starts pg-boss
- Ensures queues (`apps/worker/src/queues.ts`)
- Registers schedules (`apps/worker/src/schedules.ts`)
- Registers job handlers in `apps/worker/src/jobs/*`

Registered queue jobs:

- `lead.enrich.stub`
- `system.heartbeat`
- `discovery.run`
- `enrichment.run`
- `features.compute`
- `labels.generate`
- `scoring.compute`
- `model.train`
- `model.evaluate`
- `message.generate`
- `message.send`
- `analytics.rollup`

## 5) Implemented Pipeline Flows

### Lead create flow

1. Web/API sends `POST /v1/leads`.
2. API validates via contracts package.
3. API persists `Lead` + `JobExecution` + `OutboxEvent` in one transaction.
4. API publishes `lead.enrich.stub` to pg-boss with outbox fallback.

### Discovery to scoring flow

1. API `POST /v1/discovery/runs` creates a run and enqueues `discovery.run`.
2. Worker `discovery.run` calls configured provider adapters and writes `LeadDiscoveryRecord` rows.
3. Worker enqueues `enrichment.run` per discovered lead.
4. Worker `enrichment.run` writes `LeadEnrichmentRecord` and enqueues `features.compute`.
5. Worker `features.compute` writes `LeadFeatureSnapshot` (`sourceVersion=features_v1`) and enqueues `scoring.compute`.
6. Worker `scoring.compute` applies deterministic scoring and writes `LeadScorePrediction`.

### Learning and operations support

- Feature backfill script: `scripts/learning/backfill-features.ts`
- ICP seed script: `scripts/icp/seed-zbooni-icps.ts`
- Scheduled jobs include labels generation, model training, scoring, analytics rollup.

## 6) Local Environment

Default local ports:

- Web: `3000`
- API: `5050`
- Postgres: `5434`
- Mailhog UI: `8025`

Infrastructure compose file:

- `infra/docker/docker-compose.local.yml`

Required local env files:

- `apps/api/.env.local`
- `apps/worker/.env.local`
- `apps/web/.env.local`
- `packages/db/.env`

Templates:

- `apps/api/.env.example`
- `apps/worker/.env.example`
- `apps/web/.env.example`
- `packages/db/.env.example`

## 7) Developer Workflow

1. Run environment preflight:

```bash
pnpm doctor
```

2. Install dependencies:

```bash
pnpm install --frozen-lockfile
```

3. Start infra:

```bash
pnpm dev:infra
```

4. Migrate and seed:

```bash
pnpm db:migrate
pnpm db:seed
pnpm icp:seed
```

5. Start apps:

```bash
pnpm dev
```

6. Validate before merge:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## 8) Contracts and Extension Points

- Canonical schemas: `packages/contracts/src/*.contract.ts`
- Exports barrel: `packages/contracts/src/index.ts`
- New API behavior should add/extend contract schemas before route logic.

Recommended change order for new features:

1. Contract changes
2. Prisma schema + migration
3. API route/service/repository changes
4. Worker job changes
5. Tests (unit + integration + e2e)
6. Docs update

## 9) CI and Deployment

- CI: `.github/workflows/ci.yml`
  - Node 22 + Postgres service
  - Runs migrate/seed/lint/typecheck/test/test:e2e/build
- Deploy: `.github/workflows/deploy.yml`
  - Builds GHCR images for `api`, `web`, `worker`
  - Staging deploy auto after successful CI on `main` pushes
  - Production deploy is manual workflow dispatch

## 10) Known Gaps and Constraints

- Learning, messaging, feedback, and analytics API modules are scaffolded but not yet mounted in `server.ts`.
- Several repository methods in those modules still intentionally throw `NotImplemented` errors.
- Queue and OLTP traffic currently share one Postgres instance.
- Provider integrations are environment-flag driven; API keys are optional in local development.
- Next.js build emits a non-blocking ESLint plugin detection warning; see `docs/TROUBLESHOOTING.md`.

## 11) Onboarding Quick Answers

1. Do I need Redis?
- No. Queueing is pg-boss on Postgres.

2. Do I run npm install?
- No. Use pnpm only.

3. Which Node version?
- Node 22+ (`.nvmrc` is pinned to `22`).

4. Where are request/response schemas?
- `packages/contracts/src`.

5. What scripts are essential first day?
- `pnpm install --frozen-lockfile`
- `pnpm dev:infra`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm dev`
