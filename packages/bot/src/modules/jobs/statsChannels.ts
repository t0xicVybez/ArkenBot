
import { type VoiceChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import type { BotClient } from '../../client.js';

export async function updateStatsChannels(client: BotClient): Promise<void> {
  try {
    const configs = await prisma.statsChannel.findMany();

    for (const cfg of configs) {
      await updateStatsChannel(client, cfg);
    }
  } catch (err) {
    logger.error({ err }, 'Stats channel update failed');
  }
}

async function updateStatsChannel(
  client: BotClient,
  cfg: Awaited<ReturnType<typeof prisma.statsChannel.findFirst>> & object,
): Promise<void> {
  if (!cfg) return;
  try {
    const guild = client.guilds.cache.get(cfg.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(cfg.channelId) as VoiceChannel | undefined;
    if (!channel) return;

    let value: string;
    switch (cfg.type) {
      case 'members':
        value = guild.memberCount.toLocaleString();
        break;
      case 'online': {

        const online = guild.presences.cache.filter(
          (p) => p.status !== 'offline' && !p.user?.bot,
        ).size;
        value = online.toLocaleString();
        break;
      }
      case 'boosts':
        value = (guild.premiumSubscriptionCount ?? 0).toLocaleString();
        break;
      case 'bots':
        value = guild.members.cache.filter((m) => m.user.bot).size.toLocaleString();
        break;
      default:
        return;
    }

    const newName = cfg.format.replace('{value}', value);
    if (channel.name !== newName) {
      await channel.setName(newName, 'Stats channel update').catch(swallow);
    }
  } catch (err) {
    logger.error({ err, channelId: cfg?.channelId }, 'Failed to update stats channel');
  }
}
