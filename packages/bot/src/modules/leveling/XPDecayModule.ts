

import { prisma } from '../../database.js';
import { levelFromXp } from '@arkenbot/shared';
import { logger } from '../../logger.js';

export class XPDecayModule {

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
