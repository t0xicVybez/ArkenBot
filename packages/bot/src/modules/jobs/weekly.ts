
/**
 * Periodic "weekly" jobs: the economy lottery draw, the weekly highlights recap,
 * and the weekly analytics report. Each uses a day-of-week check and/or a Redis
 * once-per-week guard so it fires only once per period.
 */
import { type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { logger } from '../../logger.js';
import { EconomyModule } from '../economy/EconomyModule.js';
import { HighlightsModule } from '../HighlightsModule.js';
import { postAnalytics } from '../../commands/utility/analytics.js';
import type { BotClient } from '../../client.js';

// Draw each server's weekly economy lottery. Only runs on Sundays (UTC), and a
// per-guild/week Redis guard (SET NX) ensures the draw happens exactly once even
// if the job ticks multiple times or across restarts.
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
