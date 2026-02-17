# Lead-Flood — Session Memory

## Project
Building on zsikkink/lead-flood. Zbooni (UAE fintech) as first client.
Repo: github.com/zsikkink/lead-flood

## Codebase State (pre-contribution)

### Working
Lead API, discovery jobs (Apollo/Google/LinkedIn/Company adapters), enrichment (PDL/Hunter/Clearbit/PublicWeb), feature computation (35+ features), deterministic scoring (weighted rules + hard filters), analytics rollup, outbox dispatcher, ICP profiles, CI/CD

### Stubbed (our contribution needed)
- `message.generate.job.ts` — needs GPT-4o message generation
- `message.send.job.ts` — needs Trengo WhatsApp integration
- `model.train/evaluate/labels` — ML pipeline (future)
- API modules not mounted: learning, messaging, feedback

## User (Peem)
Non-technical founder. Teach concepts while building. Autonomous work preferred.
Uses: Claude Code (build) + Cursor (review) + Pencil (frontend)

## Next Actions
1. Get lead-flood running locally
2. Codebase deep-dive (new session in lead-flood dir)
3. Gap analysis: map Zbooni needs to codebase gaps
4. Build: real APIs, messaging, scoring rules, frontend
