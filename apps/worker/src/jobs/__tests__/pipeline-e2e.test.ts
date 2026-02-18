/**
 * Full-lifecycle pipeline integration test
 *
 * Runs every pipeline stage in sequence against a real PostgreSQL database
 * with mocked external HTTP calls (PDL, OpenAI, Resend, Trengo, Slack).
 *
 * Pipeline under test:
 *   enrichment → features → scoring → message.generate → message.send (email)
 *   → 3× follow-up cycle (followup.check → message.generate → message.send WhatsApp)
 *   → reply classification → sales notification → analytics rollup
 */
import { randomUUID } from 'node:crypto';

import { type Prisma, prisma } from '@lead-flood/db';
import {
  PdlEnrichmentAdapter,
  OpenAiAdapter,
  ResendAdapter,
  TrengoAdapter,
} from '@lead-flood/providers';
import type { ReplyClassifyJobPayload } from '@lead-flood/contracts';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { handleEnrichmentRunJob, type EnrichmentRunJobPayload, type EnrichmentRunDependencies } from '../enrichment.run.job.js';
import { handleFeaturesComputeJob, type FeaturesComputeJobPayload, type FeaturesComputeDependencies } from '../features.compute.job.js';
import { handleScoringComputeJob, type ScoringComputeJobPayload, type ScoringComputeJobDependencies } from '../scoring.compute.job.js';
import { handleMessageGenerateJob, type MessageGenerateJobPayload, type MessageGenerateJobDependencies } from '../message.generate.job.js';
import { handleMessageSendJob, type MessageSendJobPayload, type MessageSendJobDependencies } from '../message.send.job.js';
import { handleFollowupCheckJob, type FollowupCheckJobPayload, type FollowupCheckJobDependencies } from '../followup.check.job.js';
import { handleReplyClassifyJob, type ReplyClassifyJobDependencies } from '../reply.classify.job.js';
import { handleNotifySalesJob, type NotifySalesJobDependencies } from '../notify.sales.job.js';
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

function makeOpenAiGenerateFetch(): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        model: 'gpt-4o',
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

function makeOpenAiClassifyFetch(classification: string, confidence: number): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: 'chatcmpl-classify',
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({ classification, confidence }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
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

function makeSlackFetch(): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response('ok', { status: 200 }),
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

function makeOpenAiGenerateAdapter(): OpenAiAdapter {
  return new OpenAiAdapter({
    apiKey: 'test-openai-key',
    fetchImpl: makeOpenAiGenerateFetch(),
  });
}

function makeOpenAiClassifyAdapter(classification: string, confidence: number): OpenAiAdapter {
  return new OpenAiAdapter({
    apiKey: 'test-openai-key',
    fetchImpl: makeOpenAiClassifyFetch(classification, confidence),
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
// Seed data IDs
// ---------------------------------------------------------------------------

const LEAD_EMAIL = `${TEST_PREFIX}@zbooni.test`;
const ICP_ID = randomUUID();
const LEAD_ID = randomUUID();
const DISCOVERY_RECORD_ID = randomUUID();
const RUN_ID = `pipeline-e2e-${randomUUID()}`;
const TODAY = new Date().toISOString().slice(0, 10);

// Feature list for ICP — used to verify feature rotation in follow-ups
const ICP_FEATURES = ['Payment Links', 'WhatsApp Commerce', 'Order Management', 'Custom Storefronts'];

// ---------------------------------------------------------------------------
// Helper: extract boss.send payload for a specific queue
// ---------------------------------------------------------------------------

function extractBossPayload<T>(queueName: string): T {
  const call = bossSendSpy.mock.calls.find(
    (c: unknown[]) => c[0] === queueName,
  );
  if (!call) {
    throw new Error(`No boss.send call found for queue '${queueName}'`);
  }
  return call[1] as T;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('pipeline full lifecycle', () => {
  beforeAll(async () => {
    // Seed IcpProfile with feature list
    await prisma.icpProfile.create({
      data: {
        id: ICP_ID,
        name: `${TEST_PREFIX} ICP`,
        qualificationLogic: 'WEIGHTED',
        targetIndustries: ['Financial Services', 'Technology'],
        targetCountries: ['AE', 'SA'],
        isActive: true,
        featureList: JSON.parse(JSON.stringify(ICP_FEATURES)) as Prisma.InputJsonValue,
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
    await prisma.feedbackEvent.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.messageSend.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.messageVariant.deleteMany({
      where: { messageDraft: { leadId: LEAD_ID } },
    });
    await prisma.messageDraft.deleteMany({
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
    await prisma.jobExecution.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.leadDiscoveryRecord.deleteMany({
      where: { leadId: LEAD_ID },
    });
    await prisma.lead.deleteMany({
      where: { id: LEAD_ID },
    });
    await prisma.modelVersion.deleteMany({
      where: { versionTag: 'deterministic-baseline-v1' },
    }).catch(() => { /* may already exist */ });
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

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('enriched');
    expect(lead.phone).toBe('+971501234567');

    const records = await prisma.leadEnrichmentRecord.findMany({ where: { leadId: LEAD_ID } });
    const completed = records.find((r) => r.status === 'COMPLETED');
    expect(completed).toBeTruthy();
    expect(completed!.provider).toBe('PEOPLE_DATA_LABS');
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
      enqueueScoring: false,
    };

    await handleFeaturesComputeJob(noopLogger, makeJob(payload, 'features.compute'), deps);

    const snapshot = await prisma.leadFeatureSnapshot.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(snapshot).toBeTruthy();
    expect(snapshot!.featuresJson).toBeTruthy();

    const features = snapshot!.featuresJson as Record<string, unknown>;
    expect(features.has_email).toBe(true);
    expect(features.has_company_name).toBe(true);
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

    const deps: ScoringComputeJobDependencies = {
      deterministicWeight: 1.0,
      aiWeight: 0.0,
    };

    await handleScoringComputeJob(noopLogger, makeJob(payload, 'scoring.compute'), deps);

    const prediction = await prisma.leadScorePrediction.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID },
    });
    expect(prediction).toBeTruthy();
    expect(prediction!.blendedScore).toBeGreaterThanOrEqual(0);
    expect(prediction!.blendedScore).toBeLessThanOrEqual(100);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(prediction!.scoreBand);
  });

  // -----------------------------------------------------------------------
  // Stage 4: Message generation (initial outreach)
  // -----------------------------------------------------------------------
  it('stage 4: message.generate creates initial draft + auto-approved variants', async () => {
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
      openAiAdapter: makeOpenAiGenerateAdapter(),
      boss: mockBoss,
    };

    await handleMessageGenerateJob(noopLogger, makeJob(payload, 'message.generate'), deps);

    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, icpProfileId: ICP_ID, followUpNumber: 0 },
      include: { variants: true },
    });
    expect(draft).toBeTruthy();
    expect(draft!.approvalStatus).toBe('AUTO_APPROVED');
    expect(draft!.variants.length).toBe(2);
    expect(draft!.pitchedFeature).toBe(ICP_FEATURES[0]); // 'Payment Links'

    // Auto-approve creates a QUEUED MessageSend + enqueues message.send
    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, messageDraftId: draft!.id },
    });
    expect(send).toBeTruthy();
    expect(send!.status).toBe('QUEUED');
    expect(send!.channel).toBe('EMAIL');

    const sendCall = bossSendSpy.mock.calls.find(
      (c: unknown[]) => c[0] === 'message.send',
    );
    expect(sendCall).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Stage 5: Email send (initial outreach, followUpNumber=0)
  // -----------------------------------------------------------------------
  it('stage 5: message.send delivers initial email via Resend', async () => {
    bossSendSpy.mockClear();

    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, channel: 'EMAIL', status: 'QUEUED' },
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

    const updated = await prisma.messageSend.findUniqueOrThrow({ where: { id: send!.id } });
    expect(updated.status).toBe('SENT');
    expect(updated.providerMessageId).toBeTruthy();
    expect(updated.sentAt).toBeTruthy();
    expect(updated.followUpNumber).toBe(0);
    // nextFollowUpAfter is set (~72h from now) since followUpNumber < 3
    expect(updated.nextFollowUpAfter).toBeTruthy();

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('messaged');
  });

  // -----------------------------------------------------------------------
  // Stage 6: Follow-up #1 — followup.check → message.generate → message.send
  // -----------------------------------------------------------------------
  it('stage 6a: followup.check finds initial send and enqueues follow-up #1', async () => {
    bossSendSpy.mockClear();

    // Move nextFollowUpAfter to the past to simulate 72h passing
    const initialSend = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 0, status: 'SENT' },
    });
    await prisma.messageSend.update({
      where: { id: initialSend!.id },
      data: { nextFollowUpAfter: new Date(Date.now() - 60_000) },
    });

    const payload: FollowupCheckJobPayload = {
      runId: `followup-check-1-${RUN_ID}`,
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: FollowupCheckJobDependencies = { boss: mockBoss };
    await handleFollowupCheckJob(noopLogger, makeJob(payload, 'followup.check'), deps);

    // followup.check should have enqueued message.generate with followUpNumber=1
    const generatePayload = extractBossPayload<MessageGenerateJobPayload>('message.generate');
    expect(generatePayload.leadId).toBe(LEAD_ID);
    expect(generatePayload.followUpNumber).toBe(1);
    expect(generatePayload.autoApprove).toBe(true);
    expect(generatePayload.channel).toBe('WHATSAPP');
    expect(generatePayload.parentMessageSendId).toBe(initialSend!.id);

    // Initial send's nextFollowUpAfter should be cleared
    const clearedSend = await prisma.messageSend.findUniqueOrThrow({ where: { id: initialSend!.id } });
    expect(clearedSend.nextFollowUpAfter).toBeNull();
  });

  it('stage 6b: message.generate creates follow-up #1 draft (feature rotation)', async () => {
    bossSendSpy.mockClear();

    // Use the payload that followup.check enqueued
    const initialSend = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 0, status: 'SENT' },
    });

    const payload: MessageGenerateJobPayload = {
      runId: `followup:${initialSend!.id}:1`,
      leadId: LEAD_ID,
      icpProfileId: ICP_ID,
      followUpNumber: 1,
      parentMessageSendId: initialSend!.id,
      previouslyPitchedFeatures: [ICP_FEATURES[0]!], // 'Payment Links' was pitched initially
      autoApprove: true,
      channel: 'WHATSAPP',
      knowledgeEntryIds: [],
      promptVersion: 'v1-followup',
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: MessageGenerateJobDependencies = {
      openAiAdapter: makeOpenAiGenerateAdapter(),
      boss: mockBoss,
    };

    await handleMessageGenerateJob(noopLogger, makeJob(payload, 'message.generate'), deps);

    // Verify follow-up draft created with feature rotation
    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 1 },
      include: { variants: true },
    });
    expect(draft).toBeTruthy();
    expect(draft!.approvalStatus).toBe('AUTO_APPROVED');
    // pitchedFeature should rotate — followUpNumber=1 picks from available features
    // Available = ['WhatsApp Commerce', 'Order Management', 'Custom Storefronts'] (minus 'Payment Links')
    // Index: 1 % 3 = 1 → 'Order Management'
    expect(draft!.pitchedFeature).toBe('Order Management');
    expect(draft!.parentMessageSendId).toBe(initialSend!.id);

    // Auto-approve created a QUEUED MessageSend for WhatsApp
    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, messageDraftId: draft!.id, status: 'QUEUED' },
    });
    expect(send).toBeTruthy();
    expect(send!.channel).toBe('WHATSAPP');
    expect(send!.followUpNumber).toBe(1);
  });

  it('stage 6c: message.send delivers follow-up #1 via WhatsApp (Trengo)', async () => {
    bossSendSpy.mockClear();

    const send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 1, status: 'QUEUED' },
    });
    expect(send).toBeTruthy();

    const payload: MessageSendJobPayload = {
      runId: `msgsend-fu1-${RUN_ID}`,
      sendId: send!.id,
      messageDraftId: send!.messageDraftId,
      messageVariantId: send!.messageVariantId,
      idempotencyKey: send!.idempotencyKey,
      channel: 'WHATSAPP',
      followUpNumber: 1,
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: MessageSendJobDependencies = {
      resendAdapter: makeResendAdapter(),
      trengoAdapter: makeTrengoAdapter(),
    };

    await handleMessageSendJob(noopLogger, makeJob(payload, 'message.send'), deps);

    const updated = await prisma.messageSend.findUniqueOrThrow({ where: { id: send!.id } });
    expect(updated.status).toBe('SENT');
    expect(updated.providerMessageId).toBeTruthy();
    expect(updated.providerConversationId).toBeTruthy();
    expect(updated.followUpNumber).toBe(1);
    expect(updated.nextFollowUpAfter).toBeTruthy(); // followUpNumber < 3 → scheduled
  });

  // -----------------------------------------------------------------------
  // Stage 7: Follow-up #2
  // -----------------------------------------------------------------------
  it('stage 7a: followup.check enqueues follow-up #2', async () => {
    bossSendSpy.mockClear();

    const fu1Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 1, status: 'SENT' },
    });
    await prisma.messageSend.update({
      where: { id: fu1Send!.id },
      data: { nextFollowUpAfter: new Date(Date.now() - 60_000) },
    });

    const deps: FollowupCheckJobDependencies = { boss: mockBoss };
    await handleFollowupCheckJob(
      noopLogger,
      makeJob<FollowupCheckJobPayload>({ runId: `followup-check-2-${RUN_ID}` }, 'followup.check'),
      deps,
    );

    const generatePayload = extractBossPayload<MessageGenerateJobPayload>('message.generate');
    expect(generatePayload.followUpNumber).toBe(2);
    expect(generatePayload.parentMessageSendId).toBe(fu1Send!.id);
  });

  it('stage 7b: message.generate + message.send for follow-up #2', async () => {
    bossSendSpy.mockClear();

    const fu1Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 1, status: 'SENT' },
    });

    // Generate
    const genPayload: MessageGenerateJobPayload = {
      runId: `followup:${fu1Send!.id}:2`,
      leadId: LEAD_ID,
      icpProfileId: ICP_ID,
      followUpNumber: 2,
      parentMessageSendId: fu1Send!.id,
      previouslyPitchedFeatures: [ICP_FEATURES[0]!, 'Order Management'],
      autoApprove: true,
      channel: 'WHATSAPP',
      knowledgeEntryIds: [],
      promptVersion: 'v1-followup',
      correlationId: `corr-${RUN_ID}`,
    };

    await handleMessageGenerateJob(
      noopLogger,
      makeJob(genPayload, 'message.generate'),
      { openAiAdapter: makeOpenAiGenerateAdapter(), boss: mockBoss },
    );

    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 2 },
    });
    expect(draft).toBeTruthy();
    // Available = ['WhatsApp Commerce', 'Custom Storefronts'] (minus 'Payment Links', 'Order Management')
    // Index: 2 % 2 = 0 → 'WhatsApp Commerce'
    expect(draft!.pitchedFeature).toBe('WhatsApp Commerce');

    // Send
    bossSendSpy.mockClear();
    const fu2Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 2, status: 'QUEUED' },
    });
    expect(fu2Send).toBeTruthy();

    await handleMessageSendJob(
      noopLogger,
      makeJob<MessageSendJobPayload>(
        {
          runId: `msgsend-fu2-${RUN_ID}`,
          sendId: fu2Send!.id,
          messageDraftId: fu2Send!.messageDraftId,
          messageVariantId: fu2Send!.messageVariantId,
          idempotencyKey: fu2Send!.idempotencyKey,
          channel: 'WHATSAPP',
          followUpNumber: 2,
          correlationId: `corr-${RUN_ID}`,
        },
        'message.send',
      ),
      { resendAdapter: makeResendAdapter(), trengoAdapter: makeTrengoAdapter() },
    );

    const updated = await prisma.messageSend.findUniqueOrThrow({ where: { id: fu2Send!.id } });
    expect(updated.status).toBe('SENT');
    expect(updated.followUpNumber).toBe(2);
    expect(updated.nextFollowUpAfter).toBeTruthy(); // still < 3
  });

  // -----------------------------------------------------------------------
  // Stage 8: Follow-up #3 (final — no more follow-ups after this)
  // -----------------------------------------------------------------------
  it('stage 8a: followup.check enqueues follow-up #3', async () => {
    bossSendSpy.mockClear();

    const fu2Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 2, status: 'SENT' },
    });
    await prisma.messageSend.update({
      where: { id: fu2Send!.id },
      data: { nextFollowUpAfter: new Date(Date.now() - 60_000) },
    });

    const deps: FollowupCheckJobDependencies = { boss: mockBoss };
    await handleFollowupCheckJob(
      noopLogger,
      makeJob<FollowupCheckJobPayload>({ runId: `followup-check-3-${RUN_ID}` }, 'followup.check'),
      deps,
    );

    const generatePayload = extractBossPayload<MessageGenerateJobPayload>('message.generate');
    expect(generatePayload.followUpNumber).toBe(3);
    expect(generatePayload.parentMessageSendId).toBe(fu2Send!.id);
  });

  it('stage 8b: message.generate + message.send for follow-up #3 (max reached)', async () => {
    bossSendSpy.mockClear();

    const fu2Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 2, status: 'SENT' },
    });

    // Generate
    const genPayload: MessageGenerateJobPayload = {
      runId: `followup:${fu2Send!.id}:3`,
      leadId: LEAD_ID,
      icpProfileId: ICP_ID,
      followUpNumber: 3,
      parentMessageSendId: fu2Send!.id,
      previouslyPitchedFeatures: [ICP_FEATURES[0]!, 'Order Management', 'WhatsApp Commerce'],
      autoApprove: true,
      channel: 'WHATSAPP',
      knowledgeEntryIds: [],
      promptVersion: 'v1-followup',
      correlationId: `corr-${RUN_ID}`,
    };

    await handleMessageGenerateJob(
      noopLogger,
      makeJob(genPayload, 'message.generate'),
      { openAiAdapter: makeOpenAiGenerateAdapter(), boss: mockBoss },
    );

    const draft = await prisma.messageDraft.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 3 },
    });
    expect(draft).toBeTruthy();
    // Available = ['Custom Storefronts'] only
    // Index: 3 % 1 = 0 → 'Custom Storefronts'
    expect(draft!.pitchedFeature).toBe('Custom Storefronts');

    // Send
    bossSendSpy.mockClear();
    const fu3Send = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, followUpNumber: 3, status: 'QUEUED' },
    });
    expect(fu3Send).toBeTruthy();

    await handleMessageSendJob(
      noopLogger,
      makeJob<MessageSendJobPayload>(
        {
          runId: `msgsend-fu3-${RUN_ID}`,
          sendId: fu3Send!.id,
          messageDraftId: fu3Send!.messageDraftId,
          messageVariantId: fu3Send!.messageVariantId,
          idempotencyKey: fu3Send!.idempotencyKey,
          channel: 'WHATSAPP',
          followUpNumber: 3,
          correlationId: `corr-${RUN_ID}`,
        },
        'message.send',
      ),
      { resendAdapter: makeResendAdapter(), trengoAdapter: makeTrengoAdapter() },
    );

    const updated = await prisma.messageSend.findUniqueOrThrow({ where: { id: fu3Send!.id } });
    expect(updated.status).toBe('SENT');
    expect(updated.followUpNumber).toBe(3);
    // Max follow-ups reached — nextFollowUpAfter should be null
    expect(updated.nextFollowUpAfter).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Stage 9: Reply classification — simulate lead replying "I'm interested"
  // -----------------------------------------------------------------------
  it('stage 9: reply.classify classifies an INTERESTED reply', async () => {
    bossSendSpy.mockClear();

    // Find the last WhatsApp send to simulate the reply against
    const lastWaSend = await prisma.messageSend.findFirst({
      where: { leadId: LEAD_ID, channel: 'WHATSAPP', status: 'SENT' },
      orderBy: { sentAt: 'desc' },
    });
    expect(lastWaSend).toBeTruthy();

    // Create FeedbackEvent (simulates what Trengo webhook handler does)
    const feedbackEvent = await prisma.feedbackEvent.create({
      data: {
        leadId: LEAD_ID,
        messageSendId: lastWaSend!.id,
        eventType: 'REPLIED',
        source: 'WEBHOOK',
        providerEventId: `trengo-reply-${randomUUID()}`,
        dedupeKey: `trengo:reply-e2e-${randomUUID()}`,
        replyText: 'Yes, I am very interested in learning more about your payment solutions!',
        occurredAt: new Date(),
      },
    });

    const payload: ReplyClassifyJobPayload = {
      runId: `reply-classify-${RUN_ID}`,
      feedbackEventId: feedbackEvent.id,
      replyText: 'Yes, I am very interested in learning more about your payment solutions!',
      leadId: LEAD_ID,
      messageSendId: lastWaSend!.id,
      correlationId: `corr-${RUN_ID}`,
    };

    const deps: ReplyClassifyJobDependencies = {
      openAiAdapter: makeOpenAiClassifyAdapter('INTERESTED', 0.95),
      boss: mockBoss,
      notifySalesJobName: 'notify.sales',
      notifySalesRetryOptions: {
        retryLimit: 2,
        retryDelay: 30,
        retryBackoff: true,
        deadLetter: 'notify.sales.dead_letter',
      },
    };

    await handleReplyClassifyJob(noopLogger, makeJob(payload, 'reply.classify'), deps);

    // Lead should be 'replied'
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('replied');

    // FeedbackEvent should have classification
    const updatedEvent = await prisma.feedbackEvent.findUniqueOrThrow({ where: { id: feedbackEvent.id } });
    expect(updatedEvent.replyClassification).toBe('INTERESTED');

    // All follow-up schedules should be cancelled
    const activeSends = await prisma.messageSend.findMany({
      where: { leadId: LEAD_ID, nextFollowUpAfter: { not: null } },
    });
    expect(activeSends.length).toBe(0);

    // notify.sales should be enqueued
    const notifyCall = bossSendSpy.mock.calls.find(
      (c: unknown[]) => c[0] === 'notify.sales',
    );
    expect(notifyCall).toBeTruthy();
    expect(notifyCall![1]).toMatchObject({
      leadId: LEAD_ID,
      feedbackEventId: feedbackEvent.id,
      classification: 'INTERESTED',
    });
  });

  // -----------------------------------------------------------------------
  // Stage 10: Sales notification (Slack)
  // -----------------------------------------------------------------------
  it('stage 10: notify.sales sends Slack notification', async () => {
    const feedbackEvent = await prisma.feedbackEvent.findFirst({
      where: { leadId: LEAD_ID, eventType: 'REPLIED' },
    });
    expect(feedbackEvent).toBeTruthy();

    const slackFetch = makeSlackFetch();
    const deps: NotifySalesJobDependencies = {
      slackWebhookUrl: 'https://hooks.slack.com/test/e2e',
      fetchImpl: slackFetch,
    };

    await handleNotifySalesJob(
      noopLogger,
      makeJob(
        {
          runId: `notify-sales-${RUN_ID}`,
          leadId: LEAD_ID,
          feedbackEventId: feedbackEvent!.id,
          classification: 'INTERESTED' as const,
          correlationId: `corr-${RUN_ID}`,
        },
        'notify.sales',
      ),
      deps,
    );

    // Verify Slack was called
    expect(slackFetch).toHaveBeenCalledTimes(1);
    const slackCall = (slackFetch as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(slackCall[0]).toBe('https://hooks.slack.com/test/e2e');

    const slackBody = JSON.parse((slackCall[1] as { body: string }).body) as { text: string };
    expect(slackBody.text).toContain('Pipeline Tester');
    expect(slackBody.text).toContain('interested');
  });

  // -----------------------------------------------------------------------
  // Stage 11: Analytics rollup
  // -----------------------------------------------------------------------
  it('stage 11: analytics.rollup aggregates daily metrics', async () => {
    const payload: AnalyticsRollupJobPayload = {
      runId: `analytics-${RUN_ID}`,
      day: TODAY,
      icpProfileId: ICP_ID,
      fullRecompute: false,
      correlationId: `corr-${RUN_ID}`,
    };

    await handleAnalyticsRollupJob(noopLogger, makeJob(payload, 'analytics.rollup'));

    const rollup = await prisma.analyticsDailyRollup.findFirst({
      where: { icpProfileId: ICP_ID },
    });
    expect(rollup).toBeTruthy();
    expect(rollup!.discoveredCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.enrichedCount).toBeGreaterThanOrEqual(1);
    expect(rollup!.scoredCount).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Final: complete lifecycle verification
  // -----------------------------------------------------------------------
  it('final: all pipeline artifacts exist across the full lifecycle', async () => {
    // Lead should be in 'replied' state (after interested reply)
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: LEAD_ID } });
    expect(lead.status).toBe('replied');
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

    // 4 message drafts: initial + 3 follow-ups
    const drafts = await prisma.messageDraft.findMany({
      where: { leadId: LEAD_ID },
      orderBy: { followUpNumber: 'asc' },
    });
    expect(drafts.length).toBe(4);
    expect(drafts.map((d) => d.followUpNumber)).toEqual([0, 1, 2, 3]);

    // Verify feature rotation across all drafts
    const pitchedFeatures = drafts.map((d) => d.pitchedFeature);
    expect(pitchedFeatures[0]).toBe('Payment Links');
    expect(pitchedFeatures[1]).toBe('Order Management');
    expect(pitchedFeatures[2]).toBe('WhatsApp Commerce');
    expect(pitchedFeatures[3]).toBe('Custom Storefronts');
    // All 4 ICP features were pitched across the lifecycle

    // 4 message sends: 1 email + 3 WhatsApp
    const sends = await prisma.messageSend.findMany({
      where: { leadId: LEAD_ID, status: 'SENT' },
      orderBy: { followUpNumber: 'asc' },
    });
    expect(sends.length).toBe(4);
    expect(sends[0]!.channel).toBe('EMAIL');
    expect(sends[0]!.followUpNumber).toBe(0);
    expect(sends[1]!.channel).toBe('WHATSAPP');
    expect(sends[1]!.followUpNumber).toBe(1);
    expect(sends[2]!.channel).toBe('WHATSAPP');
    expect(sends[2]!.followUpNumber).toBe(2);
    expect(sends[3]!.channel).toBe('WHATSAPP');
    expect(sends[3]!.followUpNumber).toBe(3);

    // No pending follow-ups
    const pendingFollowups = await prisma.messageSend.findMany({
      where: { leadId: LEAD_ID, nextFollowUpAfter: { not: null } },
    });
    expect(pendingFollowups.length).toBe(0);

    // Feedback event with classification
    const feedback = await prisma.feedbackEvent.findMany({
      where: { leadId: LEAD_ID },
    });
    expect(feedback.length).toBe(1);
    expect(feedback[0]!.eventType).toBe('REPLIED');
    expect(feedback[0]!.replyClassification).toBe('INTERESTED');

    // Analytics rollup
    const rollup = await prisma.analyticsDailyRollup.findFirst({
      where: { icpProfileId: ICP_ID },
    });
    expect(rollup).toBeTruthy();
  });
});
