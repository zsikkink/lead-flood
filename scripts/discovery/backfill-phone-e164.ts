import { Prisma, prisma } from '@lead-flood/db';

import { normalizePhoneE164 } from '../../packages/discovery/src/normalization/phone.js';

type SupportedCountry = 'JO' | 'SA' | 'AE' | 'EG';
const SUPPORTED_COUNTRIES = new Set<SupportedCountry>(['JO', 'SA', 'AE', 'EG']);

interface BackfillOptions {
  batchSize: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    batchSize: 500,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--batchSize') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(value) && value > 0) {
        options.batchSize = value;
      }
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function isSupportedCountry(value: string): value is SupportedCountry {
  return SUPPORTED_COUNTRIES.has(value as SupportedCountry);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  let cursor: string | undefined;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedUnsupportedCountry = 0;
  let skippedInvalidNormalized = 0;
  let skippedConflicts = 0;
  const conflictSamples: Array<{ id: string; from: string; to: string }> = [];

  while (true) {
    const rows = await prisma.business.findMany({
      where: {
        phoneE164: {
          not: null,
        },
        ...(cursor
          ? {
              id: {
                gt: cursor,
              },
            }
          : {}),
      },
      orderBy: {
        id: 'asc',
      },
      take: options.batchSize,
      select: {
        id: true,
        countryCode: true,
        phoneE164: true,
      },
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      scanned += 1;
      cursor = row.id;

      const rawPhone = row.phoneE164;
      if (!rawPhone) {
        unchanged += 1;
        continue;
      }

      if (!isSupportedCountry(row.countryCode)) {
        skippedUnsupportedCountry += 1;
        continue;
      }

      const normalized = normalizePhoneE164(rawPhone, row.countryCode);
      if (!normalized) {
        skippedInvalidNormalized += 1;
        continue;
      }

      if (normalized === rawPhone) {
        unchanged += 1;
        continue;
      }

      candidates += 1;

      if (options.dryRun) {
        continue;
      }

      try {
        await prisma.business.update({
          where: { id: row.id },
          data: {
            phoneE164: normalized,
          },
        });
        updated += 1;
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          skippedConflicts += 1;
          if (conflictSamples.length < 10) {
            conflictSamples.push({
              id: row.id,
              from: rawPhone,
              to: normalized,
            });
          }
          continue;
        }
        throw error;
      }
    }
  }

  const summary = {
    event: 'discovery.backfill_phone_e164.completed',
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    scanned,
    candidates,
    updated,
    unchanged,
    skippedUnsupportedCountry,
    skippedInvalidNormalized,
    skippedConflicts,
    conflictSamples,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown backfill error';
    console.error(
      JSON.stringify({
        event: 'discovery.backfill_phone_e164.failed',
        error: message,
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
