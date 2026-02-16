import type PgBoss from 'pg-boss';
import { prisma } from '@lead-flood/db';
import {
  ApolloDiscoveryAdapter,
  ClearbitAdapter,
  CompanySearchAdapter,
  GoogleSearchAdapter,
  HunterAdapter,
  LinkedInScrapeAdapter,
  PdlEnrichmentAdapter,
  PublicWebLookupAdapter,
} from '@lead-flood/providers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  handleDiscoveryRunJob,
  type DiscoveryRunJobPayload,
} from '../../src/jobs/discovery.run.job.js';
import {
  handleEnrichmentRunJob,
  type EnrichmentRunJobPayload,
} from '../../src/jobs/enrichment.run.job.js';
import {
  FEATURE_EXTRACTOR_VERSION,
  handleFeaturesComputeJob,
  type FeaturesComputeJobPayload,
} from '../../src/jobs/features.compute.job.js';

describe('pipeline domain persistence integration', () => {
  const createdLeadIds: string[] = [];
  const createdIcpIds: string[] = [];

  afterEach(async () => {
    if (createdLeadIds.length > 0) {
      const leadIds = createdLeadIds.splice(0, createdLeadIds.length);
      await prisma.jobExecution.deleteMany({
        where: {
          leadId: {
            in: leadIds,
          },
        },
      });

      await prisma.lead.deleteMany({
        where: {
          id: {
            in: leadIds,
          },
        },
      });
    }

    if (createdIcpIds.length > 0) {
      const icpIds = createdIcpIds.splice(0, createdIcpIds.length);
      await prisma.qualificationRule.deleteMany({
        where: {
          icpProfileId: {
            in: icpIds,
          },
        },
      });

      await prisma.icpProfile.deleteMany({
        where: {
          id: {
            in: icpIds,
          },
        },
      });
    }
  });

  it('writes discovery, enrichment, and feature snapshots to domain tables', async () => {
    const icp = await prisma.icpProfile.create({
      data: {
        name: `ICP ${Date.now()}`,
        isActive: true,
        targetIndustries: ['Retail'],
        targetCountries: ['AE'],
      },
    });
    createdIcpIds.push(icp.id);

    await prisma.qualificationRule.createMany({
      data: [
        {
          icpProfileId: icp.id,
          name: 'Industry must match',
          ruleType: 'HARD_FILTER',
          fieldKey: 'industry_match',
          operator: 'EQ',
          valueJson: true,
          priority: 1,
        },
        {
          icpProfileId: icp.id,
          name: 'Has company name',
          ruleType: 'WEIGHTED',
          fieldKey: 'has_company_name',
          operator: 'EQ',
          valueJson: true,
          weight: 1,
          priority: 2,
        },
      ],
    });

    const enrichmentSends: Array<{ queueName: string; payload: unknown }> = [];
    const discoveryBoss = {
      send: vi.fn(async (queueName: string, payload: unknown) => {
        enrichmentSends.push({ queueName, payload });
        return null;
      }),
    };

    const discoveryLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const googleSearchAdapter = new GoogleSearchAdapter({
      apiKey: 'test-key',
      searchEngineId: 'test-engine',
      minRequestIntervalMs: 0,
      fetchImpl: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            items: [
              {
                cacheId: 'google-cache-1',
                title: 'Acme Retail',
                link: 'https://acme.test/about',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as unknown as typeof fetch,
    });

    const discoveryPayload: DiscoveryRunJobPayload = {
      runId: `run-discovery-${Date.now()}`,
      icpProfileId: icp.id,
      provider: 'GOOGLE_SEARCH',
      limit: 1,
      correlationId: 'corr-discovery',
      requestedByUserId: 'system',
    };

    await handleDiscoveryRunJob(
      discoveryLogger,
      {
        id: 'job-discovery-1',
        name: 'discovery.run',
        data: discoveryPayload,
      } as unknown as import('pg-boss').Job<DiscoveryRunJobPayload>,
      {
        boss: discoveryBoss as unknown as Pick<PgBoss, 'send'>,
        apolloAdapter: new ApolloDiscoveryAdapter({
          apiKey: 'apollo',
          minRequestIntervalMs: 0,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        googleSearchAdapter,
        linkedInScrapeAdapter: new LinkedInScrapeAdapter({
          enabled: false,
          scrapeEndpoint: undefined,
          apiKey: undefined,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        companySearchAdapter: new CompanySearchAdapter({
          enabled: false,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        discoveryEnabled: true,
        apolloEnabled: false,
        googleSearchEnabled: true,
        linkedInScrapeEnabled: false,
        companySearchEnabled: false,
        defaultProvider: 'GOOGLE_SEARCH',
        defaultEnrichmentProvider: 'HUNTER',
      },
    );

    const lead = await prisma.lead.findFirst({
      where: {
        email: 'info@acme.test',
      },
    });
    expect(lead).not.toBeNull();
    if (!lead) {
      throw new Error('Expected lead to be created');
    }
    createdLeadIds.push(lead.id);

    const discoveryRecord = await prisma.leadDiscoveryRecord.findFirst({
      where: {
        leadId: lead.id,
        icpProfileId: icp.id,
      },
    });
    expect(discoveryRecord).not.toBeNull();
    expect(discoveryRecord?.provider).toBe('GOOGLE_SEARCH');

    const enrichmentRequest = enrichmentSends.find((send) => send.queueName === 'enrichment.run');
    expect(enrichmentRequest).toBeDefined();

    const featureSends: Array<{ queueName: string; payload: unknown }> = [];
    const enrichmentBoss = {
      send: vi.fn(async (queueName: string, payload: unknown) => {
        featureSends.push({ queueName, payload });
        return null;
      }),
    };

    await handleEnrichmentRunJob(
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      {
        id: 'job-enrichment-1',
        name: 'enrichment.run',
        data: enrichmentRequest?.payload as EnrichmentRunJobPayload,
      } as unknown as import('pg-boss').Job<EnrichmentRunJobPayload>,
      {
        boss: enrichmentBoss as unknown as Pick<PgBoss, 'send'>,
        pdlAdapter: new PdlEnrichmentAdapter({
          apiKey: 'unused',
          minRequestIntervalMs: 0,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        hunterAdapter: new HunterAdapter({
          apiKey: 'hunter-key',
          minRequestIntervalMs: 0,
          fetchImpl: vi.fn(async () => {
            return new Response(
              JSON.stringify({
                data: {
                  email: 'info@acme.test',
                  first_name: 'Info',
                  last_name: 'Acme',
                  organization: 'Acme Retail',
                  industry: 'Retail',
                  country: 'AE',
                },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }) as unknown as typeof fetch,
        }),
        clearbitAdapter: new ClearbitAdapter({
          apiKey: undefined,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        publicWebLookupAdapter: new PublicWebLookupAdapter({
          enabled: false,
          fetchImpl: vi.fn() as unknown as typeof fetch,
        }),
        enrichmentEnabled: true,
        pdlEnabled: false,
        hunterEnabled: true,
        clearbitEnabled: false,
        otherFreeEnabled: false,
        defaultProvider: 'HUNTER',
      },
    );

    const enrichmentRecord = await prisma.leadEnrichmentRecord.findFirst({
      where: {
        leadId: lead.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(enrichmentRecord).not.toBeNull();
    expect(enrichmentRecord?.status).toBe('COMPLETED');
    const normalizedEnrichment =
      enrichmentRecord?.normalizedPayload && typeof enrichmentRecord.normalizedPayload === 'object'
        ? (enrichmentRecord.normalizedPayload as Record<string, unknown>)
        : null;
    expect(normalizedEnrichment?.domain).toBe('acme.test');
    expect(normalizedEnrichment?.companyName).toBe('Acme Retail');
    expect(normalizedEnrichment?.industry).toBe('Retail');
    expect(normalizedEnrichment?.country).toBe('AE');

    const featureRequest = featureSends.find((send) => send.queueName === 'features.compute');
    expect(featureRequest).toBeDefined();

    await handleFeaturesComputeJob(
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      {
        id: 'job-features-1',
        name: 'features.compute',
        data: featureRequest?.payload as FeaturesComputeJobPayload,
      } as unknown as import('pg-boss').Job<FeaturesComputeJobPayload>,
      {
        boss: {
          send: vi.fn(async () => null),
        },
        enqueueScoring: false,
      },
    );

    const snapshot = await prisma.leadFeatureSnapshot.findFirst({
      where: {
        leadId: lead.id,
        icpProfileId: icp.id,
        sourceVersion: FEATURE_EXTRACTOR_VERSION,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.featureVectorHash.length).toBeGreaterThan(10);
  });
});
