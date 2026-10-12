/**
 * Permanently deletes a guild's data after it has left.
 *
 * When the bot is removed from a server we don't wipe its data immediately —
 * a scheduled job waits out a grace period (in case it was a brief kick or an
 * outage) and then calls `purgeGuildData`. The grace window is shared here so
 * the job and any tooling agree on it.
 */
import { prisma } from '../database.js';
import { logger } from '../logger.js';

export const PURGE_GRACE_HOURS = 72;

export async function purgeGuildData(guildId: string): Promise<boolean> {
  // Delete across every table that stores guild-scoped data. allSettled so one
  // failing delete doesn't abort the rest — we report partial failure instead.
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
