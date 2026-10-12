
/**
 * Fires on every message. This is one of the busiest paths in the bot, so it
 * fans a message out to the many features that care about chat: automod and
 * anti-phishing, XP/leveling, analytics, the counting game, modmail relaying,
 * auto-responses, custom slowmode and promotion tracking. The helpers above the
 * event do the heavier lifting (auto-responses and slowmode are cached in Redis
 * to keep this hot path cheap).
 */
import type { Message, TextChannel } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import type { BotEvent } from '../types.js';
import type { BotClient } from '../client.js';
import { AutoModModule } from '../modules/automod/AutoModModule.js';
import { AntiPhishingModule } from '../modules/automod/AntiPhishingModule.js';
import { LevelingModule } from '../modules/leveling/LevelingModule.js';
import { AnalyticsModule } from '../modules/AnalyticsModule.js';
import { CountingModule } from '../modules/counting/CountingModule.js';
import { ModmailModule } from '../modules/modmail/ModmailModule.js';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { logger, swallow} from '../logger.js';
import { ensureGuildExists } from '../utils/settings.js';
import { PromotionModule } from '../modules/promotion/PromotionModule.js';

const cooldownMap = new Map<string, number>();

const ensuredGuilds = new Set<string>();

const msgRateTracker = new Map<string, number[]>();

const slowmodeActive = new Map<string, NodeJS.Timeout>();

setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of cooldownMap) {
    if (now >= expiry) cooldownMap.delete(key);
  }
}, 10 * 60 * 1000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [channelId, timestamps] of msgRateTracker) {
    const fresh = timestamps.filter((t) => now - t < 3_600_000);
    if (fresh.length === 0 && !slowmodeActive.has(channelId)) {
      msgRateTracker.delete(channelId);
    } else if (fresh.length !== timestamps.length) {
      msgRateTracker.set(channelId, fresh);
    }
  }
}, 5 * 60 * 1000).unref();

// Record one message toward the guild's daily activity stats (powers the
// analytics charts). Debounced per guild so we're not writing on every message.
async function trackActivity(guildId: string): Promise<void> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.messageActivity.upsert({
      where: { guildId_date: { guildId, date: today } },
      update: { count: { increment: 1 } },
      create: { guildId, date: today, count: 1 },
    });
  } catch {  }
}

type AutoResponseRow = {
  id: string;
  pattern: string;
  flags: string;
  response: string;
  embed: boolean;
  embedColor: string | null;
  deleteMessage: boolean;
  requiredRoles: string[];
  ignoredRoles: string[];
};

// Match a message against the guild's configured auto-responses (keyword/regex
// triggers → canned replies). Rules are cached in Redis for 2 minutes, with the
// string 'null' caching the "this guild has none" case to skip the DB entirely.
async function checkAutoResponses(message: Message): Promise<void> {
  if (!message.guild || !message.channel.isTextBased() || !('send' in message.channel)) return;

  const guildId = message.guild.id;
  const cacheKey = `ar:list:${guildId}`;

  let rows: AutoResponseRow[];
  const cached = await redis.get(cacheKey).catch(swallow);
  if (cached === 'null') return;
  if (cached) {
    rows = JSON.parse(cached) as AutoResponseRow[];
  } else {
    const dbRows = await prisma.autoResponse.findMany({
      where: { guildId, enabled: true },
      select: { id: true, pattern: true, flags: true, response: true, embed: true, embedColor: true, deleteMessage: true, requiredRoles: true, ignoredRoles: true },
    }).catch(swallow);
    if (!dbRows) return;
    rows = dbRows as AutoResponseRow[];

    await redis.setex(cacheKey, 120, rows.length ? JSON.stringify(rows) : 'null').catch(swallow);
    if (!rows.length) return;
  }

  if (!rows.length) return;

  const needsRoles = rows.some((r) => r.requiredRoles.length > 0 || r.ignoredRoles.length > 0);
  const member = needsRoles
    ? (message.member ?? await message.guild.members.fetch(message.author.id).catch(swallow))
    : null;
  const memberRoleIds = member ? [...member.roles.cache.keys()] : [];

  const textChannel = message.channel as TextChannel;

  for (const row of rows) {
    if (row.ignoredRoles.length > 0 && row.ignoredRoles.some((r) => memberRoleIds.includes(r))) continue;
    if (row.requiredRoles.length > 0 && !row.requiredRoles.some((r) => memberRoleIds.includes(r))) continue;

    let matches = false;
    try {
      matches = new RegExp(row.pattern, row.flags).test(message.content);
    } catch {

      continue;
    }
    if (!matches) continue;

    if (row.deleteMessage) await message.delete().catch(swallow);

    let payload: Parameters<typeof textChannel.send>[0];
    if (row.embed) {
      const embed = new EmbedBuilder().setDescription(row.response);
      if (row.embedColor) embed.setColor(row.embedColor as `#${string}`);
      payload = { embeds: [embed] };
    } else {
      payload = row.response;
    }

    await textChannel.send(payload).catch(swallow);

    prisma.autoResponse.update({ where: { id: row.id }, data: { uses: { increment: 1 } } }).catch(swallow);
    break;
  }
}

type SlowmodeCfg = { enabled: boolean; windowSeconds: number; threshold: number; slowmodeSeconds: number; resetAfter: number };

// Custom slowmode: if a channel exceeds a configured message rate, flip on
// Discord's native slowmode for a bit, then lift it when the pace settles.
async function checkSlowmode(message: Message): Promise<void> {
  if (!message.guild || !message.channel.isTextBased()) return;
  const channelId = message.channel.id;
  const guildId = message.guild.id;

  const cacheKey = `slowmode:cfg:${guildId}:${channelId}`;
  let config: SlowmodeCfg | null = null;

  const cached = await redis.get(cacheKey).catch(swallow);
  if (cached === 'null') return;
  if (cached) {
    config = JSON.parse(cached) as SlowmodeCfg;
  } else {
    config = await prisma.slowmodeConfig.findUnique({
      where: { guildId_channelId: { guildId, channelId } },
    }).catch(swallow) as SlowmodeCfg | null;

    await redis.setex(cacheKey, 60, config ? JSON.stringify(config) : 'null').catch(swallow);
  }

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

      const timer = setTimeout(async () => {
        try {
          await (message.channel as TextChannel).setRateLimitPerUser(0, 'Auto-slowmode: inactivity reset');
          slowmodeActive.delete(channelId);
          msgRateTracker.delete(channelId);
          logger.info({ guildId, channelId }, 'Auto-slowmode removed');
        } catch {  }
      }, config.resetAfter * 1000);

      slowmodeActive.set(channelId, timer);
    } catch {  }
  }
}

const event: BotEvent = {
  name: 'messageCreate',
  async execute(_client: BotClient, message: Message) {
    if (!message.author || message.author.bot) return;

    if (!message.guild) {
      await ModmailModule.handleUserDM(_client, message).catch((err) => logger.error({ err }, 'modmail DM failed'));
      return;
    }

    if (ModmailModule.hasOpenThread(message.channel.id)) {
      await ModmailModule.handleStaffMessage(message).catch(swallow);
      return;
    }

    if (!ensuredGuilds.has(message.guild.id)) {
      ensuredGuilds.add(message.guild.id);
      await ensureGuildExists(
        message.guild.id,
        message.guild.name,
        message.guild.ownerId,
        message.guild.iconURL() ?? undefined,
      ).catch((err) => { ensuredGuilds.delete(message.guild!.id); logger.error({ err }, 'ensureGuildExists (messageCreate) failed'); });
    }

    await Promise.allSettled([
      AutoModModule.analyze(message),
      AntiPhishingModule.analyze(message),
      LevelingModule.processMessage(message.guild, message.author, message),
      trackActivity(message.guild.id),
      AnalyticsModule.trackMessage(message.guild.id),
      checkSlowmode(message),
      CountingModule.check(message),
      checkAutoResponses(message),
      PromotionModule.handleMessage(message.guild.id, message.author),
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
        }).catch(swallow);

        if (custom) {
          if (custom.requiredRoles.length > 0) {
            const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(swallow);
            const hasRole = member?.roles.cache.some((r) => custom.requiredRoles.includes(r.id));
            if (!hasRole) return;
          }

          if (custom.cooldown > 0) {
            const key = `${custom.id}:${message.author.id}`;
            const expiry = cooldownMap.get(key) ?? 0;
            if (Date.now() < expiry) return;
            cooldownMap.set(key, Date.now() + custom.cooldown * 1000);
          }

          const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(swallow);
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

          if (custom.deleteInvoking) await message.delete().catch(swallow);

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
            await message.author.send(payload).catch(swallow);
          } else {
            await textChannel.send(payload).catch(swallow);
          }

          prisma.customCommand.update({ where: { id: custom.id }, data: { uses: { increment: 1 } } }).catch(swallow);
        }
      }
    }
  },
};

export default event;
