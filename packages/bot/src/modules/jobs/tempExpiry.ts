
/**
 * Lifts temporary punishments once they expire. Runs every minute:
 * `runTempBanExpiry` unbans users whose temp ban is up, and `runTempRoleExpiry`
 * strips roles whose temp assignment has ended.
 */
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import type { BotClient } from '../../client.js';
// `db` is the same client typed loosely, for a model not yet in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function runTempBanExpiry(client: BotClient): Promise<void> {
  const now = new Date();
  try {
    const expired = await prisma.tempBan.findMany({
      where: { unbanned: false, expiresAt: { lte: now } },
    });
    for (const ban of expired) {
      const guild = client.guilds.cache.get(ban.guildId);
      if (!guild) continue;
      await guild.bans.remove(ban.userId, 'Temporary ban expired').catch(swallow);
      await prisma.tempBan.update({ where: { id: ban.id }, data: { unbanned: true } });
      logger.info({ guildId: ban.guildId, userId: ban.userId }, 'Temp ban expired and removed');
    }
  } catch (err) {
    logger.error({ err }, 'Temp ban expiry check failed');
  }
}

export async function runTempRoleExpiry(client: BotClient): Promise<void> {
  const now = new Date();
  try {
    const expired = await db.tempRole.findMany({
      where: { removed: false, expiresAt: { lte: now } },
    });
    for (const tempRole of expired) {
      const guild = client.guilds.cache.get(tempRole.guildId);
      if (guild) {
        const member = await guild.members.fetch(tempRole.userId).catch(swallow);
        if (member) {
          await member.roles.remove(tempRole.roleId, 'Temporary role expired').catch(swallow);
        }
      }
      await db.tempRole.update({ where: { id: tempRole.id }, data: { removed: true } });
      logger.info({ guildId: tempRole.guildId, userId: tempRole.userId, roleId: tempRole.roleId }, 'Temp role expired and removed');
    }
  } catch (err) {
    logger.error({ err }, 'Temp role expiry check failed');
  }
}
