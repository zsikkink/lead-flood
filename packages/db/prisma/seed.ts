import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { email: 'demo@lead-onslaught.local' },
    update: {
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
    },
    create: {
      email: 'demo@lead-onslaught.local',
      firstName: 'Demo',
      lastName: 'User',
      isActive: true,
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
