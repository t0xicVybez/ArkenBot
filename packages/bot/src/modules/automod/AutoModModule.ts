/**
 * Provides real-time message moderation: spam detection, word filtering with
 * escalating consequences, link blocking, mention-spam removal, excessive-caps
 * deletion, and anti-raid join-surge protection.
 */

import { type Message, type GuildMember, type TextChannel, EmbedBuilder, PermissionFlagsBits, GuildVerificationLevel } from 'discord.js';
import { prisma } from '../../database.js';
import { redis } from '../../redis.js';
import { REDIS_KEYS, COLORS } from '@arkenbot/shared';
import type { AutoModConfig } from '@arkenbot/shared';
import { logger } from '../../logger.js';
import { AiModerationModule } from './AiModerationModule.js';

/** Redis key for the per-user word filter violation counter (24-hour rolling window). */
const FILTER_VIOLATION_KEY = (guildId: string, userId: string) =>
  `automod:filter:${guildId}:${userId}`;

export class AutoModModule {
  /**
   * Returns the AutoMod config for a guild, serving from a 60-second Redis cache
   * to avoid hitting the database on every message.
   */
  private static async getConfig(guildId: string): Promise<AutoModConfig | null> {
    const cached = await redis.get(`automod:config:${guildId}`);
    if (cached) return JSON.parse(cached) as AutoModConfig;

    const config = await prisma.autoModConfig.findUnique({ where: { guildId } });
    if (config) {
      await redis.setex(`automod:config:${guildId}`, 60, JSON.stringify(config));
    }
    return config as AutoModConfig | null;
  }

  /**
   * Runs all enabled AutoMod checks against an incoming message. Returns early
   * if the author is a bot, an Administrator, or in an exempt role or channel.
   * Checks are executed in priority order; each returns true when it has acted
   * on the message, preventing subsequent checks from running.
   */
  static async analyze(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const config = await this.getConfig(message.guild.id);
    if (!config) return;

    const member = message.member as GuildMember;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) return;
    const hasExemptRole = config.exemptRoles.some((r) => member.roles.cache.has(r));
    const isExemptChannel = config.exemptChannels.includes(message.channelId);
    if (hasExemptRole || isExemptChannel) return;

    if (config.antiSpamEnabled && await this.checkSpam(message, config)) return;
    if (config.filterEnabled && await this.checkWordFilter(message, config)) return;
    if (config.antiLinkEnabled && this.checkLinks(message, config)) return;
    if (config.antiMentionEnabled && this.checkMentions(message, config)) return;
    if (config.antiCapsEnabled && this.checkCaps(message, config)) return;

    // Nothing deterministic caught it — hand off to the AI classifier when the
    // guild has opted in. Fire-and-forget: it is rate-limited and must not add
    // latency to (or throw into) the message pipeline.
    if (config.aiModEnabled) void AiModerationModule.scan(message, config);
  }

  private static async checkSpam(message: Message, config: AutoModConfig): Promise<boolean> {
    const key = REDIS_KEYS.SPAM_TRACKER(message.guild!.id, message.author.id);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(config.antiSpamInterval / 1000));
    }

    if (count >= config.antiSpamThreshold) {
      await this.takeAction(message, config.antiSpamAction, 'Spam detected');
      await redis.del(key);
      return true;
    }
    return false;
  }

  // ─── Word filter with violation escalation ────────────────────────────────

  private static async checkWordFilter(message: Message, config: AutoModConfig): Promise<boolean> {
    const content = message.content.toLowerCase();
    const matchedWord = config.filteredWords.find((word) =>
      content.includes(word.toLowerCase())
    );
    if (!matchedWord) return false;

    await this.handleWordFilterViolation(message, config);
    return true;
  }

  /**
   * Handles a confirmed word filter match. Deletes the message, increments the
   * per-user violation counter, creates a Warning record, and applies an
   * escalating consequence (warn → timeout → kick) based on the violation count
   * within the rolling 24-hour window.
   */
  private static async handleWordFilterViolation(
    message: Message,
    config: AutoModConfig,
  ): Promise<void> {
    const guildId = message.guild!.id;
    const userId = message.author.id;
    const member = message.member as GuildMember;

    await message.delete().catch(() => null);

    // Track cumulative violations within a 24-hour rolling window. The expiry is
    // set only on the first increment so subsequent hits don't extend the window.
    const key = FILTER_VIOLATION_KEY(guildId, userId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86400);
    }

    const warnBeforeTimeout = config.filterWarnBeforeTimeout ?? 3;
    const warnBeforeKick    = config.filterWarnBeforeKick    ?? 5;
    const timeoutDuration   = config.filterTimeoutDuration   ?? 300;

    let action: 'warn' | 'timeout' | 'kick' = 'warn';
    if (count >= warnBeforeKick) {
      action = 'kick';
    } else if (count >= warnBeforeTimeout) {
      action = 'timeout';
    }

    // Persist a Warning record so moderators see filter violations in /warnings.
    await prisma.warning.create({
      data: {
        guildId,
        userId,
        userTag: message.author.tag,
        moderatorId: message.client.user!.id,
        moderatorTag: message.client.user!.tag,
        reason: `[AutoMod] Word filter violation #${count}`,
      },
    }).catch(() => null);

    await prisma.logEntry.create({
      data: {
        guildId,
        type: 'automod',
        userId,
        data: { action, reason: 'Word filter violation', count, channelId: message.channelId },
      },
    }).catch(() => null);

    if (action === 'timeout') {
      await member.timeout(timeoutDuration * 1000, `AutoMod: Word filter violation #${count}`)
        .catch(() => null);
    } else if (action === 'kick') {
      // Attempt a DM notification before the kick so the user knows why they were removed.
      const dmText = (config.filterKickDMMessage ?? `You were kicked from **{server}** for repeated word filter violations (violation #{count}).`)
        .replace(/\{count\}/g, String(count))
        .replace(/\{server\}/g, message.guild!.name);
      await message.author
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.ERROR)
              .setTitle(`Kicked from ${message.guild!.name}`)
              .setDescription(dmText),
          ],
        })
        .catch(() => null);

      await member.kick(`AutoMod: Word filter violation #${count}`).catch(() => null);

      // Reset the counter so a rejoining user starts fresh rather than being
      // immediately kicked again on their first message.
      await redis.del(key);
    }

    // Post a short-lived channel notification so other members see the action.
    if (!('send' in message.channel)) return;
    const ch = message.channel as TextChannel;

    const resolveMsg = (template: string, vars: Record<string, string>) =>
      template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);

    const vars = { user: `<@${userId}>`, count: String(count), server: message.guild!.name };

    let notifyContent: string;
    if (action === 'kick') {
      notifyContent = resolveMsg(
        config.filterKickMessage ?? `⛔ {user} was **kicked** for repeated word filter violations (violation #{count}).`,
        vars,
      );
    } else {
      notifyContent = resolveMsg(
        config.filterWarnMessage ?? `⚠️ {user} Your message was removed for containing a filtered word (violation #{count}).`,
        vars,
      );
    }

    await ch
      .send({ content: notifyContent })
      .then((m) => setTimeout(() => m.delete().catch(() => null), 8000))
      .catch(() => null);
  }

  // ─── Other checks ────────────────────────────────────────────────────────

  /**
   * Blocks links whose domains are not in the guild's allowlist. The check is
   * skipped when `allowedDomains` is empty, effectively allowing all links.
   */
  private static checkLinks(message: Message, config: AutoModConfig): boolean {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    const urls = message.content.match(urlPattern);
    if (!urls) return false;

    const hasBlockedLink = urls.some((url) => {
      try {
        const domain = new URL(url).hostname;
        return config.allowedDomains.length > 0 && !config.allowedDomains.includes(domain);
      } catch {
        return false;
      }
    });

    if (hasBlockedLink) {
      this.takeAction(message, config.linkAction, 'Blocked link detected');
      return true;
    }

    return false;
  }

  private static checkMentions(message: Message, config: AutoModConfig): boolean {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount >= config.mentionThreshold) {
      this.takeAction(message, 'delete', 'Mention spam');
      return true;
    }
    return false;
  }

  private static checkCaps(message: Message, config: AutoModConfig): boolean {
    if (message.content.length < 10) return false;
    const letters = message.content.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return false;
    const capsPercent = (message.content.replace(/[^A-Z]/g, '').length / letters.length) * 100;

    if (capsPercent >= config.capsThreshold) {
      this.takeAction(message, 'delete', 'Excessive caps');
      return true;
    }
    return false;
  }

  private static async takeAction(
    message: Message,
    action: string,
    reason: string
  ): Promise<void> {
    try {
      await message.delete().catch(() => null);

      if (action === 'warn' || action === 'mute' || action === 'kick' || action === 'ban') {
        if ('send' in message.channel) {
          await (message.channel as TextChannel)
            .send({
              content: `<@${message.author.id}> Your message was removed: **${reason}**`,
            })
            .then((m) => setTimeout(() => m.delete().catch(() => null), 5000))
            .catch(() => null);
        }
      }

      if (action === 'mute' && message.member) {
        await message.member.timeout(60000, `AutoMod: ${reason}`).catch(() => null);
      }

      if (action === 'kick' && message.member?.kickable) {
        await message.member.kick(`AutoMod: ${reason}`).catch(() => null);
      }

      if (action === 'ban' && message.member?.bannable) {
        await message.member.ban({ reason: `AutoMod: ${reason}`, deleteMessageSeconds: 86400 }).catch(() => null);
      }

      if (message.guild) {
        await prisma.logEntry.create({
          data: {
            guildId: message.guild.id,
            type: 'automod',
            userId: message.author.id,
            data: { action, reason, channelId: message.channelId },
          },
        });
      }
    } catch (err) {
      logger.error({ err }, 'AutoMod action failed');
    }
  }

  /**
   * Increments the join-surge counter for the guild and returns true when the
   * count exceeds the configured raid threshold within the detection window.
   */
  static async checkRaid(guildId: string, config: AutoModConfig): Promise<boolean> {
    const key = REDIS_KEYS.RAID_TRACKER(guildId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, Math.ceil(config.raidInterval / 1000));
    }

    return count >= config.raidThreshold;
  }

  /**
   * Called on every `guildMemberAdd` event. When the join rate exceeds the
   * configured raid threshold, takes the configured raid action: either kicking
   * the incoming member or raising the guild's verification level to High to
   * prevent new accounts from interacting until the surge subsides.
   */
  static async handleMemberJoin(member: GuildMember): Promise<void> {
    const config = await this.getConfig(member.guild.id);
    if (!config?.antiRaidEnabled) return;

    const isRaid = await this.checkRaid(member.guild.id, config);
    if (!isRaid) return;

    logger.warn(`Anti-raid triggered in guild ${member.guild.id} — action: ${config.raidAction}`);

    try {
      if (config.raidAction === 'kick') {
        if (member.kickable) {
          await member.kick('Anti-raid protection');
        }
      } else {
        // Raising to High verification level blocks accounts younger than 5 minutes
        // from sending messages, which is effective against bot-wave raids without
        // requiring a full server lockdown.
        await member.guild.setVerificationLevel(
          GuildVerificationLevel.High,
          'Anti-raid: surge of joins detected — verification level raised to High',
        );
        logger.warn(`Guild ${member.guild.id} verification level raised to HIGH due to raid detection`);
      }
    } catch (err) {
      logger.error({ err }, 'Anti-raid action failed');
    }
  }
}
