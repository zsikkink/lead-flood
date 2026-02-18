import { prisma } from '@lead-flood/db';
import { createLogger } from '@lead-flood/observability';
import { afterEach, describe, expect, it } from 'vitest';

import type { ApiEnv } from '../../src/env.js';
import { buildServer } from '../../src/server.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/lead_flood';
process.env.DATABASE_URL = databaseUrl;
const directUrl = process.env.DIRECT_URL ?? databaseUrl;
process.env.DIRECT_URL = directUrl;

const env: ApiEnv = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  API_PORT: 5050,
  CORS_ORIGIN: 'http://localhost:3000',
  LOG_LEVEL: 'error',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret-test-refresh-secret',
  PG_BOSS_SCHEMA: 'pgboss',
  DATABASE_URL: databaseUrl,
  DIRECT_URL: directUrl,
  APOLLO_API_KEY: 'apollo-test-key',
  PDL_API_KEY: 'pdl-test-key',
  DISCOVERY_ENABLED: true,
  ENRICHMENT_ENABLED: true,
};

function toDayStart(value: string): Date {
  const source = new Date(value);
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

describe('inspection endpoints integration', () => {
  const createdLeadIds: string[] = [];
  const createdIcpIds: string[] = [];
  const createdTrainingRunIds: string[] = [];
  const createdModelVersionIds: string[] = [];

  afterEach(async () => {
    if (createdLeadIds.length > 0) {
      const leadIds = createdLeadIds.splice(0, createdLeadIds.length);
      await prisma.jobExecution.deleteMany({ where: { leadId: { in: leadIds } } });
      await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    if (createdModelVersionIds.length > 0) {
      await prisma.modelVersion.deleteMany({ where: { id: { in: createdModelVersionIds.splice(0) } } });
    }

    if (createdTrainingRunIds.length > 0) {
      await prisma.trainingRun.deleteMany({ where: { id: { in: createdTrainingRunIds.splice(0) } } });
    }

    if (createdIcpIds.length > 0) {
      const icpIds = createdIcpIds.splice(0, createdIcpIds.length);
      await prisma.analyticsDailyRollup.deleteMany({ where: { icpProfileId: { in: icpIds } } });
      await prisma.qualificationRule.deleteMany({ where: { icpProfileId: { in: icpIds } } });
      await prisma.icpProfile.deleteMany({ where: { id: { in: icpIds } } });
    }
  });

  it('returns discovery, enrichment, leads, and debug inspection data', async () => {
    const icp = await prisma.icpProfile.create({
      data: {
        name: `Inspection ICP ${Date.now()}`,
        isActive: true,
        targetIndustries: ['retail'],
        targetCountries: ['ae'],
        requiredTechnologies: ['shopify'],
      },
    });
    createdIcpIds.push(icp.id);

    const rule = await prisma.qualificationRule.create({
      data: {
        icpProfileId: icp.id,
        name: 'Industry must match',
        ruleType: 'HARD_FILTER',
        fieldKey: 'industry_match',
        operator: 'EQ',
        valueJson: true,
        priority: 1,
      },
    });

    const lead = await prisma.lead.create({
      data: {
        firstName: 'Inspection',
        lastName: 'Lead',
        email: `inspection-${Date.now()}@acme.test`,
        source: 'inspection',
        status: 'enriched',
      },
    });
    createdLeadIds.push(lead.id);

    const discoveryRecord = await prisma.leadDiscoveryRecord.create({
      data: {
        leadId: lead.id,
        icpProfileId: icp.id,
        provider: 'GOOGLE_SEARCH',
        providerRecordId: `provider-${Date.now()}`,
        queryHash: 'hash-1',
        status: 'DISCOVERED',
        rawPayload: {
          source: 'integration-test',
          company: 'Acme',
        },
      },
    });

    const enrichmentRecord = await prisma.leadEnrichmentRecord.create({
      data: {
        leadId: lead.id,
        provider: 'HUNTER',
        status: 'COMPLETED',
        attempt: 1,
        providerRecordId: lead.email,
        normalizedPayload: {
          email: lead.email,
          domain: 'acme.test',
          companyName: 'Acme',
          industry: 'retail',
          employeeCount: 150,
          country: 'ae',
          city: 'dubai',
          linkedinUrl: 'https://linkedin.com/company/acme',
          website: 'https://acme.test',
        },
        rawPayload: {
          source: 'hunter',
        },
        enrichedAt: new Date(),
        requestKey: `inspection:${lead.id}:hunter`,
      },
    });

    const featureSnapshot = await prisma.leadFeatureSnapshot.create({
      data: {
        leadId: lead.id,
        icpProfileId: icp.id,
        discoveryRecordId: discoveryRecord.id,
        enrichmentRecordId: enrichmentRecord.id,
        snapshotVersion: 1,
        sourceVersion: 'features_v1',
        featureVectorHash: `hash-${Date.now()}`,
        featuresJson: {
          industry_match: true,
          geo_match: true,
        },
        ruleMatchCount: 1,
        hardFilterPassed: true,
      },
    });

    const trainingRun = await prisma.trainingRun.create({
      data: {
        modelType: 'LOGISTIC_REGRESSION',
        status: 'SUCCEEDED',
        trigger: 'MANUAL',
        configJson: { test: true },
        trainingWindowStart: new Date(Date.now() - 86_400_000),
        trainingWindowEnd: new Date(),
        startedAt: new Date(),
        endedAt: new Date(),
      },
    });
    createdTrainingRunIds.push(trainingRun.id);

    const modelVersion = await prisma.modelVersion.create({
      data: {
        trainingRunId: trainingRun.id,
        modelType: 'LOGISTIC_REGRESSION',
        versionTag: `inspection-model-${Date.now()}`,
        stage: 'ACTIVE',
        featureSchemaJson: { sourceVersion: 'features_v1' },
        deterministicWeightsJson: {},
        checksum: `checksum-${Date.now()}`,
      },
    });
    createdModelVersionIds.push(modelVersion.id);

    await prisma.leadScorePrediction.create({
      data: {
        leadId: lead.id,
        icpProfileId: icp.id,
        featureSnapshotId: featureSnapshot.id,
        modelVersionId: modelVersion.id,
        deterministicScore: 0.9,
        logisticScore: 0.1,
        blendedScore: 0.9,
        scoreBand: 'HIGH',
        reasonsJson: { reasonCodes: ['HIGH_WEIGHTED_MATCH'] },
      },
    });

    const day = toDayStart(new Date().toISOString());
    await prisma.analyticsDailyRollup.create({
      data: {
        day,
        icpProfileId: icp.id,
        discoveredCount: 1,
        enrichedCount: 1,
        scoredCount: 1,
        validEmailCount: 1,
        validDomainCount: 1,
        industryMatchRate: 1,
        geoMatchRate: 1,
      },
    });

    const server = buildServer({
      env,
      logger: createLogger({ service: 'api-test', env: 'test', level: 'error' }),
      checkDatabaseHealth: async () => true,
      authenticateUser: async () => null,
      createLeadAndEnqueue: async () => ({ leadId: 'lead_1', jobId: 'job_1' }),
      getLeadById: async () => null,
      listLeads: async (query) => {
        const where = {
          ...(query.icpProfileId
            ? {
                discoveryRecords: {
                  some: {
                    icpProfileId: query.icpProfileId,
                  },
                },
              }
            : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.scoreBand
            ? {
                scorePredictions: {
                  some: {
                    ...(query.icpProfileId ? { icpProfileId: query.icpProfileId } : {}),
                    scoreBand: query.scoreBand,
                  },
                },
              }
            : {}),
        };

        const [total, rows] = await Promise.all([
          prisma.lead.count({ where }),
          prisma.lead.findMany({
            where,
            include: {
              discoveryRecords: {
                orderBy: [{ discoveredAt: 'desc' }],
                take: 1,
              },
              enrichmentRecords: {
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
              },
              scorePredictions: {
                orderBy: [{ predictedAt: 'desc' }],
                take: 1,
              },
            },
          }),
        ]);

        return {
          items: rows.map((row) => ({
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            source: row.source,
            status: row.status,
            error: row.error,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
            latestIcpProfileId: row.discoveryRecords[0]?.icpProfileId ?? null,
            latestScoreBand: row.scorePredictions[0]?.scoreBand ?? null,
            latestBlendedScore: row.scorePredictions[0]?.blendedScore ?? null,
            latestDiscoveryRawPayload: row.discoveryRecords[0]?.rawPayload ?? null,
            latestEnrichmentNormalizedPayload: row.enrichmentRecords[0]?.normalizedPayload ?? null,
            latestEnrichmentRawPayload: row.enrichmentRecords[0]?.rawPayload ?? null,
          })),
          qualityMetrics: {
            validEmailCount: 1,
            validDomainCount: 1,
            industryMatchRate: 1,
            geoMatchRate: 1,
          },
          page: query.page,
          pageSize: query.pageSize,
          total,
        };
      },
      getJobById: async () => null,
    });

    const discoveryResponse = await server.inject({
      method: 'GET',
      url: `/v1/discovery/records?icpProfileId=${icp.id}&includeQualityMetrics=true`,
    });
    expect(discoveryResponse.statusCode).toBe(200);
    const discoveryBody = discoveryResponse.json() as {
      items: Array<{ id: string }>;
      qualityMetrics?: { validEmailCount: number };
    };
    expect(discoveryBody.items).toHaveLength(1);
    expect(discoveryBody.qualityMetrics?.validEmailCount).toBe(1);

    const enrichmentResponse = await server.inject({
      method: 'GET',
      url: `/v1/enrichment/records?leadId=${lead.id}&includeQualityMetrics=true`,
    });
    expect(enrichmentResponse.statusCode).toBe(200);
    const enrichmentBody = enrichmentResponse.json() as {
      items: Array<{ normalizedPayload: { domain: string } }>;
    };
    expect(enrichmentBody.items[0]?.normalizedPayload.domain).toBe('acme.test');

    const leadsResponse = await server.inject({
      method: 'GET',
      url: `/v1/leads?icpProfileId=${icp.id}&scoreBand=HIGH&includeQualityMetrics=true`,
    });
    expect(leadsResponse.statusCode).toBe(200);
    const leadsBody = leadsResponse.json() as { items: Array<{ id: string }> };
    expect(leadsBody.items[0]?.id).toBe(lead.id);

    const debugResponse = await server.inject({
      method: 'GET',
      url: `/v1/icp/${icp.id}/debug-sample?limit=5`,
    });
    expect(debugResponse.statusCode).toBe(200);
    const debugBody = debugResponse.json() as {
      providerQueries: Array<{ provider: string }>;
      samples: Array<{ discoveryRecordId: string; ruleEvaluations: Array<{ ruleId: string }> }>;
    };
    expect(debugBody.providerQueries).toHaveLength(6);
    expect(debugBody.providerQueries.map((entry) => entry.provider)).toContain('BRAVE_SEARCH');
    expect(debugBody.providerQueries.map((entry) => entry.provider)).toContain('GOOGLE_PLACES');
    expect(debugBody.samples[0]?.discoveryRecordId).toBe(discoveryRecord.id);
    expect(debugBody.samples[0]?.ruleEvaluations[0]?.ruleId).toBe(rule.id);

    await server.close();
  });
});
