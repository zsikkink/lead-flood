import type {
  AdminLeadDetailResponse,
  AdminLeadRow,
  AdminListLeadsQuery,
  AdminListLeadsResponse,
  AdminListSearchTasksQuery,
  AdminListSearchTasksResponse,
  AdminSearchTaskDetailResponse,
  JobRunDetailResponse,
  JobRunListQuery,
  ListJobRunsResponse,
} from '@lead-flood/contracts';
import { prisma, type Prisma } from '@lead-flood/db';

import { DiscoveryAdminNotFoundError } from './discovery-admin.errors.js';

const SCORE_WEIGHTS = {
  hasWhatsapp: 0.2,
  hasInstagram: 0.1,
  acceptsOnlinePayments: 0.15,
  reviewCount: 0.2,
  followerCount: 0.1,
  physicalAddressPresent: 0.1,
  recentActivity: 0.15,
} as const;

type BusinessScoreTier = 'LOW' | 'MEDIUM' | 'HIGH';

function toTier(score: number): BusinessScoreTier {
  if (score >= 0.67) {
    return 'HIGH';
  }
  if (score >= 0.34) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function computeBusinessScore(row: {
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  acceptsOnlinePayments: boolean;
  reviewCount: number | null;
  followerCount: number | null;
  physicalAddressPresent: boolean;
  recentActivity: boolean;
}) {
  const reviewCount = row.reviewCount ?? 0;
  const followerCount = row.followerCount ?? 0;

  const contributions = [
    {
      code: 'HAS_WHATSAPP',
      label: 'Has WhatsApp',
      value: row.hasWhatsapp,
      weight: SCORE_WEIGHTS.hasWhatsapp,
      contribution: row.hasWhatsapp ? SCORE_WEIGHTS.hasWhatsapp : 0,
    },
    {
      code: 'HAS_INSTAGRAM',
      label: 'Has Instagram',
      value: row.hasInstagram,
      weight: SCORE_WEIGHTS.hasInstagram,
      contribution: row.hasInstagram ? SCORE_WEIGHTS.hasInstagram : 0,
    },
    {
      code: 'ACCEPTS_ONLINE_PAYMENTS',
      label: 'Accepts Online Payments',
      value: row.acceptsOnlinePayments,
      weight: SCORE_WEIGHTS.acceptsOnlinePayments,
      contribution: row.acceptsOnlinePayments ? SCORE_WEIGHTS.acceptsOnlinePayments : 0,
    },
    {
      code: 'REVIEW_COUNT',
      label: 'Review Count',
      value: reviewCount,
      weight: SCORE_WEIGHTS.reviewCount,
      contribution: Math.min(reviewCount / 200, 1) * SCORE_WEIGHTS.reviewCount,
    },
    {
      code: 'FOLLOWER_COUNT',
      label: 'Follower Count',
      value: followerCount,
      weight: SCORE_WEIGHTS.followerCount,
      contribution: Math.min(followerCount / 5000, 1) * SCORE_WEIGHTS.followerCount,
    },
    {
      code: 'PHYSICAL_ADDRESS_PRESENT',
      label: 'Physical Address Present',
      value: row.physicalAddressPresent,
      weight: SCORE_WEIGHTS.physicalAddressPresent,
      contribution: row.physicalAddressPresent ? SCORE_WEIGHTS.physicalAddressPresent : 0,
    },
    {
      code: 'RECENT_ACTIVITY',
      label: 'Recent Activity',
      value: row.recentActivity,
      weight: SCORE_WEIGHTS.recentActivity,
      contribution: row.recentActivity ? SCORE_WEIGHTS.recentActivity : 0,
    },
  ].map((entry) => ({
    ...entry,
    contribution: round(entry.contribution),
  }));

  const total = round(contributions.reduce((sum, entry) => sum + entry.contribution, 0));
  return {
    total,
    tier: toTier(total),
    contributions,
  };
}

function toLeadRow(row: {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
  category: string | null;
  deterministicScore: number;
  scoreBand: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  hasWhatsapp: boolean;
  hasInstagram: boolean;
  acceptsOnlinePayments: boolean;
  reviewCount: number | null;
  followerCount: number | null;
  physicalAddressPresent: boolean;
  recentActivity: boolean;
  websiteDomain: string | null;
  phoneE164: string | null;
  instagramHandle: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminLeadRow {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.countryCode,
    city: row.city,
    category: row.category,
    score: row.deterministicScore,
    scoreTier: row.scoreBand ?? toTier(row.deterministicScore),
    hasWhatsapp: row.hasWhatsapp,
    hasInstagram: row.hasInstagram,
    acceptsOnlinePayments: row.acceptsOnlinePayments,
    reviewCount: row.reviewCount,
    followerCount: row.followerCount,
    physicalAddressPresent: row.physicalAddressPresent,
    recentActivity: row.recentActivity,
    websiteDomain: row.websiteDomain,
    phoneE164: row.phoneE164,
    instagramHandle: row.instagramHandle,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildLeadWhere(query: AdminListLeadsQuery): Prisma.BusinessWhereInput {
  const and: Prisma.BusinessWhereInput[] = [];

  if (query.scoreMin !== undefined || query.scoreMax !== undefined) {
    and.push({
      deterministicScore: {
        ...(query.scoreMin !== undefined ? { gte: query.scoreMin } : {}),
        ...(query.scoreMax !== undefined ? { lte: query.scoreMax } : {}),
      },
    });
  }

  if (query.countries && query.countries.length > 0) {
    and.push({
      countryCode: {
        in: query.countries.map((value) => value.toUpperCase()),
      },
    });
  }

  if (query.city) {
    and.push({
      city: {
        contains: query.city,
        mode: 'insensitive',
      },
    });
  }

  if (query.industries && query.industries.length > 0) {
    and.push({
      OR: query.industries.map((category) => ({
        category: {
          equals: category,
          mode: 'insensitive',
        },
      })),
    });
  }

  if (query.hasWhatsapp !== undefined) {
    and.push({ hasWhatsapp: query.hasWhatsapp });
  }

  if (query.hasInstagram !== undefined) {
    and.push({ hasInstagram: query.hasInstagram });
  }

  if (query.acceptsOnlinePayments !== undefined) {
    and.push({ acceptsOnlinePayments: query.acceptsOnlinePayments });
  }

  if (query.recentlyActive !== undefined) {
    and.push({ recentActivity: query.recentlyActive });
  }

  if (query.minReviewCount !== undefined) {
    and.push({
      reviewCount: {
        gte: query.minReviewCount,
      },
    });
  }

  if (query.minFollowerCount !== undefined) {
    and.push({
      followerCount: {
        gte: query.minFollowerCount,
      },
    });
  }

  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function buildLeadOrderBy(
  sortBy: AdminListLeadsQuery['sortBy'],
): Prisma.BusinessOrderByWithRelationInput[] {
  if (sortBy === 'recent') {
    return [{ updatedAt: 'desc' }, { id: 'desc' }];
  }
  if (sortBy === 'review_count') {
    return [{ reviewCount: 'desc' }, { deterministicScore: 'desc' }, { id: 'desc' }];
  }
  return [{ deterministicScore: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }];
}

function buildTaskOrderBy(
  sortBy: AdminListSearchTasksQuery['sortBy'],
): Prisma.SearchTaskOrderByWithRelationInput[] {
  if (sortBy === 'run_after_asc') {
    return [{ runAfter: 'asc' }, { updatedAt: 'desc' }, { id: 'asc' }];
  }
  if (sortBy === 'attempts_desc') {
    return [{ attempts: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }];
  }
  return [{ updatedAt: 'desc' }, { id: 'asc' }];
}

function readDerivedTaskParams(paramsJson: unknown): {
  engine: string | null;
  q: string | null;
  location: string | null;
  gl: string | null;
  hl: string | null;
  z: string | number | null;
  m: string | number | null;
  start: string | number | null;
} {
  if (!paramsJson || typeof paramsJson !== 'object' || Array.isArray(paramsJson)) {
    return {
      engine: null,
      q: null,
      location: null,
      gl: null,
      hl: null,
      z: null,
      m: null,
      start: null,
    };
  }

  const payload = paramsJson as Record<string, unknown>;
  const readString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;
  const readNumberish = (value: unknown): string | number | null =>
    typeof value === 'string' || typeof value === 'number' ? value : null;

  return {
    engine: readString(payload.engine),
    q: readString(payload.q),
    location: readString(payload.location),
    gl: readString(payload.gl),
    hl: readString(payload.hl),
    z: readNumberish(payload.z),
    m: readNumberish(payload.m),
    start: readNumberish(payload.start),
  };
}

export interface DiscoveryAdminRepository {
  listLeads(query: AdminListLeadsQuery): Promise<AdminListLeadsResponse>;
  getLeadById(id: string): Promise<AdminLeadDetailResponse>;
  listSearchTasks(query: AdminListSearchTasksQuery): Promise<AdminListSearchTasksResponse>;
  getSearchTaskById(id: string): Promise<AdminSearchTaskDetailResponse>;
  listJobRuns(query: JobRunListQuery): Promise<ListJobRunsResponse>;
  getJobRunById(id: string): Promise<JobRunDetailResponse>;
}

export class PrismaDiscoveryAdminRepository implements DiscoveryAdminRepository {
  async listLeads(query: AdminListLeadsQuery): Promise<AdminListLeadsResponse> {
    const where = buildLeadWhere(query);
    const [total, rows] = await Promise.all([
      prisma.business.count({ where }),
      prisma.business.findMany({
        where,
        orderBy: buildLeadOrderBy(query.sortBy),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => toLeadRow(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getLeadById(id: string): Promise<AdminLeadDetailResponse> {
    const row = await prisma.business.findUnique({
      where: { id },
      include: {
        evidence: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 200,
          include: {
            searchTask: true,
          },
        },
      },
    });

    if (!row) {
      throw new DiscoveryAdminNotFoundError('Lead not found');
    }

    const scoreBreakdown = computeBusinessScore({
      hasWhatsapp: row.hasWhatsapp,
      hasInstagram: row.hasInstagram,
      acceptsOnlinePayments: row.acceptsOnlinePayments,
      reviewCount: row.reviewCount,
      followerCount: row.followerCount,
      physicalAddressPresent: row.physicalAddressPresent,
      recentActivity: row.recentActivity,
    });

    return {
      lead: toLeadRow(row),
      scoreBreakdown,
      evidenceTimeline: row.evidence.map((evidence) => ({
        id: evidence.id,
        sourceType: evidence.sourceType,
        sourceUrl: evidence.sourceUrl,
        serpapiResultId: evidence.serpapiResultId,
        rawJson: evidence.rawJson,
        createdAt: evidence.createdAt.toISOString(),
        searchTask: evidence.searchTask
          ? {
              id: evidence.searchTask.id,
              taskType: evidence.searchTask.taskType,
              queryText: evidence.searchTask.queryText,
              countryCode: evidence.searchTask.countryCode,
              city: evidence.searchTask.city,
              language: evidence.searchTask.language,
              page: evidence.searchTask.page,
              timeBucket: evidence.searchTask.timeBucket,
              paramsJson: evidence.searchTask.paramsJson,
              updatedAt: evidence.searchTask.updatedAt.toISOString(),
            }
          : null,
      })),
      dedupeKeys: {
        websiteDomain: row.websiteDomain,
        phoneE164: row.phoneE164,
        instagramHandle: row.instagramHandle,
      },
    };
  }

  async listSearchTasks(query: AdminListSearchTasksQuery): Promise<AdminListSearchTasksResponse> {
    const where: Prisma.SearchTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.taskType ? { taskType: query.taskType } : {}),
      ...(query.countryCode ? { countryCode: query.countryCode.toUpperCase() } : {}),
      ...(query.timeBucket ? { timeBucket: { contains: query.timeBucket } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.searchTask.count({ where }),
      prisma.searchTask.findMany({
        where,
        orderBy: buildTaskOrderBy(query.sortBy),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        taskType: row.taskType,
        status: row.status,
        countryCode: row.countryCode,
        city: row.city,
        language: row.language,
        queryText: row.queryText,
        timeBucket: row.timeBucket,
        attempts: row.attempts,
        runAfter: row.runAfter.toISOString(),
        lastResultHash: row.lastResultHash,
        error: row.error,
        updatedAt: row.updatedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getSearchTaskById(id: string): Promise<AdminSearchTaskDetailResponse> {
    const task = await prisma.searchTask.findUnique({
      where: { id },
      include: {
        businessEvidence: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 200,
          include: {
            business: true,
          },
        },
      },
    });

    if (!task) {
      throw new DiscoveryAdminNotFoundError('Search task not found');
    }

    return {
      task: {
        id: task.id,
        taskType: task.taskType,
        status: task.status,
        countryCode: task.countryCode,
        city: task.city,
        language: task.language,
        queryText: task.queryText,
        timeBucket: task.timeBucket,
        attempts: task.attempts,
        runAfter: task.runAfter.toISOString(),
        lastResultHash: task.lastResultHash,
        error: task.error,
        updatedAt: task.updatedAt.toISOString(),
        createdAt: task.createdAt.toISOString(),
        paramsJson: task.paramsJson,
        page: task.page,
        derivedParams: readDerivedTaskParams(task.paramsJson),
      },
      linkedLeads: task.businessEvidence.map((evidence) => ({
        businessId: evidence.business.id,
        name: evidence.business.name,
        countryCode: evidence.business.countryCode,
        city: evidence.business.city,
        category: evidence.business.category,
        score: evidence.business.deterministicScore,
        evidenceId: evidence.id,
        evidenceCreatedAt: evidence.createdAt.toISOString(),
      })),
    };
  }

  async listJobRuns(query: JobRunListQuery): Promise<ListJobRunsResponse> {
    const where: Prisma.JobRunWhereInput = {
      ...(query.jobName ? { jobName: query.jobName } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.jobRun.count({ where }),
      prisma.jobRun.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        jobName: row.jobName,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        durationMs: row.durationMs ?? null,
        status: row.status,
        paramsJson: row.paramsJson,
        countersJson: row.countersJson,
        resourceJson: row.resourceJson,
        errorText: row.errorText,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getJobRunById(id: string): Promise<JobRunDetailResponse> {
    const row = await prisma.jobRun.findUnique({
      where: { id },
    });
    if (!row) {
      throw new DiscoveryAdminNotFoundError('Job run not found');
    }

    return {
      run: {
        id: row.id,
        jobName: row.jobName,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        durationMs: row.durationMs ?? null,
        status: row.status,
        paramsJson: row.paramsJson,
        countersJson: row.countersJson,
        resourceJson: row.resourceJson,
        errorText: row.errorText,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }
}
