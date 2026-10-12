/**
 * One-off CLI: encrypt any plaintext integration secrets already stored in the database, migrating them to encryption-at-rest.
 */
import { prisma } from '../database.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const isEncrypted = (v: string): boolean => {
  try { decryptSecret(v); return true; } catch { return false; }
};

async function main(): Promise<void> {
  let monday = 0;
  let topgg = 0;

  const alerts = await prisma.mondayAlert.findMany({
    where: { mondayApiToken: { not: null } },
    select: { id: true, mondayApiToken: true },
  });
  for (const a of alerts) {
    if (!a.mondayApiToken || isEncrypted(a.mondayApiToken)) continue;
    await prisma.mondayAlert.update({
      where: { id: a.id },
      data: { mondayApiToken: encryptSecret(a.mondayApiToken) },
    });
    monday++;
  }

  const configs = await prisma.topggConfig.findMany({
    where: { webhookSecret: { not: null } },
    select: { guildId: true, webhookSecret: true },
  });
  for (const c of configs) {
    if (!c.webhookSecret || isEncrypted(c.webhookSecret)) continue;
    await prisma.topggConfig.update({
      where: { guildId: c.guildId },
      data: { webhookSecret: encryptSecret(c.webhookSecret) },
    });
    topgg++;
  }

  console.log(`Backfill complete: encrypted ${monday} mondayApiToken(s), ${topgg} webhookSecret(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
