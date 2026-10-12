#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';

try {
  (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {

}

const [, , userId, ...flags] = process.argv;
const revoke = flags.includes('--revoke');
const makeOwner = flags.includes('--owner');

if (!userId || !/^\d{17,20}$/.test(userId)) {
  console.error('');
  console.error('  Usage:');
  console.error('    pnpm grant-staff <discord-user-id>');
  console.error('    pnpm grant-staff <discord-user-id> --revoke');
  console.error('    pnpm grant-staff <discord-user-id> --owner');
  console.error('');
  console.error('  Discord user IDs are 17-20 digit numbers.');
  console.error('  To find one: Discord → Settings → Advanced → Developer Mode');
  console.error('  then right-click any username → Copy User ID');
  console.error('');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('Run from the project root where .env exists, or export DATABASE_URL first.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const updateData: { isStaff: boolean; isBotOwner?: boolean } = {
    isStaff: !revoke,
  };

  if (makeOwner) {
    updateData.isBotOwner = true;
    updateData.isStaff = true;
  }

  if (revoke) {
    updateData.isBotOwner = false;
  }

  const user = await prisma.portalUser.upsert({
    where: { id: userId },
    update: updateData,
    create: {
      id: userId,
      username: 'pending-login',
      ...updateData,
    },
  });

  console.error('');
  if (revoke) {
    console.log(`✓  Revoked staff access from user ${userId}`);
  } else if (makeOwner) {
    console.log(`✓  Granted bot owner + staff access to user ${userId}`);
  } else {
    console.log(`✓  Granted staff access to user ${userId}`);
  }

  console.log('');
  console.log(`   User ID   : ${user.id}`);
  console.log(`   Username  : ${user.username === 'pending-login' ? '(set on first login)' : user.username}`);
  console.log(`   isStaff   : ${user.isStaff}`);
  console.log(`   isBotOwner: ${user.isBotOwner}`);

  if (!revoke) {
    console.log('');
    console.log('   The user can now log in at /staff using their Discord account.');
  }
}

main()
  .catch((err: Error) => {
    console.error('Error:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
