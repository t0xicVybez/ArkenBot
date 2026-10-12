
import { prisma } from '../database.js';
import { logger } from '../logger.js';

export const PURGE_GRACE_HOURS = 72;

export async function purgeGuildData(guildId: string): Promise<boolean> {
  const results = await Promise.allSettled([
    prisma.guild.deleteMany({ where: { id: guildId } }),
    prisma.addonData.deleteMany({ where: { guildId } }),
    prisma.userAchievement.deleteMany({ where: { guildId } }),
    prisma.serverDailyStats.deleteMany({ where: { guildId } }),
    prisma.reputation.deleteMany({ where: { guildId } }),
    prisma.starboardEntry.deleteMany({ where: { guildId } }),
    prisma.suggestion.deleteMany({ where: { guildId } }),
  ]);

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    logger.error(
      { guildId, failures: failed.map((f) => String((f as PromiseRejectedResult).reason)) },
      'Guild purge completed with errors',
    );
    return false;
  }
  logger.info({ guildId }, 'Purged all data for guild');
  return true;
}
