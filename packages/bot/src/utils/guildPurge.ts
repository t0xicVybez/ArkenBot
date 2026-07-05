/**
 * Complete removal of all data belonging to a guild. Deleting the Guild row
 * cascades to every FK-linked model; the models listed explicitly store
 * guildId as a plain column (no foreign key) so the cascade cannot reach them.
 *
 * Called by the BackgroundJobs purge sweep once a guild has been gone for
 * longer than the grace period (rejoining within the window cancels the purge
 * because ensureGuildExists resets isActive/leftAt).
 */
import { prisma } from '../database.js';
import { logger } from '../logger.js';

/** Hours a removed guild's data is retained before permanent deletion. */
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
