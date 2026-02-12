import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const prisma = new PrismaClient();
const demoUserPassword = process.env.DEMO_USER_PASSWORD ?? 'demo-password';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const derived = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });

  return ['scrypt', '16384', '8', '1', salt, derived.toString('base64url')].join('$');
}

async function main(): Promise<void> {
  const passwordHash = hashPassword(demoUserPassword);

  await prisma.user.upsert({
    where: { email: 'demo@lead-flood.local' },
    update: {
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
      passwordHash,
    },
    create: {
      email: 'demo@lead-flood.local',
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
      passwordHash,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
