# Product Requirements Document: Zbooni Sales OS (on Lead-Flood)

## Project Overview
Enterprise-grade AI-powered sales operating system built on the lead-flood platform. Automates B2B lead generation for Zbooni (UAE fintech): discovering businesses via Google Maps, enriching contacts via Apollo, scoring against ICP criteria, generating personalized WhatsApp messages, and managing follow-up sequences. First deployment for Zbooni; architecture designed for multi-client reuse.

## Who This Is For
- **End user**: Zbooni sales team (non-technical, uses dashboard UI)
- **Admin user**: Zbooni sales manager (configures ICP rules, approves messages, views analytics)
- **System**: Automated pipeline runs on schedule with minimal human intervention

## What Problem This Solves
Zbooni's sales team manually searches for potential clients across Google Maps, LinkedIn, and company websites. They copy-paste contact info into spreadsheets, write individual WhatsApp messages, and track replies across multiple tools. This process:
- Takes 4-6 hours per day per rep for 10-15 qualified leads
- Has no consistency in messaging quality
- Loses context between handoffs
- Has no data on what messaging works

The system reduces this to: configure ICP criteria → pipeline runs automatically → approve messages → track results.

## Technical Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| API Server | Fastify | (check package.json) | HTTP API, route handling, request validation |
| Worker | pg-boss | (check package.json) | Background job queue and scheduling |
| Frontend | Next.js App Router | (check package.json) | Dashboard UI |
| Database | PostgreSQL + Prisma | (check package.json) | Data persistence and ORM |
| Validation | Zod | (check package.json) | Request/response schema validation |
| Build | Turborepo + pnpm | (check package.json) | Monorepo build orchestration |
| AI | OpenAI GPT-4o | API | Contact extraction, message generation, scoring assistance |
| Scraping | Apify | API | Google Maps scraping, website scraping |
| Enrichment | Apollo.io | API | Company/contact data, phone reveal |
| Messaging | Trengo | API | WhatsApp Business message sending |
| CI/CD | GitHub Actions | N/A | Automated testing and deployment |

**Note**: Exact versions to be confirmed from `package.json` files after cloning repo.

## Data Model

Existing Prisma schema defines 16 models. Key ones for Zbooni use case:

| Model | Purpose | Key Fields |
|-------|---------|------------|
| Lead | Core lead record | email, company, firstName, lastName, status |
| IcpProfile | Ideal customer profile config | name, description, isActive |
| QualificationRule | Scoring rules per ICP | fieldKey, operator, valueJson, weight, ruleType |
| LeadDiscoveryRecord | Raw discovery data | provider, status, rawPayload |
| LeadEnrichmentRecord | Enrichment results | provider, status, normalizedPayload |
| LeadFeatureSnapshot | Computed features for scoring | featuresJson, icpProfileId |
| LeadScorePrediction | Score output | deterministicScore, scoreBand, reasonCodes |
| JobExecution | Pipeline tracking | status, startedAt, completedAt, errorMessage |
| OutboxEvent | Reliable event delivery | status, payload, attempts |
| AnalyticsDailyRollup | Daily metrics | discoveredCount, enrichedCount, scoredCount |

Models for future phases: TrainingRun, ModelVersion, ModelEvaluation (ML pipeline)

## Feature Blocks

### Block 1: Discovery (existing — needs real API integration)
- Google Maps search by industry + location via Apify
- Apollo organization search by domain
- Deduplication on company domain / Google place_id
- Pre-filter: disqualify before expensive enrichment
- **Status**: Provider adapter architecture exists. Needs Apify + Apollo wired in.

### Block 2: Enrichment (existing — needs real API integration)
- Apollo contact search for C-suite decision makers
- Contact ranking by title/seniority/availability
- Phone reveal for primary contact only
- Website scrape fallback when Apollo has no phone
- GPT-4o extraction from scraped HTML
- **Status**: Multi-provider adapter exists. Needs Apollo + Apify + GPT wired in.

### Block 3: Feature Extraction (existing — working)
- 35+ features computed from enrichment data
- Normalized across providers
- Stored as LeadFeatureSnapshot
- **Status**: Implemented and working.

### Block 4: Scoring (existing — working, needs Zbooni rules)
- Deterministic rules engine (weighted + hard filters)
- Score bands: LOW / MEDIUM / HIGH
- Configurable per ICP profile
- **Status**: Engine works. Needs Zbooni ICP rules seeded into QualificationRule table.

### Block 5: Messaging (TODO — our primary contribution)
- GPT-4o message generation: 2 variants per lead for A/B testing
- Feature-based messaging: each message pitches specific Zbooni capability relevant to lead's segment
- Trengo WhatsApp integration: template messages for first contact
- Send queue: 50/day rate limit, paced delivery
- Manual approval flow (v1): all messages require human review
- **Status**: Empty TODO stubs. Full implementation needed.

### Block 6: Reply Detection & Deal Management (TODO — future phase)
- Trengo webhook for incoming replies
- Reply classification (interested / not interested / out of office / unsubscribe)
- Deal stage progression
- Alert sales team on interested replies
- **Status**: Not started. Contracts may exist.

### Block 7: Follow-Up Automation (TODO — future phase)
- No-reply after 72h triggers follow-up
- Feature-based follow-ups: each pitches a DIFFERENT Zbooni feature
- Max 3 follow-ups before marking cold
- Weekday delivery, UAE business hours
- **Status**: Not started.

### Block 8: Analytics Dashboard (partial)
- Daily rollup: discovery/enrichment/scoring counts
- Industry match rate, geo match rate
- Pipeline conversion funnel
- **Status**: Backend rollup job works. Frontend dashboard needs building.

### Block 9: Learning Loop (TODO — future phase)
- Training labels from messaging outcomes
- Logistic regression on feature snapshots
- Weekly model retraining
- Shadow → Active → Archived model lifecycle
- **Status**: Schema and job stubs exist. No implementation.

### Block 10: Manager Agent (TODO — future phase)
- Weekly analysis of A/B test results
- Pattern identification per ICP segment
- Automated rule adjustment recommendations
- Weekly performance report
- **Status**: Not started.

## Design System Rules
TBD — to be established after reviewing existing frontend code in `apps/web`.

## Architecture Patterns
TBD — to be documented during Phase 1 codebase deep-dive. Initial observations:
- API routes → service layer → Prisma queries (clean separation)
- Worker jobs queued via pg-boss, processed async
- Outbox pattern for reliable event delivery between API and worker
- Zod contracts shared between API and worker via workspace package

## Constraints and Non-Negotiables
1. **pnpm only** — never run `npm install` in this repo
2. **Node 22+** — pinned in `.nvmrc`
3. **All secrets in .env** — never hardcode API keys
4. **Tests must pass before merge** — CI enforces this
5. **Conventional commits** — `type: description` format
6. **WhatsApp compliance** — template messages for first contact, respect opt-out
7. **Rate limits** — 50 WhatsApp messages/day, Apollo credit limits, Apify cost awareness
8. **Data privacy** — no PII in logs, respect data retention policies

## Priority Order
1. Get codebase running locally and fully understood
2. Wire real API providers (Apollo, Apify) into existing adapters
3. Build messaging module (GPT-4o generation + Trengo sending)
4. Seed Zbooni ICP rules into scoring system
5. Build frontend dashboard
6. Reply detection + follow-up automation
7. Learning loop + manager agent
