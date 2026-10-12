
import { type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { logger } from '../../logger.js';
import { EconomyModule } from '../economy/EconomyModule.js';
import { HighlightsModule } from '../HighlightsModule.js';
import { postAnalytics } from '../../commands/utility/analytics.js';
import type { BotClient } from '../../client.js';

export async function runLotteryDraw(client: BotClient): Promise<void> {

  if (new Date().getUTCDay() !== 0) return;
  const week = (() => { const d = new Date(); return `${d.getUTCFullYear()}-${Math.floor(d.getTime() / 6048e5)}`; })();
  const configs = await prisma.economyConfig.findMany({ where: { enabled: true, lotteryEnabled: true }, select: { guildId: true } }).catch(() => []);
  for (const cfg of configs) {
    const guild = client.guilds.cache.get(cfg.guildId);
    if (!guild) continue;
    const guard = await redis.set(`lottery:${cfg.guildId}:${week}`, '1', 'EX', 8 * 86400, 'NX').catch(() => 'OK');
    if (guard !== 'OK') continue;
    await EconomyModule.drawLottery(guild).catch((err) => logger.error({ err, guildId: cfg.guildId }, 'lottery draw failed'));
  }
}

export async function runWeeklyHighlights(client: BotClient): Promise<void> {

  if (new Date().getUTCDay() !== 1) return;
  const configs = await prisma.guildSettings.findMany({ where: { highlightsEnabled: true, highlightsChannelId: { not: null } }, select: { guildId: true } }).catch(() => []);
  for (const cfg of configs) {
    const guild = client.guilds.cache.get(cfg.guildId);
    if (!guild) continue;
    await HighlightsModule.postDigest(guild).catch((err) => logger.error({ err, guildId: cfg.guildId }, 'highlights digest failed'));
  }
}

export async function runWeeklyAnalytics(client: BotClient): Promise<void> {

  if (new Date().getUTCDay() !== 1) return;

  const configs = await prisma.guildSettings.findMany({
    where: { analyticsChannelId: { not: null } },
    select: { guildId: true, analyticsChannelId: true },
  });

  for (const cfg of configs) {
    try {
      const channel = await client.channels.fetch(cfg.analyticsChannelId!);
      if (!channel?.isTextBased()) continue;
      await postAnalytics(cfg.guildId, channel as TextChannel);
    } catch (err) {
      logger.error({ err, guildId: cfg.guildId }, 'Failed to send weekly analytics report');
    }
  }
}
