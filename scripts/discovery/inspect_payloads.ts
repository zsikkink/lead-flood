import { Prisma, prisma } from '@lead-flood/db';

const TASK_TYPES = ['SERP_GOOGLE', 'SERP_GOOGLE_LOCAL', 'SERP_MAPS_LOCAL'] as const;

type SearchTaskType = (typeof TASK_TYPES)[number];

interface InspectOptions {
  limit: number;
  timeBucket: string | null;
}

interface RawSignalSummary {
  hasWebsiteKey: boolean;
  hasDomainKey: boolean;
  hasInstagramKey: boolean;
  urlCandidates: string[];
  websiteCandidates: string[];
  domainCandidates: string[];
  instagramCandidates: string[];
}

interface TaskTypeSummary {
  taskType: SearchTaskType;
  sampled: number;
  parsedWebsitePresent: number;
  parsedInstagramPresent: number;
  rawWebsiteSignal: number;
  rawInstagramSignal: number;
  potentialWebsiteParseMiss: number;
  potentialInstagramParseMiss: number;
  sampleMisses: Array<{
    evidenceId: string;
    businessId: string;
    businessName: string;
    createdAt: string;
    parsedWebsiteDomain: string | null;
    parsedInstagramHandle: string | null;
    websiteCandidates: string[];
    instagramCandidates: string[];
    timeBucket: string;
  }>;
}

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;
const DOMAIN_REGEX = /\b[a-z0-9.-]+\.[a-z]{2,}\b/gi;
const INSTAGRAM_REGEX = /instagram\.com\/([A-Za-z0-9._-]+)/gi;

function parseArgs(argv: string[]): InspectOptions {
  const options: InspectOptions = {
    limit: 20,
    timeBucket: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--limit') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
      index += 1;
      continue;
    }

    if (arg === '--timeBucket') {
      const value = (argv[index + 1] ?? '').trim();
      options.timeBucket = value.length > 0 ? value : null;
      index += 1;
      continue;
    }
  }

  return options;
}

function pushUnique(target: string[], values: Iterable<string>): void {
  const existing = new Set(target);
  for (const value of values) {
    if (!existing.has(value)) {
      target.push(value);
      existing.add(value);
    }
  }
}

function extractMatches(input: string, regex: RegExp): string[] {
  const matches = input.match(regex);
  if (!matches) {
    return [];
  }
  return Array.from(
    new Set(
      matches
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function inspectRawJson(rawJson: Prisma.JsonValue): RawSignalSummary {
  const summary: RawSignalSummary = {
    hasWebsiteKey: false,
    hasDomainKey: false,
    hasInstagramKey: false,
    urlCandidates: [],
    websiteCandidates: [],
    domainCandidates: [],
    instagramCandidates: [],
  };

  const visit = (value: Prisma.JsonValue, path: string[]): void => {
    if (value === null) {
      return;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return;
      }

      const key = (path[path.length - 1] ?? '').toLowerCase();
      const pathText = path.join('.').toLowerCase();

      const urlMatches = extractMatches(normalized, URL_REGEX);
      const domainMatches = extractMatches(normalized, DOMAIN_REGEX).filter(
        (candidate) => !candidate.toLowerCase().startsWith('http'),
      );
      const instagramMatches = extractMatches(normalized, INSTAGRAM_REGEX).map((match) => {
        const normalizedMatch = match.toLowerCase();
        const index = normalizedMatch.indexOf('instagram.com/');
        return index >= 0 ? match.slice(index) : match;
      });

      pushUnique(summary.urlCandidates, urlMatches);
      pushUnique(summary.domainCandidates, domainMatches);
      pushUnique(summary.instagramCandidates, instagramMatches);

      if (key.includes('website') || pathText.includes('.website')) {
        summary.hasWebsiteKey = true;
        if (urlMatches.length > 0) {
          pushUnique(summary.websiteCandidates, urlMatches);
        } else if (domainMatches.length > 0) {
          pushUnique(summary.websiteCandidates, domainMatches);
        }
      }

      if (key.includes('domain') || pathText.includes('.domain')) {
        summary.hasDomainKey = true;
        if (domainMatches.length > 0) {
          pushUnique(summary.domainCandidates, domainMatches);
        }
      }

      if (key.includes('instagram') || normalized.toLowerCase().includes('instagram.com/')) {
        summary.hasInstagramKey = true;
        if (instagramMatches.length > 0) {
          pushUnique(summary.instagramCandidates, instagramMatches);
        }
      }

      if (key.includes('link') || key.includes('url')) {
        if (urlMatches.length > 0) {
          pushUnique(summary.websiteCandidates, urlMatches);
        }
      }

      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index] as Prisma.JsonValue, [...path, String(index)]);
      }
      return;
    }

    if (typeof value === 'object') {
      const record = value as Record<string, Prisma.JsonValue>;
      for (const [key, child] of Object.entries(record)) {
        visit(child, [...path, key]);
      }
    }
  };

  visit(rawJson, []);
  return summary;
}

async function inspectTaskType(taskType: SearchTaskType, options: InspectOptions): Promise<TaskTypeSummary> {
  const rows = await prisma.businessEvidence.findMany({
    where: {
      searchTask: {
        is: {
          taskType,
          ...(options.timeBucket ? { timeBucket: options.timeBucket } : {}),
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: options.limit,
    select: {
      id: true,
      createdAt: true,
      rawJson: true,
      business: {
        select: {
          id: true,
          name: true,
          websiteDomain: true,
          instagramHandle: true,
        },
      },
      searchTask: {
        select: {
          id: true,
          timeBucket: true,
          queryText: true,
        },
      },
    },
  });

  let parsedWebsitePresent = 0;
  let parsedInstagramPresent = 0;
  let rawWebsiteSignal = 0;
  let rawInstagramSignal = 0;
  let potentialWebsiteParseMiss = 0;
  let potentialInstagramParseMiss = 0;

  const sampleMisses: TaskTypeSummary['sampleMisses'] = [];

  for (const row of rows) {
    const summary = inspectRawJson(row.rawJson);
    const hasRawWebsiteSignal =
      summary.hasWebsiteKey ||
      summary.hasDomainKey ||
      summary.websiteCandidates.length > 0 ||
      summary.domainCandidates.length > 0;
    const hasRawInstagramSignal =
      summary.hasInstagramKey || summary.instagramCandidates.length > 0;

    if (row.business.websiteDomain !== null) {
      parsedWebsitePresent += 1;
    }
    if (row.business.instagramHandle !== null) {
      parsedInstagramPresent += 1;
    }
    if (hasRawWebsiteSignal) {
      rawWebsiteSignal += 1;
    }
    if (hasRawInstagramSignal) {
      rawInstagramSignal += 1;
    }

    const websiteParseMiss = hasRawWebsiteSignal && row.business.websiteDomain === null;
    const instagramParseMiss = hasRawInstagramSignal && row.business.instagramHandle === null;

    if (websiteParseMiss) {
      potentialWebsiteParseMiss += 1;
    }
    if (instagramParseMiss) {
      potentialInstagramParseMiss += 1;
    }

    if ((websiteParseMiss || instagramParseMiss) && sampleMisses.length < 5) {
      sampleMisses.push({
        evidenceId: row.id,
        businessId: row.business.id,
        businessName: row.business.name,
        createdAt: row.createdAt.toISOString(),
        parsedWebsiteDomain: row.business.websiteDomain,
        parsedInstagramHandle: row.business.instagramHandle,
        websiteCandidates: summary.websiteCandidates.slice(0, 3),
        instagramCandidates: summary.instagramCandidates.slice(0, 3),
        timeBucket: row.searchTask?.timeBucket ?? 'UNKNOWN',
      });
    }
  }

  return {
    taskType,
    sampled: rows.length,
    parsedWebsitePresent,
    parsedInstagramPresent,
    rawWebsiteSignal,
    rawInstagramSignal,
    potentialWebsiteParseMiss,
    potentialInstagramParseMiss,
    sampleMisses,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const summaries: TaskTypeSummary[] = [];

  for (const taskType of TASK_TYPES) {
    const summary = await inspectTaskType(taskType, options);
    summaries.push(summary);
  }

  console.log(
    JSON.stringify(
      {
        event: 'discovery.payload_inspection.completed',
        generatedAt: new Date().toISOString(),
        limitPerTaskType: options.limit,
        timeBucket: options.timeBucket,
        summaries,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown inspection error';
    console.error(
      JSON.stringify({
        event: 'discovery.payload_inspection.failed',
        error: message,
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
