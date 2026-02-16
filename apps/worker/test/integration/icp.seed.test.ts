import { prisma } from '@lead-flood/db';
import { execSync } from 'node:child_process';
import { beforeEach, describe, expect, it } from 'vitest';

const ZBOONI_ICP_NAMES = [
  'Chat-First SMB Seller',
  'High-Touch Service Business',
  'Shopify / Ecommerce Recovery',
  'Multi-Rep SMB Growth',
] as const;

const EXPECTED_RULE_COUNTS: Record<(typeof ZBOONI_ICP_NAMES)[number], number> = {
  'Chat-First SMB Seller': 11,
  'High-Touch Service Business': 8,
  'Shopify / Ecommerce Recovery': 7,
  'Multi-Rep SMB Growth': 7,
};

function runSeedScript(): void {
  execSync('pnpm --filter @lead-flood/worker exec tsx ../../scripts/icp/seed-zbooni-icps.ts', {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: process.env,
  });
}

async function cleanupSeededIcps(): Promise<void> {
  const profiles = await prisma.icpProfile.findMany({
    where: {
      name: {
        in: ZBOONI_ICP_NAMES,
      },
    },
    select: { id: true },
  });

  const icpIds = profiles.map((profile) => profile.id);
  if (icpIds.length === 0) {
    return;
  }

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

describe('icp.seed', () => {
  beforeEach(async () => {
    await cleanupSeededIcps();
  });

  it('creates four active Zbooni ICPs with stable wide-net rules and supports idempotent reruns', async () => {
    runSeedScript();

    for (const icpName of ZBOONI_ICP_NAMES) {
      const icp = await prisma.icpProfile.findFirst({
        where: { name: icpName },
        include: {
          qualificationRules: {
            orderBy: [{ orderIndex: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      expect(icp).not.toBeNull();
      if (!icp) {
        continue;
      }

      expect(icp.isActive).toBe(true);
      expect(icp.qualificationLogic).toBe('WEIGHTED');
      expect(icp.createdByUserId).toBeNull();
      expect(icp.metadataJson).toMatchObject({
        strategy: 'wide_net',
      });
      expect(icp.qualificationRules).toHaveLength(EXPECTED_RULE_COUNTS[icpName]);

      const requiredRules = icp.qualificationRules.filter((rule) => rule.isRequired);
      expect(requiredRules).toHaveLength(1);
      expect(requiredRules[0]?.fieldKey).toBe('country');

      const orderIndexes = icp.qualificationRules.map((rule) => rule.orderIndex);
      expect(orderIndexes).toEqual(
        Array.from({ length: EXPECTED_RULE_COUNTS[icpName] }, (_, index) => index + 1),
      );
    }

    runSeedScript();

    const allSeededIcpCount = await prisma.icpProfile.count({
      where: {
        name: {
          in: ZBOONI_ICP_NAMES,
        },
      },
    });
    expect(allSeededIcpCount).toBe(4);
  });
});
