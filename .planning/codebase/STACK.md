# Technology Stack

**Analysis Date:** 2026-02-17

## Languages

**Primary:**
- TypeScript 5.7.3 - All source code (API, Web, Worker, packages)
- JavaScript - Configuration and build scripts

**Node Version:**
- Node.js >=22.0.0 (specified in `package.json` engines)
- Node 22 (from `.nvmrc`)

## Runtime

**Environment:**
- Node.js 22.x

**Package Manager:**
- pnpm 10.14.0 (enforced in `package.json` packageManager field)
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 15.1.6 - Web application frontend (`apps/web`)
- Fastify 5.2.1 - REST API backend (`apps/api`)
- Node.js (ESM) - Worker processes (`apps/worker`)

**Database & ORM:**
- Prisma 6.2.1 - Database access and migrations (`packages/db`)
- PostgreSQL 16 - Primary datastore

**Job Queue & Messaging:**
- pg-boss 10.3.0 - Job queue using PostgreSQL as broker (both `@lead-flood/api` and `@lead-flood/worker`)

**Testing:**
- Vitest 3.0.4 - Unit and integration test runner
- Zod 3.24.1 - Schema validation and type inference (across all packages)

**Build & Development:**
- Turbo 2.6.0 - Monorepo task orchestration
- TypeScript 5.7.3 - Compilation and type checking
- tsx 4.19.2 - TypeScript execution and node-only build runner
- esbuild - Native dependency (included via pnpm overrides)
- sharp - Native dependency for image processing (included via pnpm overrides)

## Key Dependencies

**Critical:**
- `@prisma/client` 6.2.1 - Database ORM client
- `@prisma/engines` - Native Prisma query engine (pnpm override)
- `pg-boss` 10.3.0 - PostgreSQL-backed job queue
- `pino` 9.6.0 - Structured JSON logging (`@lead-flood/observability`)

**Workspace (Internal):**
- `@lead-flood/contracts` - Shared type definitions and contracts
- `@lead-flood/db` - Database schema, migrations, and Prisma client
- `@lead-flood/observability` - Logging infrastructure
- `@lead-flood/providers` - External API adapters (discovery and enrichment)
- `@lead-flood/ui` - React component library
- `@lead-flood/config` - Shared configuration
- `@lead-flood/testkit` - Testing utilities
- `workspace:*` protocol used throughout (forces internal monorepo dependencies)

**Frontend:**
- `react` 19.0.0 - UI framework
- `react-dom` 19.0.0 - DOM rendering

**API/Middleware:**
- `@fastify/cors` 10.0.1 - CORS handling for Fastify

## Configuration

**Environment:**
- Environment variables loaded from app-local `.env.local` files:
  - `apps/api/.env.local`
  - `apps/worker/.env.local`
  - `apps/web/.env.local`
  - `packages/db/.env`
- Root reference file: `.env.example` (contains consolidated reference)
- Validation using Zod schemas in `src/env.ts` per app

**Critical Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `DIRECT_URL` - Direct database URL for Prisma (non-pooled)
- `PG_BOSS_SCHEMA` - pg-boss queue schema name (default: `pgboss`)
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` - Authentication tokens (min 32 chars)
- `API_PORT` - API server port (default: 5050)
- `CORS_ORIGIN` - CORS allowed origin (default: http://localhost:3000)
- `LOG_LEVEL` - Pino log level (fatal|error|warn|info|debug|trace)
- `NODE_ENV` - Environment (development|test|production)
- `APP_ENV` - Application environment label

**Build:**
- `tsconfig.json` - TypeScript base configuration
- `tsconfig.base.json` - Shared TypeScript configuration
- `eslint.config.mjs` - ESLint configuration (ESM format)
- `.prettierrc.json` - Prettier formatter config (100 char line width, single quotes, trailing commas)
- `.turbo/cache` - Turbo build cache
- `pnpm-workspace.yaml` - Monorepo workspace definition
- `.dockerignore` - Docker build exclusions

## Platform Requirements

**Development:**
- Node.js 22+
- pnpm 10.14.0
- Docker & Docker Compose (for PostgreSQL development environment)
- PostgreSQL 16 (can run via Docker or locally)
- Mailhog (optional, for email testing via Docker)

**Production:**
- Node.js 22+ runtime
- PostgreSQL 16+ database
- Environment variables for all external API keys and secrets

## Deployment Architecture

**Docker:**
- Each app (API, Worker, Web) has its own Dockerfile
- PostgreSQL 16 container for local development
- Mailhog container for email testing (development only)

**Services:**
- API service: Runs on port 5050 by default
- Web service: Runs on port 3000 by default
- Worker service: Background job processor (no HTTP port)
- Database: PostgreSQL on port 5434 (local dev) / standard 5432 (production)

---

*Stack analysis: 2026-02-17*
