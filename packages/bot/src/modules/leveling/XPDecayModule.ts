/**
 * Applies configurable XP decay to inactive users. Guilds enable decay and set
 * the inactivity threshold and percentage via guild settings. The decay run is
 * triggered once per day by `BackgroundJobs`.
 */

import { prisma } from '../../database.js';
import { levelFromXp } from '@arkenbot/shared';
import { logger } from '../../logger.js';

export class XPDecayModule {
  /**
   * Iterates every guild with XP decay enabled and applies the configured
   * percentage reduction to users who have not earned XP within the inactivity
   * window. Called once per day by `BackgroundJobs`.
   */
  static async runDecay(): Promise<void> {
    try {
      const guilds = await prisma.guildSettings.findMany({
        where: { xpDecayEnabled: true },
        select: {
          guildId: true,
          xpDecayDays: true,
          xpDecayPercent: true,
        },
      });

      for (const settings of guilds) {
        await XPDecayModule.decayGuild(
          settings.guildId,
          settings.xpDecayDays,
          settings.xpDecayPercent,
        );
      }
    } catch (err) {
      logger.error({ err }, 'XP decay run failed');
    }
  }

  /**
   * Applies XP decay to all users in a guild who have not earned XP since the
   * cutoff date. XP is floored at 0 and the stored level is recalculated to
   * stay consistent with the new XP value.
   */
  private static async decayGuild(
    guildId: string,
    inactiveDays: number,
    decayPercent: number,
  ): Promise<void> {
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

    try {
      const inactive = await prisma.userLevel.findMany({
        where: {
          guildId,
          updatedAt: { lt: cutoff },
          xp: { gt: 0 },
        },
      });

      if (inactive.length === 0) return;

      let decayed = 0;

      for (const record of inactive) {
        const loss = Math.max(1, Math.floor(record.xp * (decayPercent / 100)));
        const newXp = Math.max(0, record.xp - loss);
        const newLevel = levelFromXp(newXp);

        await prisma.userLevel.update({
          where: { id: record.id },
          data: { xp: newXp, level: newLevel },
        });

        decayed++;
      }

      logger.info(
        { guildId, decayed, inactiveDays, decayPercent },
        'XP decay applied',
      );
    } catch (err) {
      logger.error({ err, guildId }, 'XP decay failed for guild');
    }
  }
}
