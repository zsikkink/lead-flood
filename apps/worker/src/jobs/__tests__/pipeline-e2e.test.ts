/**
 * End-to-end pipeline integration test
 *
 * Runs every pipeline stage in sequence against a real PostgreSQL database
 * with mocked external HTTP calls (PDL, OpenAI, Resend, Trengo).
 *
 * Pipeline under test:
 *   enrichment → features → scoring → message.generate → message.send (email)
 *   → message.send (whatsapp) → analytics.rollup
 */
import { randomUUID } from 'node:crypto';

import { type Prisma, prisma } from '@lead-flood/db';
import {
  PdlEnrichmentAdapter,
  OpenAiAdapter,
  ResendAdapter,
  TrengoAdapter,
} from '@lead-flood/providers';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { handleEnrichmentRunJob, type EnrichmentRunJobPayload, type EnrichmentRunDependencies } from '../enrichment.run.job.js';
import { handleFeaturesComputeJob, type FeaturesComputeJobPayload, type FeaturesComputeDependencies } from '../features.compute.job.js';
import { handleScoringComputeJob, type ScoringComputeJobPayload, type ScoringComputeJobDependencies } from '../scoring.compute.job.js';
import { handleMessageGenerateJob, type MessageGenerateJobPayload, type MessageGenerateJobDependencies } from '../message.generate.job.js';
import { handleMessageSendJob, type MessageSendJobPayload, type MessageSendJobDependencies } from '../message.send.job.js';
import { handleAnalyticsRollupJob, type AnalyticsRollupJobPayload } from '../analytics.rollup.job.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_PREFIX = `e2e-pipeline-${Date.now()}`;

function makeJob<T>(data: T, name = 'test'): Job<T> {
  return {
    id: randomUUID(),
    name,
    data,
    priority: 0,
    state: 'active',
    retrylimit: 0,
    retrycount: 0,
    retrydelay: 0,
    retrybackoff: false,
    startafter: new Date(),
    startedon: new Date(),
    singletonkey: null,
    singletonon: null,
    expirein: { hours: 1 },
    createdon: new Date(),
    completedon: null,
    keepuntil: new Date(Date.now() + 86_400_000),
    on_complete: false,
    output: null,
    deadletter: null,
  } as unknown as Job<T>;
}

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const bossSendSpy = vi.fn().mockResolvedValue(undefined);
const mockBoss = { send: bossSendSpy };

// ---------------------------------------------------------------------------
// Mock fetch factories
// ---------------------------------------------------------------------------

function makePdlFetch(): typeof fetch {
  // PDL adapter reads: work_email, mobile_phone, location_country, location_locality,
  // linkedin_url, and experience[0].{company, industry, company_domain, company_size, company_website}
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        work_email: `${TEST_PREFIX}@zbooni.test`,
        mobile_phone: '+971501234567',
        location_country: 'united arab emirates',
        location_locality: 'Dubai',
        linkedin_url: 'https://linkedin.com/in/e2e-test',
        experience: [
          {
            company: 'Zbooni Test Corp',
            industry: 'Financial Services',
            company_domain: 'zbooni-test.com',
            company_size: 150,
            company_website: 'https://zbooni-test.com',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ) as unknown as typeof fetch;
}

function makeOpenAiFetch(): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                variant_a: {
                  subject: 'Test Email Subject A',
                  bodyText: 'Hello from variant A',
                  bodyHtml: '<p>Hello from variant A</p>',
                  ctaText: 'Learn More',
                },
                variant_b: {
                  subject: 'Test Email Subject B',
                  bodyText: 'Hello from variant B',
                  bodyHtml: '<p>Hello from variant B</p>',
                  ctaText: null,
                },
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ) as unknown as typeof fetch;
}

function makeResendFetch(): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ id: `resend-msg-${randomUUID()}` }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ) as unknown as typeof fetch;
}

function makeTrengoFetch(): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ id: 123456, message_id: `trengo-msg-${randomUUID()}` }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  ) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Adapter factories
// ---------------------------------------------------------------------------

function makePdlAdapter(): PdlEnrichmentAdapter {
  return new PdlEnrichmentAdapter({
    apiKey: 'test-pdl-key',
    baseUrl: 'https://api.peopledatalabs.test/v5',
    fetchImpl: makePdlFetch(),
  });
}

function makeOpenAiAdapter(): OpenAiAdapter {
  return new OpenAiAdapter({
    apiKey: 'test-openai-key',
    fetchImpl: makeOpenAiFetch(),
  });
}

function makeResendAdapter(): ResendAdapter {
  return new ResendAdapter({
    apiKey: 'test-resend-key',
    fromEmail: 'noreply@leadflood.test',
    fetchImpl: makeResendFetch(),
  });
}

function makeTrengoAdapter(): TrengoAdapter {
  return new TrengoAdapter({
    apiKey: 'test-trengo-key',
    channelId: 'test-channel-123',
    fetchImpl: makeTrengoFetch(),
  });
}

// ---------------------------------------------------------------------------
// Seed data IDs (deterministic for cleanup)
// ---------------------------------------------------------------------------

const LEAD_EMAIL = `${TEST_PREFIX}@zbooni.test`;
const ICP_ID = randomUUID();
const LEAD_ID = randomUUID();
const DISCOVERY_RECORD_ID = randomUUID();
const RUN_ID = `pipeline-e2e-${randomUUID()}`;
const TODAY = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

// Collect IDs created during test for cleanup
const createdJobExecutionIds: string[] = [];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('pipeline end-to-end', () => {
  beforeAll(async () => {
    // Seed IcpProfile
    await prisma.icpProfile.create({
      data: {
        id: ICP_ID,
        name: `${TEST_PREFIX} ICP`,
        qualificationLogic: 'WEIGHTED',
        targetIndustries: ['Financial Services', 'Technology'],
        targetCountries: ['AE', 'SA'],
        isActive: true,
        featureList: JSON.parse(JSON.stringify([
          'Payment Links',
          'WhatsApp Commerce',
          'Order Management',
          'Custom Storefronts',
        ])) as Prisma.InputJsonValue,
      },
    });

    // Seed Lead
    await prisma.lead.create({
      data: {
        id: LEAD_ID,
        firstName: 'Pipeline',
        lastName: 'Tester',
        email: LEAD_EMAIL,
        source: 'e2e-test',
        status: 'new',
      },
    });

    // Seed LeadDiscoveryRecord (simulates discovery.run output)
    await prisma.leadDiscoveryRecord.create({
      data: {
        id: DISCOVERY_RECORD_ID,
        leadId: LEAD_ID,
        icpProfileId: ICP_ID,
        provider: 'APOLLO',
        providerRecordId: `apollo-e2e-${TEST_PREFIX}`,
        queryHash: `e2e-${TEST_PREFIX}`,
        status: 'DISCOVERED',
        rawPayload: { source: 'e2e-test' },
        discoveredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    // Cleanup in reverse dependency order
    await prisma.analyticsDailyRollup.deleteMany({
      where: { icpProfileId: ICP_ID },
    });
    await prisma.modelEvaluation.deleteMany({
      where: { trainingRun: { modelVersions: { some: { trainingRun: { configJson: { path: ['testPrefix'], equals: TEST_PREFIX } } } } } },
    }).catch(() => { /* no-op if none */ });
    await prisma.messageSend.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.messageVariant.deleteMany({
      where: { messageDraft: { leadId: LEAD_ID } },
    });
    await prisma.messageDraft.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.feedbackEvent.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.trainingLabel.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.leadScorePrediction.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.leadFeatureSnapshot.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.leadEnrichmentRecord.deleteMany({
      where: { leadId: LEAD_ID },
    });
    if (createdJobExecutionIds.length > 0) {
      await prisma.jobExecution.deleteMany({
        where: { id: { in: createdJobExecutionIds } },
      });
    }
    await prisma.jobExecution.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.leadDiscoveryRecord.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.lead.deleteMany({
      where: { id: LEAD_ID },
    });
    // Clean up model versions/training runs created by scoring baseline
    await prisma.modelEvaluation.deleteMany({
      where: { trainingRun: { configJson: { path: ['source'], equals: 'pipeline-e2e' } } },
    }).catch(() => { /* no-op */ });
    await prisma.modelVersion.deleteMany({
      where: { versionTag: 'deterministic-baseline-v1' },
    }).catch(() => { /* unique constraint means it may already exist */ });
    await prisma.icpProfile.deleteMany({
      where: { id: ICP_ID },
    });
  });

  // -----------------------------------------------------------------------
  // Stage 1: Enrichment
  // -----------------------------------------------------------------------
  it('stage 1: enrichment.run enriches the lead via PDL', async () => {
    const payload: EnrichmentRunJobPayload = {
      runId: RUN_ID,
      leadId: LEAD_ID,
      provider: 'PEOPLE_DATA_LABS',
      icpProfileId: ICP_ID,
      correlationId: `corr-${RUN_ID}`,
    };

    const stubHunter = { enrichLead: vi.fn() } as unknown as EnrichmentRunDependencies['hunterAdapter'];
    const stubClearbit = { enrichLead: vi.fn() } as unknown as EnrichmentRunDependencies['clearbitAdapter'];
    const stubPublicWeb = { enrichLead: vi.fn() } as unknown as EnrichmentRunDependencies['publicWebLookupAdapter'];

    const deps: EnrichmentRunDependencies = {
      boss: mockBoss,
      pdlAdapter: makePdlAdapter(),
      hunterAdapter: stubHunter,
      clearbitAdapter: stubClearbit,
      publicWebLookupAdapter: stubPublicWeb,
      enrichmentEnabled: true,
      pdlEnabled: true,
      hunterEnabled: false,
      clearbitEnabled: false,
      otherFreeEnabled: false,
      defaultProvider: 'PEOPLE_DATA_LABS',
    };

    await handleEnrichmentRunJob(noopLogger, makeJob(payload, 'enrichment.run'), deps);

    // Verify lead updated
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('enriched');
    expect(lead.phone).toBe('+971501234567');
    expect(lead.enrichmentData).toBeTruthy();

    // Verify enrichment record created
    const records = await prisma.leadEnrichmentRecord.findMany({ where: { leadId: LEAD_ID } });
    expect(records.length).toBeGreaterThanOrEqual(1);
    const completed = records.find((r) => r.status === 'COMPLETED');
    expect(completed).toBeTruthy();
    expect(completed!.provider).toBe('PEOPLE_DATA_LABS');

    // Verify features.compute enqueued via boss.send
    const featuresSendCall = bossSendSpy.mock.calls.find(
      (call: unknown[]) => call[0] === 'features.compute',
    );
    expect(featuresSendCall).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Stage 2: Feature extraction
  // -----------------------------------------------------------------------
  it('stage 2: features.compute extracts feature vector', async () => {
    bossSendSpy.mockClear();

    const payload: FeaturesComputeJobPayload = {
      runId: RUN_ID,
      leadId: LEAD_ID,
      icpProfileId: ICP_ID,
      snapshotVersion: 1,
      sourceVersion: 'features_v1',
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: FeaturesComputeDependencies = {
      boss: mockBoss,
      enqueueScoring: false,  // break chain — we call scoring manually
    };

    await handleFeaturesComputeJob(noopLogger, makeJob(payload, 'features.compute'), deps);

    // Verify feature snapshot created
    const snapshot = await prisma.leadFeatureSnapshot.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.featuresJson).toBeTruthy();
    expect(typeof snapshot!.featureVectorHash).toBe('string');
    expect(snapshot!.snapshotVersion).toBe(1);

    // Verify feature vector contains expected keys
    const features = snapshot!.featuresJson as Record<string, unknown>;
    expect(features.has_email).toBe(true);
    expect(features.has_company_name).toBe(true);

    // Scoring should NOT have been enqueued
    const scoringSendCall = bossSendSpy.mock.calls.find(
      (call: unknown[]) => call[0] === 'scoring.compute',
    );
    expect(scoringSendCall).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Stage 3: Scoring
  // -----------------------------------------------------------------------
  it('stage 3: scoring.compute produces a score prediction', async () => {
    bossSendSpy.mockClear();

    const payload: ScoringComputeJobPayload = {
      runId: `scoring-${RUN_ID}`,
      mode: 'BY_LEAD_IDS',
      icpProfileId: ICP_ID,
      leadIds: [LEAD_ID],
      correlationId: `corr-${RUN_ID}`,
    };

    // No OpenAI adapter — pure deterministic scoring
    const deps: ScoringComputeJobDependencies = {
      deterministicWeight: 1.0,
      aiWeight: 0.0,
    };

    await handleScoringComputeJob(noopLogger, makeJob(payload, 'scoring.compute'), deps);

    // Verify score prediction created
    const prediction = await prisma.leadScorePrediction.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(prediction).toBeTruthy();
    expect(prediction!.blendedScore).toBeGreaterThanOrEqual(0);
    expect(prediction!.blendedScore).toBeLessThanOrEqual(100);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(prediction!.scoreBand);
    expect(prediction!.deterministicScore).toBeGreaterThanOrEqual(0);
  });

  // -----------------------------------------------------------------------
  // Stage 4: Message generation
  // -----------------------------------------------------------------------
  it('stage 4: message.generate creates draft + variants', async () => {
    bossSendSpy.mockClear();

    const prediction = await prisma.leadScorePrediction.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });

    const payload: MessageGenerateJobPayload = {
      runId: `msggen-${RUN_ID}`,
      leadId: LEAD_ID,
      icpProfileId: ICP_ID,
      scorePredictionId: prediction?.id,
      knowledgeEntryIds: [],
      promptVersion: 'v1',
      channel: 'EMAIL',
      correlationId: `corr-${RUN_ID}`,
      autoApprove: true,
    };

    const deps: MessageGenerateJobDependencies = {
      openAiAdapter: makeOpenAiAdapter(),
      boss: mockBoss,
    };

    await handleMessageGenerateJob(noopLogger, makeJob(payload, 'message.generate'), deps);

    // Verify draft created
    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
      include: { variants: true },
    });
    expect(draft).toBeTruthy();
    expect(draft!.approvalStatus).toBe('AUTO_APPROVED');
    expect(draft!.variants.length).toBe(2);

    // Verify variant_a is selected (autoApprove)
    const variantA = draft!.variants.find((v) => v.variantKey === 'variant_a');
    expect(variantA).toBeTruthy();
    expect(variantA!.isSelected).toBe(true);
    expect(variantA!.bodyText).toContain('variant A');

    // Verify MessageSend created (autoApprove + boss provided)
    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, messageDraftId: draft!.id },
    });
    expect(send).toBeTruthy();
    expect(send!.status).toBe('QUEUED');
    expect(send!.channel).toBe('EMAIL');
    expect(send!.provider).toBe('RESEND');

    // Verify message.send enqueued
    const sendCall = bossSendSpy.mock.calls.find(
      (call: unknown[]) => call[0] === 'message.send',
    );
    expect(sendCall).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Stage 5: Email send
  // -----------------------------------------------------------------------
  it('stage 5: message.send delivers email via Resend', async () => {
    bossSendSpy.mockClear();

    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, channel: 'EMAIL', status: 'QUEUED' },
      include: { messageVariant: true },
    });
    expect(send).toBeTruthy();

    const payload: MessageSendJobPayload = {
      runId: `msgsend-email-${RUN_ID}`,
      sendId: send!.id,
      messageDraftId: send!.messageDraftId,
      messageVariantId: send!.messageVariantId,
      idempotencyKey: send!.idempotencyKey,
      channel: 'EMAIL',
      followUpNumber: 0,
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: MessageSendJobDependencies = {
      resendAdapter: makeResendAdapter(),
      trengoAdapter: makeTrengoAdapter(),
    };

    await handleMessageSendJob(noopLogger, makeJob(payload, 'message.send'), deps);

    // Verify send updated
    const updated = await prisma.messageSend.findUniqueOrThrow({
      where: { id: send!.id },
    });
    expect(updated.status).toBe('SENT');
    expect(updated.providerMessageId).toBeTruthy();
    expect(updated.sentAt).toBeTruthy();
    expect(updated.followUpNumber).toBe(0);

    // Verify lead status updated to 'messaged' (first message, followUpNumber=0)
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('messaged');
  });

  // -----------------------------------------------------------------------
  // Stage 6: WhatsApp send
  // -----------------------------------------------------------------------
  it('stage 6: message.send delivers WhatsApp via Trengo', async () => {
    bossSendSpy.mockClear();

    // Create a WhatsApp variant + MessageSend to test WhatsApp path
    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(draft).toBeTruthy();

    const waVariant = await prisma.messageVariant.create({
      data: {
        messageDraftId: draft!.id,
        variantKey: 'variant_wa',
        channel: 'WHATSAPP',
        bodyText: 'E2E WhatsApp test message',
        isSelected: true,
      },
    });

    const idempotencyKey = `wa-e2e-${TEST_PREFIX}-${randomUUID()}`;
    const waSend = await prisma.messageSend.create({
      data: {
        leadId: LEAD_ID,
        messageDraftId: draft!.id,
        messageVariantId: waVariant.id,
        channel: 'WHATSAPP',
        provider: 'TRENGO',
        status: 'QUEUED',
        idempotencyKey,
        followUpNumber: 1,
      },
    });

    const payload: MessageSendJobPayload = {
      runId: `msgsend-wa-${RUN_ID}`,
      sendId: waSend.id,
      messageDraftId: draft!.id,
      messageVariantId: waVariant.id,
      idempotencyKey,
      channel: 'WHATSAPP',
      followUpNumber: 1,
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: MessageSendJobDependencies = {
      resendAdapter: makeResendAdapter(),
      trengoAdapter: makeTrengoAdapter(),
      // No rate limiter — skip rate limiting in test
    };

    await handleMessageSendJob(noopLogger, makeJob(payload, 'message.send'), deps);

    // Verify send updated
    const updated = await prisma.messageSend.findUniqueOrThrow({
      where: { id: waSend.id },
    });
    expect(updated.status).toBe('SENT');
    expect(updated.providerMessageId).toBeTruthy();
    expect(updated.sentAt).toBeTruthy();
    expect(updated.followUpNumber).toBe(1);
    // providerConversationId set for WhatsApp (same as providerMessageId)
    expect(updated.providerConversationId).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Stage 7: Analytics rollup
  // -----------------------------------------------------------------------
  it('stage 7: analytics.rollup aggregates daily metrics', async () => {
    bossSendSpy.mockClear();

    const payload: AnalyticsRollupJobPayload = {
      runId: `analytics-${RUN_ID}`,
      day: TODAY,
      icpProfileId: ICP_ID,
      fullRecompute: false,
      correlationId: `corr-${RUN_ID}`,
    };

    await handleAnalyticsRollupJob(noopLogger, makeJob(payload, 'analytics.rollup'));

    // Verify rollup created
    const rollup = await prisma.analyticsDailyRollup.findFirst({
      where: { icpProfileId: ICP_ID },
    });
    expect(rollup).toBeTruthy();
    expect(rollup!.discoveredCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.enrichedCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.scoredCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.validEmailCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.validDomainCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Final verification: full DB state check
  // -----------------------------------------------------------------------
  it('final: all pipeline artifacts exist with correct relationships', async () => {
    // Lead should be in 'messaged' state
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('messaged');
    expect(lead.phone).toBe('+971501234567');

    // Discovery record
    const discovery = await prisma.leadDiscoveryRecord.findMany({ where: { leadId: LEAD_ID } });
    expect(discovery.length).toBeGreaterThanOrEqual(1);

    // Enrichment record
    const enrichment = await prisma.leadEnrichmentRecord.findMany({
      where: { leadId: LEAD_ID, status: 'COMPLETED' },
    });
    expect(enrichment.length).toBeGreaterThanOrEqual(1);

    // Feature snapshot
    const features = await prisma.leadFeatureSnapshot.findMany({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(features.length).toBeGreaterThanOrEqual(1);

    // Score prediction
    const scores = await prisma.leadScorePrediction.findMany({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(scores.length).toBeGreaterThanOrEqual(1);

    // Message draft + variants
    const drafts = await prisma.messageDraft.findMany({
      where: { leadId: LEAD_ID },
      include: { variants: true },
    });
    expect(drafts.length).toBeGreaterThanOrEqual(1);
    expect(drafts[0]!.variants.length).toBeGreaterThanOrEqual(2);

    // Message sends (email + whatsapp)
    const sends = await prisma.messageSend.findMany({
      where: { leadId: LEAD_ID, status: 'SENT' },
    });
    expect(sends.length).toBeGreaterThanOrEqual(2);
    const channels = sends.map((s) => s.channel);
    expect(channels).toContain('EMAIL');
    expect(channels).toContain('WHATSAPP');

    // Analytics rollup
    const rollup = await prisma.analyticsDailyRollup.findFirst({
      where: { icpProfileId: ICP_ID },
    });
    expect(rollup).toBeTruthy();
  });
});
