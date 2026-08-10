/**
 * One-time backfill: encrypt integration tokens that are still stored in plaintext
 * (mondayApiToken, topgg webhookSecret). Idempotent — rows already encrypted as a
 * 3-part `iv.tag.ciphertext` payload are skipped, so it is safe to re-run.
 *
 * Run AFTER the encrypt-on-write / decrypt-on-read changes are deployed, and only
 * once SESSION_ENCRYPTION_KEY is set to a stable value:
 *
 *   pnpm --filter @arkenbot/api exec tsx src/scripts/encrypt-integration-secrets.ts
 */
import { prisma } from '../database.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// A value is already encrypted only if it actually decrypts. A plain part-count
// check is unsafe: Monday API tokens are JWTs (also 3 dot-separated parts) and
// would be mistaken for encrypted payloads and skipped.
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
