/** system scheduler job(s) — extracted from BackgroundJobs (P3 god-file split). */
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';
import { ValorantModule } from '../valorant/ValorantModule.js';
import { LevelingModule } from '../leveling/LevelingModule.js';
import type { BotClient } from '../../client.js';

export async function runValorantSync(client: BotClient): Promise<void> {
  try {
    await ValorantModule.syncBatch(client, 20);
  } catch (err) {
    logger.warn({ err }, 'valorant sync failed');
  }
}

export async function runVoiceXp(client: BotClient): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await LevelingModule.sweepVoiceXp(guild).catch((err) => logger.error({ err, guildId: guild.id }, 'voice XP sweep failed'));
  }
}

export async function beatHeartbeat(client: BotClient): Promise<void> {
  try {
    const { pub } = await import('../../redis.js');
    await pub.set('bot:heartbeat', JSON.stringify({
      at: Date.now(),
      guilds: client.guilds.cache.size,
      ws: client.ws.ping,
    }), 'EX', 120);
  } catch { /* redis hiccup — next beat will recover */ }
}

export async function runGuildPurgeSweep(client: BotClient): Promise<void> {
  try {
    const { purgeGuildData, PURGE_GRACE_HOURS } = await import('../../utils/guildPurge.js');
    const cutoff = new Date(Date.now() - PURGE_GRACE_HOURS * 60 * 60 * 1000);
    const expired = await prisma.guild.findMany({
      where: { isActive: false, leftAt: { not: null, lt: cutoff } },
      select: { id: true, name: true },
    });
    for (const guild of expired) {
      logger.info({ guildId: guild.id, name: guild.name }, 'Grace period elapsed — purging guild data');
      await purgeGuildData(guild.id);
    }
  } catch (err) {
    logger.error({ err }, 'Guild purge sweep failed');
  }
}
