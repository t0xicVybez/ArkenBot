/**
 * messageCreate event — the central message pipeline. Runs auto-moderation,
 * XP leveling, activity tracking, auto-slowmode, and the counting game in
 * parallel for every non-bot guild message. Also handles prefix-based custom
 * commands (prefix: `!`).
 */
import type { Message, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { AutoModModule } from '../modules/automod/AutoModModule.js';
import { LevelingModule } from '../modules/leveling/LevelingModule.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { CountingModule } from '../modules/counting/CountingModule.js';
import { prisma } from '../database.js';
import { logger } from '../logger.js';

// Per-user cooldown tracker for custom commands: `${commandId}:${userId}` → expiry timestamp
const cooldownMap = new Map<string, number>();

// Sliding-window message rate tracker for auto-slowmode: channelId → message timestamps
const msgRateTracker = new Map<string, number[]>();
// Tracks channels with active auto-slowmode to avoid redundant Discord API calls.
const slowmodeActive = new Map<string, NodeJS.Timeout>();

async function trackActivity(guildId: string): Promise<void> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.messageActivity.upsert({
      where: { guildId_date: { guildId, date: today } },
      update: { count: { increment: 1 } },
      create: { guildId, date: today, count: 1 },
    });
  } catch { /* non-critical */ }
}

async function checkSlowmode(message: Message): Promise<void> {
  if (!message.guild || !message.channel.isTextBased()) return;
  const channelId = message.channel.id;
  const guildId = message.guild.id;

  const config = await prisma.slowmodeConfig.findUnique({
    where: { guildId_channelId: { guildId, channelId } },
  }).catch(() => null);

  if (!config?.enabled) return;

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const timestamps = (msgRateTracker.get(channelId) ?? []).filter((t) => now - t < windowMs);
  timestamps.push(now);
  msgRateTracker.set(channelId, timestamps);

  if (timestamps.length >= config.threshold && !slowmodeActive.has(channelId)) {
    try {
      await (message.channel as TextChannel).setRateLimitPerUser(
        config.slowmodeSeconds,
        'Auto-slowmode: high message rate detected',
      );
      logger.info({ guildId, channelId }, 'Auto-slowmode applied');

      // Resets slowmode after the configured inactivity window elapses.
      const timer = setTimeout(async () => {
        try {
          await (message.channel as TextChannel).setRateLimitPerUser(0, 'Auto-slowmode: inactivity reset');
          slowmodeActive.delete(channelId);
          msgRateTracker.delete(channelId);
          logger.info({ guildId, channelId }, 'Auto-slowmode removed');
        } catch { /* channel may have been deleted */ }
      }, config.resetAfter * 1000);

      slowmodeActive.set(channelId, timer);
    } catch { /* missing permissions */ }
  }
}

const event: BotEvent = {
  name: 'messageCreate',
  async execute(_client: BotClient, message: Message) {
    if (!message.author || !message.guild || message.author.bot) return;

    await Promise.allSettled([
      AutoModModule.analyze(message),
      LevelingModule.processMessage(message.guild, message.author, message),
      trackActivity(message.guild.id),
      AnalyticsModule.trackMessage(message.guild.id),
      checkSlowmode(message),
      CountingModule.check(message),
    ]);

    if (message.content.startsWith('!')) {
      const commandName = message.content.slice(1).split(' ')[0].toLowerCase();
      if (commandName) {
        const custom = await prisma.customCommand.findFirst({
          where: {
            guildId: message.guild.id,
            enabled: true,
            OR: [{ name: commandName }, { aliases: { has: commandName } }],
          },
        }).catch(() => null);

        if (custom) {
          if (custom.requiredRoles.length > 0) {
            const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
            const hasRole = member?.roles.cache.some((r) => custom.requiredRoles.includes(r.id));
            if (!hasRole) return;
          }

          if (custom.cooldown > 0) {
            const key = `${custom.id}:${message.author.id}`;
            const expiry = cooldownMap.get(key) ?? 0;
            if (Date.now() < expiry) return;
            cooldownMap.set(key, Date.now() + custom.cooldown * 1000);
          }

          // Resolve member for display-name substitution, falling back to a fetch if not cached.
          const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
          const mentionedUser = message.mentions.users.first() ?? message.author;
          const substitute = (str: string) => str
            .replace(/\{user\}/g, `<@${message.author.id}>`)
            .replace(/\{username\}/g, message.author.username)
            .replace(/\{displayname\}/g, member?.displayName ?? message.author.username)
            .replace(/\{userid\}/g, message.author.id)
            .replace(/\{target\}/g, `<@${mentionedUser.id}>`)
            .replace(/\{targetname\}/g, mentionedUser.username)
            .replace(/\{server\}/g, message.guild!.name)
            .replace(/\{serverid\}/g, message.guild!.id)
            .replace(/\{count\}/g, String(message.guild!.memberCount))
            .replace(/\{boosts\}/g, String(message.guild!.premiumSubscriptionCount ?? 0))
            .replace(/\{channel\}/g, `<#${message.channel.id}>`)
            .replace(/\{channelname\}/g, (message.channel as TextChannel).name ?? message.channel.id);

          if (!message.channel.isTextBased() || !('send' in message.channel)) return;
          const textChannel = message.channel as TextChannel;

          if (custom.deleteInvoking) await message.delete().catch(() => null);

          let payload: Parameters<typeof textChannel.send>[0];
          if (custom.embed) {
            const embed = new EmbedBuilder().setDescription(substitute(custom.response));
            if (custom.embedTitle) embed.setTitle(substitute(custom.embedTitle));
            if (custom.embedColor) embed.setColor(custom.embedColor as `#${string}`);
            payload = { embeds: [embed] };
          } else {
            payload = substitute(custom.response);
          }

          if (custom.dmResponse) {
            await message.author.send(payload).catch(() => null);
          } else {
            await textChannel.send(payload).catch(() => null);
          }

          // Fire-and-forget: failure to increment the counter should not affect the response.
          prisma.customCommand.update({ where: { id: custom.id }, data: { uses: { increment: 1 } } }).catch(() => null);
        }
      }
    }
  },
};

export default event;
