# Phase 5: Follow-Up Automation + Reply Classification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automated follow-up messages (max 3, randomized timing, different Zbooni feature each time) and AI-powered reply classification (interested/not-interested/OOO/unsubscribe) with team notifications.

**Architecture:** Extends existing pg-boss worker pipeline. New jobs: `followup.check` (hourly cron scanner), `reply.classify` (AI classification), `notify.sales` (Slack + Trengo notifications). Modified jobs: `message.generate` (follow-up mode with feature rotation), `message.send` (nextFollowUpAfter scheduling + Lead.status transition). Enhanced Trengo webhook (reply text extraction, follow-up cancellation, enqueue classification).

**Tech Stack:** Prisma (schema migration), pg-boss (job scheduling), OpenAI API (classification), Slack Webhook API, Trengo REST API, TypeScript.

**Design doc:** `docs/plans/2026-02-17-followup-and-classification-design.md`

---

### Task 1: Database Migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_followup_and_classification/migration.sql` (auto-generated)

**Step 1: Add new enum and modify LeadStatus**

In `packages/db/prisma/schema.prisma`:

Add to `LeadStatus` enum (after `failed`):
```prisma
enum LeadStatus {
  new
  processing
  enriched
  failed
  messaged
  replied
  cold
}
```

Add new enum after `LabelSource`:
```prisma
enum ReplyClassification {
  INTERESTED
  NOT_INTERESTED
  OUT_OF_OFFICE
  UNSUBSCRIBE
}
```

**Step 2: Add new fields to IcpProfile**

After `excludedDomains` field:
```prisma
  featureList          Json?
```

**Step 3: Add new fields to MessageDraft**

After `rejectedReason` field:
```prisma
  followUpNumber       Int                   @default(0)
  pitchedFeature       String?
  parentMessageSendId  String?
```

**Step 4: Add new fields to MessageSend**

After `repliedAt` field:
```prisma
  followUpNumber         Int               @default(0)
  nextFollowUpAfter      DateTime?
```

Add composite index (after existing indexes):
```prisma
  @@index([status, followUpNumber, nextFollowUpAfter])
```

**Step 5: Add new fields to FeedbackEvent**

After `payloadJson` field:
```prisma
  replyText           String?
  replyClassification ReplyClassification?
```

Add index (after existing indexes):
```prisma
  @@index([leadId, eventType])
```

**Step 6: Generate and apply migration**

Run:
```bash
export PATH="/Users/os_architect/.nvm/versions/node/v22.22.0/bin:$PATH"
cd /Users/os_architect/Desktop/OS_Architect/Projects/lead-flood
pnpm db:migrate -- --name add_followup_and_classification
```

**Step 7: Generate Prisma client**

Run:
```bash
pnpm --filter @lead-flood/db exec prisma generate
```

**Step 8: Verify typecheck passes**

Run:
```bash
pnpm typecheck
```
Expected: No errors related to schema changes.

**Step 9: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): migration for follow-up automation and reply classification"
```

---

### Task 2: Contracts — New Types

**Files:**
- Modify: `packages/contracts/src/webhook.contract.ts`
- Create: `packages/contracts/src/followup.contract.ts`

**Step 1: Add follow-up contracts**

Create `packages/contracts/src/followup.contract.ts`:
```typescript
import { z } from 'zod';

// ---------- Reply Classification ----------

export const ReplyClassificationSchema = z.enum([
  'INTERESTED',
  'NOT_INTERESTED',
  'OUT_OF_OFFICE',
  'UNSUBSCRIBE',
]);
export type ReplyClassification = z.infer<typeof ReplyClassificationSchema>;

// ---------- followup.check job ----------

export const FollowupCheckJobPayloadSchema = z.object({
  runId: z.string(),
  correlationId: z.string().optional(),
});
export type FollowupCheckJobPayload = z.infer<typeof FollowupCheckJobPayloadSchema>;

// ---------- reply.classify job ----------

export const ReplyClassifyJobPayloadSchema = z.object({
  runId: z.string(),
  feedbackEventId: z.string(),
  replyText: z.string().nullable(),
  leadId: z.string(),
  messageSendId: z.string(),
  correlationId: z.string().optional(),
});
export type ReplyClassifyJobPayload = z.infer<typeof ReplyClassifyJobPayloadSchema>;

// ---------- notify.sales job ----------

export const NotifySalesJobPayloadSchema = z.object({
  runId: z.string(),
  leadId: z.string(),
  feedbackEventId: z.string(),
  classification: ReplyClassificationSchema.nullable(),
  unclassified: z.boolean().optional(),
  reason: z.string().optional(),
  correlationId: z.string().optional(),
});
export type NotifySalesJobPayload = z.infer<typeof NotifySalesJobPayloadSchema>;

// ---------- Extended message.generate payload fields ----------

export const FollowUpGenerateFieldsSchema = z.object({
  followUpNumber: z.number().int().min(0).max(3).optional(),
  parentMessageSendId: z.string().optional(),
  previouslyPitchedFeatures: z.array(z.string()).optional(),
  autoApprove: z.boolean().optional(),
});
export type FollowUpGenerateFields = z.infer<typeof FollowUpGenerateFieldsSchema>;
```

**Step 2: Export from index**

In `packages/contracts/src/index.ts`, add:
```typescript
export * from './followup.contract.js';
```

**Step 3: Verify typecheck**

Run: `pnpm typecheck`

**Step 4: Commit**

```bash
git add packages/contracts/src/followup.contract.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add follow-up and classification types"
```

---

### Task 3: Jitter Utility

**Files:**
- Create: `apps/worker/src/utils/jitter.ts`
- Create: `apps/worker/src/utils/jitter.test.ts`

**Step 1: Write the test**

Create `apps/worker/src/utils/jitter.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';

import { computeNextFollowUpAfter, computeOooFollowUpAfter } from './jitter.js';

describe('computeNextFollowUpAfter', () => {
  it('returns a date between 60h and 96h from now', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const result = computeNextFollowUpAfter(now);

    const diffMs = result.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    expect(diffHours).toBeGreaterThanOrEqual(60);
    expect(diffHours).toBeLessThanOrEqual(96);
  });

  it('produces different values across multiple calls (randomness)', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const results = new Set<number>();

    for (let i = 0; i < 20; i++) {
      results.add(computeNextFollowUpAfter(now).getTime());
    }

    // With 20 random calls, we should get at least 2 distinct values
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('computeOooFollowUpAfter', () => {
  it('returns a date between 6.5d and 8d from now', () => {
    const now = new Date('2026-02-17T12:00:00Z');
    const result = computeOooFollowUpAfter(now);

    const diffMs = result.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // 7 days = 168h, jitter -12h to +24h => 156h to 192h
    expect(diffHours).toBeGreaterThanOrEqual(156);
    expect(diffHours).toBeLessThanOrEqual(192);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter worker test -- --run src/utils/jitter.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

Create `apps/worker/src/utils/jitter.ts`:
```typescript
const HOURS_MS = 60 * 60 * 1000;

/**
 * Compute next follow-up time: 72h base + random jitter (-12h to +24h).
 * Effective range: 60h to 96h (2.5 to 4 days).
 */
export function computeNextFollowUpAfter(from: Date = new Date()): Date {
  const baseMs = 72 * HOURS_MS;
  const jitterRangeMs = 36 * HOURS_MS; // -12h to +24h = 36h range
  const jitterOffsetMs = -12 * HOURS_MS;
  const jitterMs = jitterOffsetMs + Math.random() * jitterRangeMs;

  return new Date(from.getTime() + baseMs + jitterMs);
}

/**
 * Compute OOO follow-up: 7 days base + random jitter (-12h to +24h).
 * Effective range: 156h to 192h (6.5 to 8 days).
 */
export function computeOooFollowUpAfter(from: Date = new Date()): Date {
  const baseMs = 168 * HOURS_MS; // 7 days
  const jitterRangeMs = 36 * HOURS_MS;
  const jitterOffsetMs = -12 * HOURS_MS;
  const jitterMs = jitterOffsetMs + Math.random() * jitterRangeMs;

  return new Date(from.getTime() + baseMs + jitterMs);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter worker test -- --run src/utils/jitter.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/worker/src/utils/
git commit -m "feat(worker): add jitter utility for randomized follow-up timing"
```

---

### Task 4: OpenAI Adapter — classifyReply Method

**Files:**
- Modify: `packages/providers/src/ai/openai.adapter.ts`
- Create: `packages/providers/src/ai/openai.adapter.test.ts` (or extend existing)

**Step 1: Write the test**

Create `packages/providers/src/ai/openai-classify.test.ts`:
```typescript
import { describe, expect, it, vi } from 'vitest';

import { OpenAiAdapter } from './openai.adapter.js';

function buildAdapter(responseBody: unknown, status = 200): OpenAiAdapter {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(responseBody)),
  } as Response);

  return new OpenAiAdapter({
    apiKey: 'test-key',
    fetchImpl: mockFetch as unknown as typeof fetch,
  });
}

describe('OpenAiAdapter.classifyReply', () => {
  it('classifies an interested reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'INTERESTED', confidence: 0.95 }) } }],
    });

    const result = await adapter.classifyReply('Yes, I would love to learn more about Zbooni!');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('INTERESTED');
    }
  });

  it('classifies an out-of-office reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'OUT_OF_OFFICE', confidence: 0.9 }) } }],
    });

    const result = await adapter.classifyReply('I am currently out of the office until March 1st.');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('OUT_OF_OFFICE');
    }
  });

  it('classifies an unsubscribe reply', async () => {
    const adapter = buildAdapter({
      choices: [{ message: { content: JSON.stringify({ classification: 'UNSUBSCRIBE', confidence: 0.85 }) } }],
    });

    const result = await adapter.classifyReply('Please stop contacting me.');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data.classification).toBe('UNSUBSCRIBE');
    }
  });

  it('returns terminal_error when API key is missing', async () => {
    const adapter = new OpenAiAdapter({ apiKey: undefined });
    const result = await adapter.classifyReply('Hello');
    expect(result.status).toBe('terminal_error');
  });

  it('returns retryable_error on 429', async () => {
    const adapter = buildAdapter({ error: { message: 'rate limited' } }, 429);
    const result = await adapter.classifyReply('Hello');
    expect(result.status).toBe('retryable_error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @lead-flood/providers test -- --run src/ai/openai-classify.test.ts`
Expected: FAIL — classifyReply is not a function.

**Step 3: Add types and method to OpenAiAdapter**

In `packages/providers/src/ai/openai.adapter.ts`:

Add after `AiScoreResult` interface (~line 48):
```typescript
export interface ReplyClassificationResult {
  classification: 'INTERESTED' | 'NOT_INTERESTED' | 'OUT_OF_OFFICE' | 'UNSUBSCRIBE';
  confidence: number;
}

export type OpenAiClassificationResult =
  | { status: 'success'; data: ReplyClassificationResult }
  | { status: 'retryable_error'; failure: OpenAiFailure }
  | { status: 'terminal_error'; failure: OpenAiFailure };
```

Add Zod schema after `ScoringResponseSchema` (~line 84):
```typescript
const ClassificationResponseSchema = z.object({
  classification: z.enum(['INTERESTED', 'NOT_INTERESTED', 'OUT_OF_OFFICE', 'UNSUBSCRIBE']),
  confidence: z.number().min(0).max(1),
});
```

Add method to `OpenAiAdapter` class after `evaluateLeadScore` (~line 218):
```typescript
  async classifyReply(
    replyText: string,
  ): Promise<OpenAiClassificationResult> {
    if (!this.apiKey) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'OPENAI_API_KEY is not configured',
          raw: null,
        },
      };
    }

    const systemPrompt = [
      'You are a reply classifier for Zbooni, a UAE fintech company.',
      'Classify the customer reply into exactly one category:',
      '- INTERESTED: The person wants to learn more, asks questions, or shows positive intent.',
      '- NOT_INTERESTED: The person explicitly declines, says no, or shows negative intent.',
      '- OUT_OF_OFFICE: Auto-reply or mention of being away/unavailable/on leave.',
      '- UNSUBSCRIBE: Asks to stop receiving messages, says "stop", "remove me", "don\'t contact me".',
      'The reply may be in any language (English, Arabic, Hindi, etc.). Classify based on intent regardless of language.',
      'Return the classification and a confidence score between 0 and 1.',
    ].join(' ');

    return this.callChatCompletion<ReplyClassificationResult>(
      this.scoringModel,
      systemPrompt,
      `Reply text: "${replyText}"`,
      ClassificationResponseSchema,
      (parsed) => ({
        classification: parsed.classification,
        confidence: parsed.confidence,
      }),
    );
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @lead-flood/providers test -- --run src/ai/openai-classify.test.ts`
Expected: PASS

**Step 5: Verify full typecheck**

Run: `pnpm typecheck`

**Step 6: Commit**

```bash
git add packages/providers/src/ai/
git commit -m "feat(providers): add classifyReply method to OpenAiAdapter"
```

---

### Task 5: Modify message.send — Follow-Up Scheduling + Lead Status

**Files:**
- Modify: `apps/worker/src/jobs/message.send.job.ts`

**Step 1: Add followUpNumber to payload interface**

In `apps/worker/src/jobs/message.send.job.ts`, update `MessageSendJobPayload` (~line 22):
```typescript
export interface MessageSendJobPayload extends Pick<SendMessageRequest, 'messageDraftId' | 'messageVariantId' | 'idempotencyKey' | 'scheduledAt'> {
  runId: string;
  sendId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  followUpNumber?: number | undefined;
  correlationId?: string;
}
```

**Step 2: Import jitter utility**

Add import at top:
```typescript
import { computeNextFollowUpAfter } from '../utils/jitter.js';
```

**Step 3: Modify EMAIL success block**

Replace the `prisma.messageSend.update` in the EMAIL success block (~lines 101-108) with:
```typescript
        const followUpNumber = job.data.followUpNumber ?? 0;
        const nextFollowUpAfter = followUpNumber < 3 ? computeNextFollowUpAfter() : null;

        await prisma.$transaction([
          prisma.messageSend.update({
            where: { id: sendId },
            data: {
              status: 'SENT',
              providerMessageId: result.providerMessageId,
              sentAt: new Date(),
              followUpNumber,
              nextFollowUpAfter,
            },
          }),
          ...(followUpNumber === 0
            ? [prisma.lead.update({ where: { id: send.leadId }, data: { status: 'messaged' } })]
            : []),
        ]);
```

**Step 4: Modify WHATSAPP success block**

Replace the `prisma.messageSend.update` in the WHATSAPP success block (~lines 169-178) with:
```typescript
        const followUpNumber = job.data.followUpNumber ?? 0;
        const nextFollowUpAfter = followUpNumber < 3 ? computeNextFollowUpAfter() : null;

        await prisma.$transaction([
          prisma.messageSend.update({
            where: { id: sendId },
            data: {
              status: 'SENT',
              providerMessageId: result.providerMessageId,
              providerConversationId: result.providerMessageId,
              sentAt: new Date(),
              followUpNumber,
              nextFollowUpAfter,
            },
          }),
          ...(followUpNumber === 0
            ? [prisma.lead.update({ where: { id: send.leadId }, data: { status: 'messaged' } })]
            : []),
        ]);
```

Also update the lead select to include `id`:
```typescript
      lead: { select: { id: true, email: true, phone: true, firstName: true, lastName: true } },
```

**Step 5: Verify typecheck**

Run: `pnpm typecheck`

**Step 6: Commit**

```bash
git add apps/worker/src/jobs/message.send.job.ts
git commit -m "feat(worker): message.send schedules follow-ups and updates Lead.status"
```

---

### Task 6: Enhance Trengo Webhook — Reply Text + Cancel Follow-Ups + Enqueue Classification

**Files:**
- Modify: `apps/api/src/modules/webhook/webhook.service.ts`
- Modify: `apps/api/src/modules/webhook/webhook.routes.ts`

**Step 1: Add enqueue dependency to webhook service**

In `apps/api/src/modules/webhook/webhook.service.ts`, modify the function signature:

```typescript
export interface WebhookServiceDependencies {
  enqueueReplyClassify?: ((payload: ReplyClassifyJobPayload) => Promise<void>) | undefined;
}

export async function processTrengoWebhook(
  payload: TrengoWebhookPayload,
  deps?: WebhookServiceDependencies | undefined,
): Promise<WebhookProcessResult> {
```

Add import at top:
```typescript
import type { ReplyClassifyJobPayload } from '@lead-flood/contracts';
```

**Step 2: Extract replyText from payload**

After the `contactPhone` line (~line 24), add:
```typescript
  const replyText = payload.data.message?.body ?? null;
```

**Step 3: Add replyText to FeedbackEvent create**

In the `prisma.feedbackEvent.upsert` create block, add `replyText`:
```typescript
    create: {
      leadId: messageSend.leadId,
      messageSendId: messageSend.id,
      eventType: 'REPLIED',
      source: 'WEBHOOK',
      providerEventId: String(messageId),
      dedupeKey,
      payloadJson: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      replyText,
      occurredAt: new Date(),
    },
```

**Step 4: Cancel pending follow-ups after upsert**

After the `messageSend.update` call (~line 87), add:
```typescript
  // Cancel all pending follow-ups for this lead
  await prisma.messageSend.updateMany({
    where: {
      leadId: messageSend.leadId,
      nextFollowUpAfter: { not: null },
    },
    data: { nextFollowUpAfter: null },
  });

  // Enqueue reply classification
  if (deps?.enqueueReplyClassify) {
    await deps.enqueueReplyClassify({
      runId: `reply.classify:${event.id}`,
      feedbackEventId: event.id,
      replyText,
      leadId: messageSend.leadId,
      messageSendId: messageSend.id,
      correlationId: `webhook:trengo:${messageId}`,
    });
  }
```

**Step 5: Update webhook routes to pass dependencies**

In `apps/api/src/modules/webhook/webhook.routes.ts`, update the interface:
```typescript
export interface WebhookRouteDependencies {
  trengoWebhookSecret: string;
  enqueueReplyClassify?: ((payload: import('@lead-flood/contracts').ReplyClassifyJobPayload) => Promise<void>) | undefined;
}
```

Pass deps to `processTrengoWebhook`:
```typescript
      const result = await processTrengoWebhook(parsed.data, {
        enqueueReplyClassify: deps.enqueueReplyClassify,
      });
```

**Step 6: Verify typecheck**

Run: `pnpm typecheck`

**Step 7: Commit**

```bash
git add apps/api/src/modules/webhook/
git commit -m "feat(api): webhook extracts reply text, cancels follow-ups, enqueues classification"
```

---

### Task 7: reply.classify Job

**Files:**
- Create: `apps/worker/src/jobs/reply.classify.job.ts`

**Step 1: Implement the job**

Create `apps/worker/src/jobs/reply.classify.job.ts`:
```typescript
import type { NotifySalesJobPayload, ReplyClassifyJobPayload } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { OpenAiAdapter } from '@lead-flood/providers';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import { computeOooFollowUpAfter } from '../utils/jitter.js';

export const REPLY_CLASSIFY_JOB_NAME = 'reply.classify';

export const REPLY_CLASSIFY_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'reply.classify.dead_letter',
};

export { type ReplyClassifyJobPayload };

export interface ReplyClassifyLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface ReplyClassifyJobDependencies {
  openAiAdapter: OpenAiAdapter;
  boss: Pick<PgBoss, 'send'>;
  notifySalesJobName: string;
  notifySalesRetryOptions: Pick<SendOptions, 'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'>;
}

async function cancelFollowUps(leadId: string): Promise<void> {
  await prisma.messageSend.updateMany({
    where: {
      leadId,
      nextFollowUpAfter: { not: null },
    },
    data: { nextFollowUpAfter: null },
  });
}

export async function handleReplyClassifyJob(
  logger: ReplyClassifyLogger,
  job: Job<ReplyClassifyJobPayload>,
  deps: ReplyClassifyJobDependencies,
): Promise<void> {
  const { runId, correlationId, feedbackEventId, replyText, leadId, messageSendId } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id, feedbackEventId, leadId },
    'Started reply.classify job',
  );

  try {
    // Voice note / media-only: no text to classify
    if (!replyText || replyText.trim().length === 0) {
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await cancelFollowUps(leadId);

      const notifyPayload: NotifySalesJobPayload = {
        runId: `notify.sales:${feedbackEventId}`,
        leadId,
        feedbackEventId,
        classification: null,
        unclassified: true,
        reason: 'MEDIA_ONLY',
        correlationId: correlationId ?? job.id,
      };

      await deps.boss.send(deps.notifySalesJobName, notifyPayload, deps.notifySalesRetryOptions);

      logger.info(
        { jobId: job.id, feedbackEventId, leadId },
        'Media-only reply — marked replied, notifying team',
      );
      return;
    }

    // Classify via OpenAI
    const result = await deps.openAiAdapter.classifyReply(replyText);

    if (result.status !== 'success') {
      const errorType = result.status === 'retryable_error' ? 'retryable' : 'terminal';
      logger.error(
        { jobId: job.id, feedbackEventId, errorType, failure: result.failure },
        'OpenAI classification failed',
      );

      if (result.status === 'retryable_error') {
        throw new Error(`OpenAI retryable: ${result.failure.message}`);
      }

      // Terminal error: mark as replied (safe default), notify team for manual review
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
      await cancelFollowUps(leadId);

      await deps.boss.send(
        deps.notifySalesJobName,
        {
          runId: `notify.sales:${feedbackEventId}`,
          leadId,
          feedbackEventId,
          classification: null,
          unclassified: true,
          reason: 'CLASSIFICATION_FAILED',
          correlationId: correlationId ?? job.id,
        } satisfies NotifySalesJobPayload,
        deps.notifySalesRetryOptions,
      );
      return;
    }

    const classification = result.data.classification;

    // Update FeedbackEvent with classification
    await prisma.feedbackEvent.update({
      where: { id: feedbackEventId },
      data: { replyClassification: classification },
    });

    // Side effects by classification
    switch (classification) {
      case 'INTERESTED': {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'replied' } });
        await cancelFollowUps(leadId);
        await deps.boss.send(
          deps.notifySalesJobName,
          {
            runId: `notify.sales:${feedbackEventId}`,
            leadId,
            feedbackEventId,
            classification,
            correlationId: correlationId ?? job.id,
          } satisfies NotifySalesJobPayload,
          deps.notifySalesRetryOptions,
        );
        break;
      }

      case 'NOT_INTERESTED':
      case 'UNSUBSCRIBE': {
        await prisma.lead.update({ where: { id: leadId }, data: { status: 'cold' } });
        await cancelFollowUps(leadId);
        break;
      }

      case 'OUT_OF_OFFICE': {
        // Re-schedule follow-up for 7 days + jitter from now
        const latestSend = await prisma.messageSend.findFirst({
          where: { leadId, status: 'SENT' },
          orderBy: { sentAt: 'desc' },
        });

        if (latestSend) {
          await prisma.messageSend.update({
            where: { id: latestSend.id },
            data: { nextFollowUpAfter: computeOooFollowUpAfter() },
          });
        }
        break;
      }
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        feedbackEventId,
        leadId,
        classification,
        confidence: result.data.confidence,
      },
      'Completed reply.classify job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, feedbackEventId, leadId, error },
      'Failed reply.classify job',
    );
    throw error;
  }
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add apps/worker/src/jobs/reply.classify.job.ts
git commit -m "feat(worker): implement reply.classify job with AI classification"
```

---

### Task 8: notify.sales Job

**Files:**
- Create: `apps/worker/src/jobs/notify.sales.job.ts`

**Step 1: Implement the job**

Create `apps/worker/src/jobs/notify.sales.job.ts`:
```typescript
import type { NotifySalesJobPayload } from '@lead-flood/contracts';
import { prisma } from '@lead-flood/db';
import type { Job, SendOptions } from 'pg-boss';

export const NOTIFY_SALES_JOB_NAME = 'notify.sales';

export const NOTIFY_SALES_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'notify.sales.dead_letter',
};

export { type NotifySalesJobPayload };

export interface NotifySalesLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface NotifySalesJobDependencies {
  slackWebhookUrl?: string | undefined;
  trengoApiKey?: string | undefined;
  trengoBaseUrl?: string | undefined;
  trengoInternalConversationId?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

function buildNotificationMessage(
  lead: { firstName: string; lastName: string; email: string },
  classification: string | null,
  unclassified: boolean,
  reason?: string | undefined,
): string {
  const name = `${lead.firstName} ${lead.lastName}`;

  if (unclassified) {
    if (reason === 'MEDIA_ONLY') {
      return `${name} (${lead.email}) replied with a voice note/media — needs manual review`;
    }
    return `${name} (${lead.email}) replied — classification failed, needs manual review`;
  }

  const classificationLabel = classification?.replace(/_/g, ' ').toLowerCase() ?? 'unknown';
  return `${name} (${lead.email}) replied — classified as ${classificationLabel}`;
}

export async function handleNotifySalesJob(
  logger: NotifySalesLogger,
  job: Job<NotifySalesJobPayload>,
  deps?: NotifySalesJobDependencies | undefined,
): Promise<void> {
  const { runId, correlationId, leadId, feedbackEventId, classification, unclassified, reason } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id, leadId, feedbackEventId },
    'Started notify.sales job',
  );

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { firstName: true, lastName: true, email: true },
    });

    if (!lead) {
      logger.error({ jobId: job.id, leadId }, 'Lead not found for notification');
      return;
    }

    const message = buildNotificationMessage(lead, classification, unclassified ?? false, reason);
    const fetchFn = deps?.fetchImpl ?? fetch;

    // Send to Slack
    if (deps?.slackWebhookUrl) {
      try {
        const slackResponse = await fetchFn(deps.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message }),
        });

        if (!slackResponse.ok) {
          logger.warn(
            { jobId: job.id, status: slackResponse.status },
            'Slack notification failed',
          );
        }
      } catch (slackError: unknown) {
        logger.warn({ jobId: job.id, error: slackError }, 'Slack notification error');
      }
    }

    // Send to Trengo internal conversation
    if (deps?.trengoApiKey && deps.trengoInternalConversationId) {
      const trengoBaseUrl = deps.trengoBaseUrl ?? 'https://app.trengo.com/api/v2';
      try {
        const trengoResponse = await fetchFn(
          `${trengoBaseUrl}/conversations/${deps.trengoInternalConversationId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${deps.trengoApiKey}`,
            },
            body: JSON.stringify({
              body: message,
              internal: true,
            }),
          },
        );

        if (!trengoResponse.ok) {
          logger.warn(
            { jobId: job.id, status: trengoResponse.status },
            'Trengo internal notification failed',
          );
        }
      } catch (trengoError: unknown) {
        logger.warn({ jobId: job.id, error: trengoError }, 'Trengo internal notification error');
      }
    }

    logger.info(
      { jobId: job.id, queue: job.name, runId, leadId, message },
      'Completed notify.sales job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, leadId, error },
      'Failed notify.sales job',
    );
    throw error;
  }
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add apps/worker/src/jobs/notify.sales.job.ts
git commit -m "feat(worker): implement notify.sales job for Slack and Trengo notifications"
```

---

### Task 9: Modify message.generate — Follow-Up Mode

**Files:**
- Modify: `apps/worker/src/jobs/message.generate.job.ts`

**Step 1: Extend payload interface**

Update `MessageGenerateJobPayload` to include follow-up fields:
```typescript
export interface MessageGenerateJobPayload
  extends Pick<
    GenerateMessageDraftRequest,
    'leadId' | 'icpProfileId' | 'scorePredictionId' | 'knowledgeEntryIds' | 'channel' | 'promptVersion'
  > {
  runId: string;
  correlationId?: string;
  followUpNumber?: number | undefined;
  parentMessageSendId?: string | undefined;
  previouslyPitchedFeatures?: string[] | undefined;
  autoApprove?: boolean | undefined;
}
```

**Step 2: Add dependencies for message.send enqueue**

Update `MessageGenerateJobDependencies`:
```typescript
export interface MessageGenerateJobDependencies {
  openAiAdapter: OpenAiAdapter;
  boss?: Pick<PgBoss, 'send'> | undefined;
}
```

Add import at top:
```typescript
import type PgBoss from 'pg-boss';
import { MESSAGE_SEND_JOB_NAME, MESSAGE_SEND_RETRY_OPTIONS, type MessageSendJobPayload } from './message.send.job.js';
```

**Step 3: Modify the handler to support follow-up mode**

In `handleMessageGenerateJob`, after loading `icpProfile` (~line 77), also select `featureList`:
```typescript
    const icpProfile = await prisma.icpProfile.findUnique({
      where: { id: icpProfileId },
      select: { description: true, featureList: true },
    });
```

After building `groundingContext` and before OpenAI call, add follow-up logic:
```typescript
    const followUpNumber = job.data.followUpNumber ?? 0;
    const previouslyPitchedFeatures = job.data.previouslyPitchedFeatures ?? [];
    const autoApprove = job.data.autoApprove ?? false;

    // Select feature to pitch
    let pitchedFeature: string | null = null;

    if (icpProfile?.featureList && Array.isArray(icpProfile.featureList)) {
      const featureList = icpProfile.featureList as string[];
      const available = featureList.filter((f) => !previouslyPitchedFeatures.includes(f));
      const candidates = available.length > 0 ? available : featureList; // wrap around if exhausted
      pitchedFeature = candidates[followUpNumber % candidates.length] ?? candidates[0] ?? null;
    }
```

Modify the system prompt for follow-ups (wrap the existing OpenAI call):
```typescript
    if (deps?.openAiAdapter?.isConfigured) {
      let systemPromptOverride: string | undefined;

      if (followUpNumber > 0 && pitchedFeature) {
        systemPromptOverride = [
          'You are an expert B2B sales copywriter for Zbooni, a UAE fintech company.',
          `This is follow-up message #${followUpNumber} to a lead who has not replied.`,
          `Pitch this specific Zbooni feature: ${pitchedFeature}`,
          previouslyPitchedFeatures.length > 0
            ? `Previous messages pitched: ${previouslyPitchedFeatures.join(', ')}. Do NOT repeat these.`
            : '',
          'Write a natural, conversational follow-up. Do not mention this is automated.',
          'Reference the previous outreach naturally ("I wanted to follow up..." / "One more thing I thought might interest you...").',
          'Generate two variants: variant_a (more direct) and variant_b (more casual).',
          'Each variant must have: subject (null for WhatsApp), bodyText, bodyHtml (null ok), ctaText (null ok).',
        ].filter(Boolean).join(' ');
      }

      // Use override prompt for follow-ups, default for initial
      const result = systemPromptOverride
        ? await deps.openAiAdapter.generateMessageVariants({
            ...groundingContext,
            icpDescription: systemPromptOverride,
          })
        : await deps.openAiAdapter.generateMessageVariants(groundingContext);

      // ... rest of existing logic
```

Modify the `prisma.messageDraft.create` to include new fields:
```typescript
    const draft = await prisma.messageDraft.create({
      data: {
        leadId,
        icpProfileId,
        scorePredictionId: scorePredictionId ?? latestScore?.id ?? null,
        promptVersion: promptVersion ?? 'v1',
        generatedByModel,
        groundingKnowledgeIds: knowledgeEntryIds ?? [],
        groundingContextJson: toInputJson(groundingContext),
        approvalStatus: autoApprove ? 'AUTO_APPROVED' : 'PENDING',
        followUpNumber,
        pitchedFeature,
        parentMessageSendId: job.data.parentMessageSendId ?? null,
        variants: {
          create: [
            {
              variantKey: 'variant_a',
              channel: channel ?? 'WHATSAPP',
              subject: variantAContent.subject,
              bodyText: variantAContent.bodyText,
              bodyHtml: variantAContent.bodyHtml,
              ctaText: variantAContent.ctaText,
              isSelected: autoApprove,
            },
            {
              variantKey: 'variant_b',
              channel: channel ?? 'WHATSAPP',
              subject: variantBContent.subject,
              bodyText: variantBContent.bodyText,
              bodyHtml: variantBContent.bodyHtml,
              ctaText: variantBContent.ctaText,
              isSelected: false,
            },
          ],
        },
      },
      include: { variants: true },
    });
```

After draft creation, if autoApprove, enqueue message.send:
```typescript
    // Auto-send for follow-ups
    if (autoApprove && deps?.boss) {
      const selectedVariant = draft.variants[0]; // variant_a for auto-approved
      if (selectedVariant) {
        const sendRecord = await prisma.messageSend.create({
          data: {
            leadId,
            messageDraftId: draft.id,
            messageVariantId: selectedVariant.id,
            channel: selectedVariant.channel,
            provider: selectedVariant.channel === 'WHATSAPP' ? 'TRENGO' : 'RESEND',
            status: 'QUEUED',
            idempotencyKey: `followup:${leadId}:${draft.id}:${selectedVariant.id}`,
            followUpNumber,
          },
        });

        await deps.boss.send(
          MESSAGE_SEND_JOB_NAME,
          {
            runId: `message.send:${sendRecord.id}`,
            sendId: sendRecord.id,
            messageDraftId: draft.id,
            messageVariantId: selectedVariant.id,
            idempotencyKey: sendRecord.idempotencyKey,
            channel: selectedVariant.channel,
            followUpNumber,
            correlationId: correlationId ?? job.id,
          } satisfies MessageSendJobPayload,
          MESSAGE_SEND_RETRY_OPTIONS,
        );

        logger.info(
          { jobId: job.id, draftId: draft.id, sendId: sendRecord.id, followUpNumber },
          'Auto-approved follow-up, enqueued message.send',
        );
      }
    }
```

**Step 4: Verify typecheck**

Run: `pnpm typecheck`

**Step 5: Commit**

```bash
git add apps/worker/src/jobs/message.generate.job.ts
git commit -m "feat(worker): message.generate supports follow-up mode with feature rotation"
```

---

### Task 10: followup.check Cron Scanner Job

**Files:**
- Create: `apps/worker/src/jobs/followup.check.job.ts`

**Step 1: Implement the job**

Create `apps/worker/src/jobs/followup.check.job.ts`:
```typescript
import { prisma } from '@lead-flood/db';
import type PgBoss from 'pg-boss';
import type { Job, SendOptions } from 'pg-boss';

import {
  MESSAGE_GENERATE_JOB_NAME,
  MESSAGE_GENERATE_RETRY_OPTIONS,
  type MessageGenerateJobPayload,
} from './message.generate.job.js';

export const FOLLOWUP_CHECK_JOB_NAME = 'followup.check';

export const FOLLOWUP_CHECK_RETRY_OPTIONS: Pick<
  SendOptions,
  'retryLimit' | 'retryDelay' | 'retryBackoff' | 'deadLetter'
> = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  deadLetter: 'followup.check.dead_letter',
};

export interface FollowupCheckJobPayload {
  runId: string;
  correlationId?: string;
}

export interface FollowupCheckLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

export interface FollowupCheckJobDependencies {
  boss: Pick<PgBoss, 'send'>;
}

export async function handleFollowupCheckJob(
  logger: FollowupCheckLogger,
  job: Job<FollowupCheckJobPayload>,
  deps: FollowupCheckJobDependencies,
): Promise<void> {
  const { runId, correlationId } = job.data;

  logger.info(
    { jobId: job.id, queue: job.name, runId, correlationId: correlationId ?? job.id },
    'Started followup.check job',
  );

  try {
    const now = new Date();

    // Find all MessageSends eligible for follow-up
    const eligibleSends = await prisma.messageSend.findMany({
      where: {
        status: 'SENT',
        followUpNumber: { lt: 3 },
        nextFollowUpAfter: { not: null, lte: now },
        lead: {
          status: 'messaged',
        },
      },
      select: {
        id: true,
        leadId: true,
        followUpNumber: true,
        lead: {
          select: {
            id: true,
            feedbackEvents: {
              where: { eventType: { in: ['REPLIED', 'UNSUBSCRIBED'] } },
              select: { id: true },
              take: 1,
            },
          },
        },
        messageDraft: {
          select: {
            icpProfileId: true,
            pitchedFeature: true,
          },
        },
      },
      orderBy: { nextFollowUpAfter: 'asc' },
    });

    let enqueuedCount = 0;

    for (const send of eligibleSends) {
      // Double-check: no reply events
      if (send.lead.feedbackEvents.length > 0) {
        // Stale data — cancel this follow-up
        await prisma.messageSend.update({
          where: { id: send.id },
          data: { nextFollowUpAfter: null },
        });
        continue;
      }

      // Collect previously pitched features from all drafts for this lead
      const previousDrafts = await prisma.messageDraft.findMany({
        where: { leadId: send.leadId, pitchedFeature: { not: null } },
        select: { pitchedFeature: true },
      });
      const previouslyPitchedFeatures = previousDrafts
        .map((d) => d.pitchedFeature)
        .filter((f): f is string => f !== null);

      const icpProfileId = send.messageDraft.icpProfileId;

      // Enqueue message.generate in follow-up mode
      await deps.boss.send(
        MESSAGE_GENERATE_JOB_NAME,
        {
          runId: `followup:${send.id}:${send.followUpNumber + 1}`,
          leadId: send.leadId,
          icpProfileId,
          followUpNumber: send.followUpNumber + 1,
          parentMessageSendId: send.id,
          previouslyPitchedFeatures,
          autoApprove: true,
          channel: 'WHATSAPP',
          correlationId: correlationId ?? job.id,
        } satisfies MessageGenerateJobPayload,
        MESSAGE_GENERATE_RETRY_OPTIONS,
      );

      // Mark as consumed — prevent double-enqueue
      await prisma.messageSend.update({
        where: { id: send.id },
        data: { nextFollowUpAfter: null },
      });

      enqueuedCount++;
    }

    logger.info(
      {
        jobId: job.id,
        queue: job.name,
        runId,
        eligibleCount: eligibleSends.length,
        enqueuedCount,
      },
      'Completed followup.check job',
    );
  } catch (error: unknown) {
    logger.error(
      { jobId: job.id, queue: job.name, runId, error },
      'Failed followup.check job',
    );
    throw error;
  }
}
```

**Step 2: Verify typecheck**

Run: `pnpm typecheck`

**Step 3: Commit**

```bash
git add apps/worker/src/jobs/followup.check.job.ts
git commit -m "feat(worker): implement followup.check cron scanner job"
```

---

### Task 11: Worker + API Wiring

**Files:**
- Modify: `apps/worker/src/queues.ts`
- Modify: `apps/worker/src/schedules.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/src/env.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Add new env vars to worker**

In `apps/worker/src/env.ts`, add to `WorkerEnvSchema`:
```typescript
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  TRENGO_INTERNAL_CONVERSATION_ID: z.string().min(1).optional(),
```

**Step 2: Register new queues**

In `apps/worker/src/queues.ts`:

Add imports:
```typescript
import {
  FOLLOWUP_CHECK_JOB_NAME,
  FOLLOWUP_CHECK_RETRY_OPTIONS,
} from './jobs/followup.check.job.js';
import {
  REPLY_CLASSIFY_JOB_NAME,
  REPLY_CLASSIFY_RETRY_OPTIONS,
} from './jobs/reply.classify.job.js';
import {
  NOTIFY_SALES_JOB_NAME,
  NOTIFY_SALES_RETRY_OPTIONS,
} from './jobs/notify.sales.job.js';
```

Add to `WORKER_QUEUE_DEFINITIONS` array:
```typescript
  {
    name: FOLLOWUP_CHECK_JOB_NAME,
    retryOptions: normalizeRetryOptions(FOLLOWUP_CHECK_JOB_NAME, FOLLOWUP_CHECK_RETRY_OPTIONS),
  },
  {
    name: REPLY_CLASSIFY_JOB_NAME,
    retryOptions: normalizeRetryOptions(REPLY_CLASSIFY_JOB_NAME, REPLY_CLASSIFY_RETRY_OPTIONS),
  },
  {
    name: NOTIFY_SALES_JOB_NAME,
    retryOptions: normalizeRetryOptions(NOTIFY_SALES_JOB_NAME, NOTIFY_SALES_RETRY_OPTIONS),
  },
```

**Step 3: Register followup.check cron schedule**

In `apps/worker/src/schedules.ts`:

Add imports:
```typescript
import {
  FOLLOWUP_CHECK_JOB_NAME,
  type FollowupCheckJobPayload,
  FOLLOWUP_CHECK_RETRY_OPTIONS,
} from './jobs/followup.check.job.js';
```

Add schedule in `registerWorkerSchedules` (after analytics.rollup schedule):
```typescript
  // Follow-up check: hourly during UAE business hours (09:00-18:00 GST = 05:00-14:00 UTC)
  await boss.schedule(
    FOLLOWUP_CHECK_JOB_NAME,
    '0 5-14 * * *',
    {
      runId: 'scheduled:followup.check',
      correlationId: 'scheduler:followup.check',
    } satisfies FollowupCheckJobPayload,
    {
      singletonKey: 'schedule:followup.check',
      ...FOLLOWUP_CHECK_RETRY_OPTIONS,
    },
  );
```

**Step 4: Register workers in worker index**

In `apps/worker/src/index.ts`:

Add imports:
```typescript
import {
  FOLLOWUP_CHECK_JOB_NAME,
  handleFollowupCheckJob,
  type FollowupCheckJobPayload,
} from './jobs/followup.check.job.js';
import {
  REPLY_CLASSIFY_JOB_NAME,
  handleReplyClassifyJob,
  type ReplyClassifyJobPayload,
} from './jobs/reply.classify.job.js';
import {
  NOTIFY_SALES_JOB_NAME,
  NOTIFY_SALES_RETRY_OPTIONS,
  handleNotifySalesJob,
  type NotifySalesJobPayload,
} from './jobs/notify.sales.job.js';
```

Add worker registrations after the `message.send` registration (~line 313):
```typescript
  await registerWorker<FollowupCheckJobPayload>(
    boss,
    logger,
    FOLLOWUP_CHECK_JOB_NAME,
    (jobLogger, job) =>
      handleFollowupCheckJob(jobLogger, job, { boss }),
  );
  await registerWorker<ReplyClassifyJobPayload>(
    boss,
    logger,
    REPLY_CLASSIFY_JOB_NAME,
    (jobLogger, job) =>
      handleReplyClassifyJob(jobLogger, job, {
        openAiAdapter,
        boss,
        notifySalesJobName: NOTIFY_SALES_JOB_NAME,
        notifySalesRetryOptions: NOTIFY_SALES_RETRY_OPTIONS,
      }),
  );
  await registerWorker<NotifySalesJobPayload>(
    boss,
    logger,
    NOTIFY_SALES_JOB_NAME,
    (jobLogger, job) =>
      handleNotifySalesJob(jobLogger, job, {
        slackWebhookUrl: env.SLACK_WEBHOOK_URL,
        trengoApiKey: env.TRENGO_API_KEY,
        trengoBaseUrl: env.TRENGO_BASE_URL,
        trengoInternalConversationId: env.TRENGO_INTERNAL_CONVERSATION_ID,
      }),
  );
```

Also pass `boss` to `handleMessageGenerateJob`:
```typescript
  await registerWorker<MessageGenerateJobPayload>(
    boss,
    logger,
    MESSAGE_GENERATE_JOB_NAME,
    (jobLogger, job) =>
      handleMessageGenerateJob(jobLogger, job, {
        openAiAdapter,
        boss,
      }),
  );
```

**Step 5: Wire reply.classify enqueue in API**

In `apps/api/src/index.ts`, add import and create the `reply.classify` queue + enqueue closure (follow the same pattern as existing queues like `message.generate`).

Add in the queue creation section:
```typescript
  const REPLY_CLASSIFY_QUEUE = 'reply.classify';
  await boss.createQueue(REPLY_CLASSIFY_QUEUE);

  const enqueueReplyClassify = async (payload: import('@lead-flood/contracts').ReplyClassifyJobPayload): Promise<void> => {
    await boss.send(REPLY_CLASSIFY_QUEUE, payload, {
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: 'reply.classify.dead_letter',
    });
  };
```

Pass `enqueueReplyClassify` to the webhook route dependencies in `apps/api/src/server.ts`:
```typescript
  registerWebhookRoutes(app, {
    trengoWebhookSecret: env.TRENGO_WEBHOOK_SECRET ?? '',
    enqueueReplyClassify,
  });
```

**Step 6: Verify typecheck**

Run: `pnpm typecheck`

**Step 7: Verify tests pass**

Run: `pnpm test`

**Step 8: Commit**

```bash
git add apps/worker/src/ apps/api/src/
git commit -m "feat: wire followup.check, reply.classify, and notify.sales into worker and API"
```

---

### Task 12: Seed ICP Feature Lists

**Files:**
- Create: `packages/db/prisma/seed-features.ts` (or modify existing seed)

**Step 1: Create a seed script or migration to populate IcpProfile.featureList**

This depends on how ICP profiles are currently seeded. The script should:

1. For each ICP profile, match it to a segment (A-H) based on name/description
2. Set `featureList` to the corresponding array from the ICP and Offerings doc:

```typescript
const SEGMENT_FEATURES: Record<string, string[]> = {
  'Luxury & High-Ticket Services': [
    'Support for large one-off payments on a single link (up to AED 1M per link)',
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
    'Multi-MID support for failed transactions, enabling retries via alternate MIDs',
    'Immediate live support via call or WhatsApp for urgent or failed transactions',
    'Catalog (CShop) to pre-list services and share them directly via chat',
    'CRM to track customer order history and add internal notes',
  ],
  'Gifting, Corporate & Bespoke Experiences': [
    'Catalog (CShop) to pre-list services and share them directly via chat',
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
    'Live payment link editing without creating new links',
    'In-app discount creation',
    'Promo code creation and management',
    'WhatsApp marketing campaigns for new customer acquisition',
  ],
  'Events, Weddings & Experiential Operators': [
    'End-to-end event marketing management via WhatsApp',
    'Ticketing solution to issue, manage, and track event entry tickets',
    'Catalog (CShop) to pre-list products or services and share via chat or QR code',
    'QR-based food ordering and payment solution',
    'POS machine for in-person card acceptance',
    'Customer database for re-engagement in future editions',
    'Master organizer dashboard to track sales and performance across all vendors',
    'Promo code creation and management',
  ],
  'Home, Design & High-Value Contracting': [
    'Support for large one-off payments on a single link (up to AED 1M per link)',
    'Customizable payment links allowing partial payments based on project stages',
    'Easy reconciliation to track payments, customers, and VAT',
    'Customizable instant customer receipt generation',
    'Catalog (CShop) to pre-list services and share them directly via chat',
    'CRM to track customer order history and add internal notes',
    'In-app discount creation',
  ],
  'Boutique Hospitality & Short-Stay Operators': [
    'Support for large one-off payments on a single link (up to AED 1M per link)',
    'Customizable payment links allowing partial payments (deposit/balance/add-ons)',
    'International card acceptance',
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, etc.)',
    'Instant customer receipt generation',
    'Easy reconciliation to track payments, customers, and VAT',
    'Catalog (CShop) to pre-list services and upsells via chat or QR code',
    'CRM to track guest history, preferences, and add internal notes',
  ],
  'Premium Wellness, Aesthetics & Longevity Clinics': [
    'Customizable payment links allowing staged or package-based payments',
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, Tabby, Tamara, etc.)',
    'CRM to track patient history, purchases, and internal notes',
    'Promo code and discount creation for campaigns or referrals',
  ],
  'High-Ticket Coaching, Advisory & Membership Communities': [
    'Customizable payment links allowing partial or staged payments',
    'International card acceptance',
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, Tabby, Tamara, etc.)',
    'Instant customer receipt generation',
    'CRM to track client history, program enrolment, and notes',
    'Promo code and discount creation for cohorts or referrals',
    'WhatsApp marketing campaigns to re-engage past clients for new programs',
  ],
  'Education & Training Providers': [
    'Multiple payment methods (Amex, Apple Pay, Google Pay, PayPal, Tabby, Tamara, etc.)',
    'Inventory limits to limit attendance of service',
    'Instant customer receipt generation',
    'Easy reconciliation to track payments, students, and VAT',
    'CRM to track student enrolment, payment status, and notes',
    'Promo code creation for early-bird or partner discounts',
    'WhatsApp marketing campaigns to promote new cohorts and intakes',
  ],
};
```

**Step 2: Run the seed**

Run: `pnpm db:seed` (or the specific script)

**Step 3: Commit**

```bash
git add packages/db/prisma/
git commit -m "feat(db): seed ICP profile feature lists from offerings doc"
```

---

### Task 13: Full Verification

**Step 1: Run full quality check**

```bash
export PATH="/Users/os_architect/.nvm/versions/node/v22.22.0/bin:$PATH"
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

**Step 2: Verify migration applies cleanly**

```bash
pnpm db:migrate
```

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address Phase 5 verification issues"
```
