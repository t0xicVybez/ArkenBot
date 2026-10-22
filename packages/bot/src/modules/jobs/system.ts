
/**
 * Assorted system-level background jobs: syncing Valorant ranks, awarding XP to
 * people sitting in voice, writing a heartbeat so health checks know the bot is
 * alive, and purging data for guilds that left past their grace period.
 */
import { prisma } from '../../database.js';
import { logger } from '../../logger.js';
import { ValorantModule } from '../valorant/ValorantModule.js';
import { LevelingModule } from '../leveling/LevelingModule.js';
import type { BotClient } from '../../client.js';
import { isLeaderShard } from '../../utils/sharding.js';

export async function runValorantSync(client: BotClient): Promise<void> {
  if (!isLeaderShard(client)) return;
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
    // Per-shard heartbeat so staff/public metrics can aggregate across shards
    // (sum memory + guilds). Unsharded, client.shard is null → shard 0.
    const shardId = client.shard?.ids?.[0] ?? 0;
    const payload = JSON.stringify({
      at: Date.now(),
      guilds: client.guilds.cache.size,
      members: client.guilds.cache.reduce((sum, g) => sum + (g.memberCount ?? 0), 0),
      ws: client.ws.ping,
      rss: process.memoryUsage().rss,
      startedAt: Date.now() - Math.floor(process.uptime() * 1000),
      shardId,
    });
    await pub.set(`bot:heartbeat:shard:${shardId}`, payload, 'EX', 120);
    // Legacy single key kept as a fallback for any older reader.
    await pub.set('bot:heartbeat', payload, 'EX', 120);
  } catch {  }
}

export async function runGuildPurgeSweep(client: BotClient): Promise<void> {
  if (!isLeaderShard(client)) return;
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
