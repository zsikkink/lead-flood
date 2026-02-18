# Phase 5: Follow-Up Automation + Reply Classification

## Overview

Two tightly coupled features: (1) automated follow-up messages when leads don't reply within a randomized 2.5-4 day window, pitching a different Zbooni feature each time; (2) AI-powered reply classification that routes leads based on intent (interested, not interested, OOO, unsubscribe) and handles edge cases like voice notes.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Follow-up approval | Fully automatic | Auto-generate, auto-approve, auto-send. Removing human bottleneck is the point. |
| Follow-up timing | 72h base + random jitter (-12h to +24h) | Prevents pattern detection. Each lead gets a unique schedule (60-96h window). |
| Follow-up scanner | pg-boss cron, hourly, UAE business hours | `0 5-14 * * *` UTC (09:00-18:00 GST). Hourly is sufficient since timing is already randomized. |
| Max follow-ups | 3 per lead | After 3 with no reply, lead is left for labels.generate to mark cold. |
| Feature rotation source | ICP profile feature list from offerings doc | Each ICP segment (A-H) has specific "Features to pitch". Stored as structured JSON on IcpProfile. |
| Unsubscribe mechanism | No link in messages, reactive detection only | Messages stay natural/conversational. AI classifier detects opt-out intent from reply text. |
| Unsubscribe action | Stop automation, mark lead cold | No more automated messages. Lead remains visible in dashboard. |
| OOO handling | Extend follow-up by 7 days + jitter | Resume cadence after OOO. Still counts against max 3. |
| Interested reply | Mark replied + notify sales team | Enqueue `notify.sales` to both Slack and WhatsApp (internal team). |
| Voice notes / media-only | Skip classification, notify team | No text to classify. Treat as engagement signal, mark replied, manual review. |
| Reply classification language | Multilingual | OpenAI classifies reply in any language. UAE market is English/Arabic/Hindi. |
| Lead status transition | On first message.send success | `enriched` -> `messaged` when `followUpNumber === 0` and send succeeds. |
| Feature conversion tracking | Wire data now, smart selection deferred | Store `pitchedFeature` on every draft for attribution. Round-robin for now; ML-driven prioritization later. |

## Schema Changes

### New Enum

```prisma
enum ReplyClassification {
  INTERESTED
  NOT_INTERESTED
  OUT_OF_OFFICE
  UNSUBSCRIBE
}
```

### LeadStatus Enum — New Values

Add to existing enum: `messaged`, `replied`, `cold`

- `messaged` — first message sent, awaiting reply
- `replied` — received a classified reply (interested)
- `cold` — not interested, unsubscribed, or max follow-ups exhausted with no reply

### IcpProfile — New Field

```prisma
featureList Json?  // Structured array from "ICP and Offerings" doc, per-segment
```

Populated from the offerings doc. Example for segment A (Luxury & High-Ticket Services):
```json
[
  "Support for large one-off payments on a single link (up to AED 1M per link)",
  "Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)",
  "Multi-MID support for failed transactions, enabling retries via alternate MIDs",
  "Immediate live support via call or WhatsApp for urgent or failed transactions",
  "Catalog (CShop) to pre-list services and share them directly via chat",
  "CRM to track customer order history and add internal notes"
]
```

Full segment-to-feature mapping (from ICP and Offerings doc):

| Segment | Key Features |
|---------|-------------|
| A. Luxury & High-Ticket | Large one-off payments (1M/link), multi-payment methods, multi-MID retries, live support, Catalog/CShop, CRM |
| B. Gifting & Corporate | Catalog/CShop, multi-payment methods, live payment link editing, in-app discounts, promo codes, WhatsApp marketing campaigns |
| C. Events & Weddings | WhatsApp event marketing, ticketing, Catalog/CShop, QR-based ordering, POS machine, customer database, master organizer dashboard, promo codes |
| D. Home & Contracting | Large one-off payments, customizable milestone payment links, reconciliation/VAT, instant receipts, Catalog/CShop, CRM, in-app discounts |
| E. Boutique Hospitality | Large one-off payments, customizable partial payments (deposit/balance/add-ons), international cards, multi-payment methods, instant receipts, reconciliation, Catalog/CShop/QR, CRM |
| F. Wellness & Clinics | Customizable staged/package payments, multi-payment methods (incl. Tabby/Tamara), CRM for patient tracking, promo codes for campaigns/referrals |
| G. Coaching & Advisory | Customizable partial/staged payments, international cards, multi-payment methods (incl. Tabby/Tamara), instant receipts, CRM, promo codes for cohorts, WhatsApp marketing campaigns |
| H. Education & Training | Multi-payment methods (incl. Tabby/Tamara), inventory limits, instant receipts, reconciliation, CRM, promo codes, WhatsApp marketing campaigns |

### MessageDraft — New Fields

```prisma
followUpNumber      Int      @default(0)   // 0 = initial, 1-3 = follow-ups
pitchedFeature      String?                // which Zbooni feature this draft focuses on
parentMessageSendId String?                // links back to the send that triggered this follow-up
```

### MessageSend — New Fields

```prisma
followUpNumber      Int        @default(0)    // mirrors draft, for efficient scanner queries
nextFollowUpAfter   DateTime?                 // null = no follow-up expected (replied, cold, max reached)
```

### FeedbackEvent — New Fields

```prisma
replyText            String?                  // extracted reply body from webhook payload
replyClassification  ReplyClassification?      // AI classification result
```

### New Indexes

```prisma
// MessageSend — follow-up scanner query
@@index([status, followUpNumber, nextFollowUpAfter])

// FeedbackEvent — lookup by lead for reply existence check
@@index([leadId, eventType])
```

## New pg-boss Jobs

### `followup.check` — Hourly Cron Scanner

**Schedule:** `0 5-14 * * *` UTC (09:00-18:00 GST, hourly)

**Logic:**
1. Query: `MessageSend WHERE nextFollowUpAfter < NOW() AND nextFollowUpAfter IS NOT NULL AND status = 'SENT' AND followUpNumber < 3`
2. For each match, verify no `FeedbackEvent` with `eventType IN (REPLIED, UNSUBSCRIBED)` exists for that lead
3. Verify `Lead.status` is still `messaged` (not `replied`, `cold`, or `opted_out`)
4. Load all `MessageDraft` records for this lead to collect `pitchedFeature` values as `previouslyPitchedFeatures`
5. Enqueue `message.generate` with: `{ leadId, followUpNumber: currentSend.followUpNumber + 1, parentMessageSendId: currentSend.id, previouslyPitchedFeatures, autoApprove: true }`
6. Set `currentSend.nextFollowUpAfter = null` (consumed, prevents double-enqueue)

**Retry:** 2x, 30s delay. Dead letter: `followup.check.dead_letter`

### `reply.classify` — AI Reply Classification

**Triggered by:** Trengo webhook handler, after creating FeedbackEvent

**Payload:** `{ feedbackEventId, replyText, leadId, messageSendId }`

**Logic:**
1. If `replyText` is empty/null (voice note, media-only):
   - Set `FeedbackEvent.replyClassification = null` (unclassified)
   - Set `Lead.status = 'replied'`
   - Cancel all pending follow-ups for lead (`nextFollowUpAfter = null`)
   - Enqueue `notify.sales` with `{ leadId, feedbackEventId, classification: null, unclassified: true, reason: 'MEDIA_ONLY' }`
   - Return early
2. Call `OpenAiAdapter.classifyReply(replyText)` — multilingual prompt, returns `ReplyClassification`
3. Update `FeedbackEvent.replyClassification`
4. Side effects by classification:
   - `INTERESTED`: `Lead.status = 'replied'`, cancel follow-ups, enqueue `notify.sales`
   - `NOT_INTERESTED`: `Lead.status = 'cold'`, cancel follow-ups
   - `UNSUBSCRIBE`: `Lead.status = 'cold'`, cancel follow-ups
   - `OUT_OF_OFFICE`: Keep `Lead.status = 'messaged'`, set latest MessageSend's `nextFollowUpAfter = NOW() + 7d + jitter`

**Retry:** 3x, 60s delay. Dead letter: `reply.classify.dead_letter`

### `notify.sales` — Team Notification

**Payload:** `{ leadId, feedbackEventId, classification, unclassified?, reason? }`

**Logic:**
1. Load Lead (name, email, company) and FeedbackEvent
2. Build notification message:
   - Classified: `"{firstName} from {company} replied — classified as {classification}"`
   - Unclassified: `"{firstName} from {company} replied with a voice note — needs manual review"`
3. Send to Slack via webhook URL (`SLACK_WEBHOOK_URL` env var)
4. Send to Trengo internal team conversation (`TRENGO_INTERNAL_CONVERSATION_ID` env var)

**Retry:** 2x, 30s delay. Dead letter: `notify.sales.dead_letter`

## Modified Jobs

### `message.generate` — Follow-Up Mode

**New payload fields:** `followUpNumber`, `parentMessageSendId`, `previouslyPitchedFeatures: string[]`, `autoApprove: boolean`

**Changes when `followUpNumber > 0`:**
1. Load `IcpProfile.featureList` for the lead's ICP segment
2. Filter out `previouslyPitchedFeatures` from available features
3. Select next feature (round-robin from remaining list)
4. Set `MessageDraft.pitchedFeature = selectedFeature`
5. Pass enhanced grounding context to OpenAI: `"This is follow-up #{n}. Pitch the feature: {selectedFeature}. Previous messages pitched: {list}. Write a natural follow-up that references the previous conversation without repeating."`
6. Set `MessageDraft.approvalStatus = AUTO_APPROVED`
7. Set `MessageDraft.followUpNumber` and `MessageDraft.parentMessageSendId`
8. Immediately enqueue `message.send` (no human approval step)

**Changes for all messages (initial + follow-up):**
- Always set `MessageDraft.pitchedFeature` (for conversion tracking)

### `message.send` — Follow-Up Awareness

**Changes:**
1. After successful send (`status = SENT`):
   - Compute `nextFollowUpAfter = NOW() + randomJitter(60h, 96h)` — unless `followUpNumber >= 3` (max reached, set null)
   - Write `nextFollowUpAfter` to MessageSend
   - If `followUpNumber === 0`: set `Lead.status = 'messaged'`
2. Copy `followUpNumber` from MessageDraft to MessageSend

### Trengo Webhook — Enhanced

**Changes:**
1. Extract `payload.data.message.body` and store in `FeedbackEvent.replyText`
2. After creating FeedbackEvent: cancel all pending follow-ups for the lead (`UPDATE MessageSend SET nextFollowUpAfter = null WHERE leadId = ? AND nextFollowUpAfter IS NOT NULL`)
3. Enqueue `reply.classify` with `{ feedbackEventId, replyText: extractedText, leadId, messageSendId }`

## Complete Lifecycle

```
Initial message sent (message.send success)
  -> MessageSend.status = SENT, followUpNumber = 0
  -> Lead.status = messaged
  -> MessageSend.nextFollowUpAfter = NOW() + 60-96h (randomized)

Hourly cron (followup.check) scans
  -> Finds sends past their nextFollowUpAfter with no reply
  -> Enqueues message.generate (followUpNumber + 1, autoApprove: true)
  -> Nulls current send's nextFollowUpAfter

message.generate (follow-up mode)
  -> Picks next unpitched feature from ICP segment list
  -> OpenAI generates follow-up (different feature, natural tone)
  -> AUTO_APPROVED draft + variants
  -> Immediately enqueues message.send

message.send (follow-up)
  -> Sends via Resend/Trengo
  -> Sets nextFollowUpAfter = NOW() + 60-96h (unless followUpNumber === 3)
  -> New MessageSend gets its own randomized schedule

Lead replies (Trengo webhook)
  -> Extracts replyText
  -> Creates FeedbackEvent (REPLIED)
  -> Cancels ALL pending follow-ups (nextFollowUpAfter = null)
  -> Enqueues reply.classify

reply.classify
  -> Voice note / media-only: mark replied, notify team, skip classification
  -> Text reply: OpenAI classifies
    -> INTERESTED: Lead.status = replied, notify team
    -> NOT_INTERESTED / UNSUBSCRIBE: Lead.status = cold
    -> OUT_OF_OFFICE: extend nextFollowUpAfter by 7d + jitter

No reply, max follow-ups exhausted (followUpNumber === 3)
  -> nextFollowUpAfter is null, cron ignores
  -> labels.generate eventually marks as cold lead (existing logic)
```

## New Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `SLACK_WEBHOOK_URL` | Worker | Slack incoming webhook for sales notifications |
| `TRENGO_INTERNAL_CONVERSATION_ID` | Worker | Trengo conversation ID for internal team notifications |

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Double-enqueue prevention | `nextFollowUpAfter = null` after consumption by scanner |
| Reply arrives while follow-up generating | Webhook immediately nulls all `nextFollowUpAfter`; even if message.generate is in-flight, new send will have no further follow-ups since lead has FeedbackEvent |
| OOO loop | Each OOO extends by 7d but still counts against max 3, can't loop forever |
| Voice note / media-only reply | Skip classification, mark replied, notify team for manual review |
| All features exhausted before max follow-ups | If ICP has fewer features than follow-ups remaining, wrap around (feature list is typically 5-8 items, larger than max 3 follow-ups) |
| Lead already cold/replied when scanner runs | Scanner checks `Lead.status = 'messaged'` — skips others |
| Webhook for unknown conversation | Existing fallback: find lead by phone, most recent WhatsApp send. If no match, skip. |
