import { prisma } from '@lead-flood/db';

import {
  FEATURE_EXTRACTOR_VERSION,
  handleFeaturesComputeJob,
  type FeaturesComputeJobPayload,
} from '../../apps/worker/src/jobs/features.compute.job.js';

interface BackfillArgs {
  icpProfileId?: string;
  batchSize: number;
  dryRun: boolean;
}

interface ScriptLogger {
  info: (object: Record<string, unknown>, message: string) => void;
  warn: (object: Record<string, unknown>, message: string) => void;
  error: (object: Record<string, unknown>, message: string) => void;
}

function parseArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = {
    batchSize: 100,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--icpProfileId') {
      args.icpProfileId = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--batchSize') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.batchSize = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }
  }

  return args;
}

function buildLogger(): ScriptLogger {
  return {
    info: (object, message) => {
      console.log(JSON.stringify({ level: 'info', message, ...object }));
    },
    warn: (object, message) => {
      console.warn(JSON.stringify({ level: 'warn', message, ...object }));
    },
    error: (object, message) => {
      console.error(JSON.stringify({ level: 'error', message, ...object }));
    },
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = buildLogger();
  const runId = `backfill.features:${Date.now()}`;

  const icpProfileIds = args.icpProfileId
    ? [args.icpProfileId]
    : (
        await prisma.icpProfile.findMany({
          where: { isActive: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      ).map((row) => row.id);

  if (icpProfileIds.length === 0) {
    logger.warn({}, 'No ICP profiles resolved for feature backfill');
    return;
  }

  logger.info(
    {
      runId,
      icpProfileCount: icpProfileIds.length,
      batchSize: args.batchSize,
      dryRun: args.dryRun,
    },
    'Starting feature snapshot backfill',
  );

  let processedLeads = 0;
  let attemptedSnapshots = 0;
  let cursor: string | undefined;

  while (true) {
    const leads = await prisma.lead.findMany({
      where: cursor
        ? {
            id: {
              gt: cursor,
            },
          }
        : undefined,
      orderBy: { id: 'asc' },
      take: args.batchSize,
      select: { id: true },
    });

    if (leads.length === 0) {
      break;
    }

    for (const lead of leads) {
      processedLeads += 1;
      cursor = lead.id;

      for (const icpProfileId of icpProfileIds) {
        attemptedSnapshots += 1;
        if (args.dryRun) {
          continue;
        }

        const payload: FeaturesComputeJobPayload = {
          runId,
          leadId: lead.id,
          icpProfileId,
          snapshotVersion: 1,
          sourceVersion: FEATURE_EXTRACTOR_VERSION,
          correlationId: `backfill:${lead.id}:${icpProfileId}`,
        };

        await handleFeaturesComputeJob(
          logger,
          {
            id: `backfill:${lead.id}:${icpProfileId}`,
            name: 'features.compute',
            data: payload,
          } as unknown as import('pg-boss').Job<FeaturesComputeJobPayload>,
          {
            boss: {
              send: async () => null,
            },
            enqueueScoring: false,
          },
        );
      }
    }

    logger.info(
      {
        runId,
        processedLeads,
        attemptedSnapshots,
        cursor,
      },
      'Processed feature backfill batch',
    );
  }

  logger.info(
    {
      runId,
      processedLeads,
      attemptedSnapshots,
      dryRun: args.dryRun,
    },
    'Completed feature snapshot backfill',
  );
}

run()
  .catch((error: unknown) => {
    console.error('Feature backfill failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
