# External Integrations

**Analysis Date:** 2026-02-17

## APIs & External Services

**Discovery Providers (Lead Finding):**
- **Google Custom Search** - Search-based lead discovery
  - SDK/Client: Native `fetch` HTTP client (no SDK)
  - Implementation: `packages/providers/src/discovery/googleSearch.adapter.ts`
  - Auth: `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` env vars
  - Base URL: `https://www.googleapis.com/customsearch/v1`
  - Rate limiting: 250ms between requests (configurable)
  - Status: Configurable via `GOOGLE_SEARCH_ENABLED` (default: true)

- **Apollo.io** - B2B database for lead and company discovery
  - SDK/Client: Native `fetch` HTTP client with x-api-key header
  - Implementation: `packages/providers/src/discovery/apollo.adapter.ts`
  - Auth: `APOLLO_API_KEY` env var
  - Base URL: `https://api.apollo.io` (endpoint: `/api/v1/mixed_people/search`)
  - Rate limiting: 250ms between requests (configurable)
  - Status: Configurable via `APOLLO_ENABLED` (default: false)

- **LinkedIn Scrape** - LinkedIn profile scraping (external service)
  - SDK/Client: Native `fetch` HTTP client
  - Implementation: `packages/providers/src/discovery/linkedInScrape.adapter.ts`
  - Auth: `LINKEDIN_SCRAPE_API_KEY` env var
  - Endpoint: `LINKEDIN_SCRAPE_ENDPOINT` env var (custom URL)
  - Status: Configurable via `LINKEDIN_SCRAPE_ENABLED` (default: false)

- **Clearbit Company Autocomplete** - Free company search and suggestions
  - SDK/Client: Native `fetch` HTTP client
  - Implementation: `packages/providers/src/discovery/companySearch.adapter.ts`
  - Base URL: `https://autocomplete.clearbit.com/v1/companies/suggest`
  - Auth: None (free tier)
  - Status: Configurable via `COMPANY_SEARCH_ENABLED` (default: true)

**Enrichment Providers (Lead Data Enhancement):**
- **Hunter.io** - Email finder and domain search
  - SDK/Client: Native `fetch` HTTP client with api_key query param
  - Implementation: `packages/providers/src/enrichment/hunter.adapter.ts`
  - Auth: `HUNTER_API_KEY` env var
  - Base URL: `https://api.hunter.io/v2`
  - Endpoints: `/email-verifier`, `/domain-search`
  - Rate limiting: 250ms between requests (configurable)
  - Status: Configurable via `HUNTER_ENABLED` (default: true)
  - Default enrichment provider

- **Clearbit** - B2B company and person data intelligence
  - SDK/Client: Native `fetch` HTTP client with Basic auth
  - Implementation: `packages/providers/src/enrichment/clearbit.adapter.ts`
  - Auth: `CLEARBIT_API_KEY` env var
  - Endpoints:
    - Person: `https://person.clearbit.com/v2/people/find`
    - Company: `https://company.clearbit.com/v2/companies/find`
  - Status: Configurable via `CLEARBIT_ENABLED` (default: false)

- **People Data Labs (PDL)** - Professional data API
  - SDK/Client: Native `fetch` HTTP client
  - Implementation: `packages/providers/src/enrichment/pdl.adapter.ts`
  - Auth: `PDL_API_KEY` env var
  - Base URL: `https://api.peopledatalabs.com`
  - Rate limiting: 250ms between requests (configurable)
  - Status: Configurable via `PDL_ENABLED` (default: false)

- **Clearbit Autocomplete (Free Public Lookup)** - Free company metadata
  - SDK/Client: Native `fetch` HTTP client
  - Implementation: `packages/providers/src/enrichment/publicWebLookup.adapter.ts`
  - Base URL: `https://autocomplete.clearbit.com/v1/companies/suggest`
  - Auth: None (free tier)
  - Status: Configurable via `OTHER_FREE_ENRICHMENT_ENABLED` (default: true)

## Data Storage

**Databases:**
- **PostgreSQL 16**
  - Connection: `DATABASE_URL` env var (pooled connection)
  - Direct connection: `DIRECT_URL` env var (for migrations, no pooling)
  - Client: Prisma 6.2.1 ORM with `@prisma/client`
  - Schema location: `packages/db/prisma/schema.prisma`

**File Storage:**
- Not detected - No external file storage service integrated
- Local filesystem only (raw payloads stored in database as JSON)

**Caching:**
- PostgreSQL row-level caching via Prisma (no external cache service)
- pg-boss queue tables stored in PostgreSQL

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `apps/api/src/auth/service.ts`
  - Access token: HS256 with `JWT_ACCESS_SECRET` (min 32 chars)
  - Refresh token: HS256 with `JWT_REFRESH_SECRET` (min 32 chars)
  - User storage: PostgreSQL via Prisma `User` model
  - Session storage: PostgreSQL via Prisma `Session` model

**No Third-Party OAuth/SSO:**
- No Auth0, Firebase, or other identity provider integrated

## Monitoring & Observability

**Error Tracking:**
- Not detected - No Sentry, Rollbar, or other error tracking service

**Logs:**
- Pino 9.6.0 structured logging
  - Implementation: `packages/observability/src/logger.ts`
  - Format: JSON with base context (service, env)
  - Destinations: Console/stdout (configurable level via `LOG_LEVEL`)
  - No external log aggregation detected

**Tracing:**
- Not detected

## CI/CD & Deployment

**Hosting:**
- Not detected - Infrastructure agnostic. Designed for:
  - Docker containerization (API, Worker, Web apps)
  - Any container orchestration platform
  - Standard Node.js hosting

**CI Pipeline:**
- GitHub (`.github/` directory present)
- Configuration: Not yet inspected

**Container Registry:**
- Not detected

## Environment Configuration

**Required env vars by service:**

*API (`apps/api/src/env.ts`):*
- `DATABASE_URL`, `DIRECT_URL`, `PG_BOSS_SCHEMA`
- `API_PORT`, `CORS_ORIGIN`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (min 32 chars each)
- `LOG_LEVEL`, `NODE_ENV`, `APP_ENV`
- `APOLLO_ENABLED`, `APOLLO_API_KEY` (optional)
- `GOOGLE_SEARCH_ENABLED`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID` (optional)
- `LINKEDIN_SCRAPE_ENABLED`, `LINKEDIN_SCRAPE_ENDPOINT`, `LINKEDIN_SCRAPE_API_KEY` (optional)
- `COMPANY_SEARCH_ENABLED` (optional)
- `HUNTER_ENABLED`, `HUNTER_API_KEY` (optional)
- `CLEARBIT_ENABLED`, `CLEARBIT_API_KEY` (optional)
- `PDL_ENABLED`, `PDL_API_KEY` (optional)
- `OTHER_FREE_ENRICHMENT_ENABLED` (optional)
- `DISCOVERY_ENABLED`, `ENRICHMENT_ENABLED` (optional)

*Worker (`apps/worker/src/env.ts`):*
- `DATABASE_URL`, `PG_BOSS_SCHEMA`
- `LOG_LEVEL`, `NODE_ENV`, `APP_ENV`
- All provider API keys and URLs (Apollo, Google Search, Hunter, Clearbit, PDL, LinkedIn, etc.)
- `DISCOVERY_DEFAULT_PROVIDER`, `ENRICHMENT_DEFAULT_PROVIDER`
- Enable/disable flags for each provider

*Web (`apps/web`):*
- `NEXT_PUBLIC_API_BASE_URL` - Backend API URL (e.g., http://localhost:5050)

**Secrets location:**
- Environment files: `.env.local` (local), environment secrets manager (production)
- Reference template: `.env.example`
- Not committed to version control (in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- Not detected - API does not expose webhook endpoints for third-party callbacks

**Outgoing:**
- Not detected - Application does not make outbound webhooks

## Job Queue & Event System

**Queue System:**
- pg-boss 10.3.0 (PostgreSQL-backed job queue)
- Schema: Configurable via `PG_BOSS_SCHEMA` env var (default: `pgboss`)
- Implementation: Used in both `@lead-flood/api` and `@lead-flood/worker`

**Queues:**
- `lead.enrich.stub` - Lead enrichment jobs
- `discovery.run` - Discovery pipeline runs
- Additional queues created dynamically at worker startup

**Outbox Pattern:**
- OutboxEvent model in `packages/db/prisma/schema.prisma`
- Async dispatcher: `apps/worker/src/outbox-dispatcher.ts`
- Guarantees: Exactly-once delivery semantics via singletonKey mechanism
- Dispatch interval: 5-second cycles with lock mechanism

**Error Handling:**
- RetryableError classification (429, 5xx status codes)
- PermanentError classification (4xx except 429)
- Configurable retry policies per job type (retryLimit, retryDelay, retryBackoff)
- Dead letter handling via OutboxStatus enum (dead_letter)

## Rate Limiting

**API Rate Limits (Discovery/Enrichment):**
All discovery and enrichment adapters implement client-side rate limiting:
- Default: 250ms minimum interval between requests (configurable)
- Configuration: `GOOGLE_SEARCH_RATE_LIMIT_MS`, `APOLLO_RATE_LIMIT_MS`, `HUNTER_RATE_LIMIT_MS`, etc.
- Mechanism: In-memory tracking of `nextAllowedRequestAt` timestamp
- HTTP 429 handling: Respects `retry-after` headers from APIs

---

*Integration audit: 2026-02-17*
