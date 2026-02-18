# Discovery Provider Stack

## Scope

This repository supports a modular discovery and enrichment stack with:

- `BRAVE_SEARCH` for web discovery
- `GOOGLE_PLACES` for SMB/local discovery
- `HUNTER` for enrichment

## Required Environment Variables

Worker runtime file: `apps/worker/.env.local`

```bash
DISCOVERY_ENABLED=true
DISCOVERY_DEFAULT_PROVIDER=GOOGLE_SEARCH
DISCOVERY_PROVIDER_ORDER=BRAVE_SEARCH,GOOGLE_PLACES,GOOGLE_SEARCH,COMPANY_SEARCH_FREE,APOLLO,LINKEDIN_SCRAPE

BRAVE_SEARCH_ENABLED=false
BRAVE_SEARCH_API_KEY=
BRAVE_SEARCH_BASE_URL=https://api.search.brave.com/res/v1/web/search
BRAVE_SEARCH_RATE_LIMIT_MS=250

GOOGLE_PLACES_ENABLED=false
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACES_BASE_URL=https://places.googleapis.com/v1/places:searchText
GOOGLE_PLACES_RATE_LIMIT_MS=250

HUNTER_ENABLED=true
HUNTER_API_KEY=
HUNTER_BASE_URL=https://api.hunter.io/v2
HUNTER_RATE_LIMIT_MS=250
```

## Rollout Plan

### Phase 1

- Enable `BRAVE_SEARCH` and `GOOGLE_PLACES`.
- Keep `DISCOVERY_DEFAULT_PROVIDER` on current baseline.
- Set `DISCOVERY_PROVIDER_ORDER` to activate fanout fallback.

### Phase 2

- Enable `HUNTER` in enrichment.
- Validate normalized enrichment payloads and status/error behavior.

### Phase 3

- Add paid discovery providers (Apollo or other approved providers).
- Keep provider feature flags off by default.

### Phase 4

- Add learning-based provider ranking and confidence tuning using persisted provenance metadata.

## Cost and Rate Notes

- Brave Search API: monitor quota and request ceilings by account plan.
- Google Places API: billed per request; cap usage with `GOOGLE_PLACES_RATE_LIMIT_MS` and run limits.
- Hunter API: billed by lookup credits; default retry behavior is already configured in worker jobs.

## Operational Risks

- Provider key revocation or quota exhaustion will reduce lead throughput.
- Fanout mode can increase API spend and duplicate candidates.
- Placeholder identity fields (`info@domain`) are not production-quality contacts; enrichment and future extraction logic should replace these defaults.

## Debug Checklist

1. Check worker log lines for `providersToRun`.
2. Query discovery runs: `GET /v1/discovery/runs/:runId`.
3. Query records: `GET /v1/discovery/records?icpProfileId=<id>&page=1&pageSize=20`.
4. Verify `LeadDiscoveryRecord.provider`, `providerSource`, `providerConfidence`, and `provenanceJson` fields.
