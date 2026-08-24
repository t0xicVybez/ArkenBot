/**
 * Manages all recurring background tasks: birthday notifications, scheduled
 * messages, stats channel updates, temporary ban expiry, reminders, giveaways,
 * stream/social alerts, XP decay, and analytics flushing.
 *
 * Call `start()` once the client is ready and `stop()` during graceful shutdown.
 */

import { EmbedBuilder, type TextChannel, type VoiceChannel } from 'discord.js';
import { computeNextOccurrence } from '@arkenbot/shared';
import { postAnalytics } from '../commands/utility/analytics.js';
import { prisma } from '../database.js';
import { notifyActionFailure } from '../utils/permissionAlert.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
import { logger, swallow} from '../logger.js';
import type { BotClient } from '../client.js';
import { getGuildSettings } from '../utils/settings.js';
import { t, resolveUserLocale } from '../i18n/index.js';
import { XPDecayModule } from './leveling/XPDecayModule.js';
import { LevelingModule } from './leveling/LevelingModule.js';
import { HighlightsModule } from './HighlightsModule.js';
import { ModmailModule } from './modmail/ModmailModule.js';
import { AnalyticsModule } from './AnalyticsModule.js';
import RSSParser from 'rss-parser';

export class BackgroundJobs {
  private client: BotClient;
  private timers: NodeJS.Timeout[] = [];

  constructor(client: BotClient) {
    this.client = client;
  }

  /**
   * Starts all background intervals. Each time-sensitive job (birthdays,
   * scheduled messages, temp ban expiry, reminders, giveaways) also runs once
   * immediately so events that occurred while the bot was offline are not missed.
   *
   * Intervals are registered with a small random jitter (0–5 s) so that on a
   * process restart every recurring job doesn't fire at the exact same wall-clock
   * second, which would create a brief spike of simultaneous DB and Redis load.
   */
  start(): void {
    const jitter = () => Math.floor(Math.random() * 5_000);

    void this.checkBirthdays();
    setTimeout(() => this.timers.push(setInterval(() => void this.checkBirthdays(), 60 * 60 * 1000)), jitter());

    void this.runScheduledMessages();
    setTimeout(() => this.timers.push(setInterval(() => void this.runScheduledMessages(), 60 * 1000)), jitter());

    // Stats channels are voice-channel renames — updates are rate-limited by Discord,
    // so 5-minute polling is a safe floor.
    void this.updateStatsChannels();
    setTimeout(() => this.timers.push(setInterval(() => void this.updateStatsChannels(), 5 * 60 * 1000)), jitter());

    void this.runTempBanExpiry();
    setTimeout(() => this.timers.push(setInterval(() => void this.runTempBanExpiry(), 60 * 1000)), jitter());

    void this.runTempRoleExpiry();
    setTimeout(() => this.timers.push(setInterval(() => void this.runTempRoleExpiry(), 60 * 1000)), jitter());

    void this.runReminders();
    setTimeout(() => this.timers.push(setInterval(() => void this.runReminders(), 60 * 1000)), jitter());

    void this.runGiveaways();
    setTimeout(() => this.timers.push(setInterval(() => void this.runGiveaways(), 60 * 1000)), jitter());

    void this.runStreamAlerts();
    setTimeout(() => this.timers.push(setInterval(() => void this.runStreamAlerts(), 5 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void XPDecayModule.runDecay(), 24 * 60 * 60 * 1000)), jitter());

    setTimeout(() => this.timers.push(setInterval(() => void AnalyticsModule.flushDailyStats(this.client), 24 * 60 * 60 * 1000)), jitter());

    // Weekly analytics reports — fire every 7 days, but only actually post on
    // Mondays (UTC) so restarts mid-week don't double-post.
    setTimeout(() => this.timers.push(setInterval(() => void this.runWeeklyAnalytics(), 7 * 24 * 60 * 60 * 1000)), jitter());

    // Weekly community highlights digest (Monday-gated).
    setTimeout(() => this.timers.push(setInterval(() => void this.runWeeklyHighlights(), 6 * 60 * 60 * 1000)), jitter());

    // Purge data for guilds that left longer than the grace period ago.
    void this.runGuildPurgeSweep();
    setTimeout(() => this.timers.push(setInterval(() => void this.runGuildPurgeSweep(), 60 * 60 * 1000)), jitter());

    // Voice XP: award to eligible members in voice once a minute.
    setTimeout(() => this.timers.push(setInterval(() => void this.runVoiceXp(), 60 * 1000)), jitter());

    // Auto-close idle modmail threads every 15 minutes.
    setTimeout(() => this.timers.push(setInterval(() => void ModmailModule.closeIdleThreads(this.client), 15 * 60 * 1000)), jitter());

    // Heartbeat for the public status page — the API reads this key.
    void this.beatHeartbeat();
    this.timers.push(setInterval(() => void this.beatHeartbeat(), 30 * 1000));

    // Server count on the top.gg listing — only when a token is configured.
    if (process.env.TOPGG_TOKEN) {
      void this.postTopggStats();
      setTimeout(() => this.timers.push(setInterval(() => void this.postTopggStats(), 30 * 60 * 1000)), jitter());
    } else {
      logger.info('TOPGG_TOKEN not set — skipping top.gg stats posting');
    }

    // "You can vote again" DM reminders for opted-in voters.
    setTimeout(() => this.timers.push(setInterval(() => void this.runTopggReminders(), 5 * 60 * 1000)), jitter());

    logger.info('Background jobs started (birthdays, scheduled messages, stats channels, temp bans, temp roles, reminders, giveaways, stream alerts, xp decay, analytics, weekly analytics, guild purge sweep, heartbeat, top.gg stats)');
  }

  /** Posts the current guild count to top.gg so the listing shows real numbers. */
  private async postTopggStats(): Promise<void> {
    const token = process.env.TOPGG_TOKEN;
    if (!token || !this.client.user) return;
    try {
      const res = await fetch(`https://top.gg/api/bots/${this.client.user.id}/stats`, {
        method: 'POST',
        headers: { 'Authorization': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_count: this.client.guilds.cache.size }),
      });
      if (!res.ok) {
        logger.warn(`top.gg stats post failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (err) {
      logger.warn(`top.gg stats post failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * DMs opted-in voters once their 12-hour cooldown has elapsed, so they know
   * they can vote again. `reminderSent` is set to avoid repeat DMs and reset on
   * the next vote.
   */
  private async runTopggReminders(): Promise<void> {
    if (!this.client.user) return;
    try {
      const due = await prisma.topggVoter.findMany({
        where: { remindersOptIn: true, reminderSent: false, eligibleAt: { lte: new Date() } },
        take: 50,
      });
      if (due.length === 0) return;

      const voteUrl = `https://top.gg/bot/${this.client.user.id}/vote`;
      for (const voter of due) {
        try {
          const user = await this.client.users.fetch(voter.userId);
          const loc = await resolveUserLocale({ user: { id: voter.userId } });
          await user.send(
            t('topgg.voteReminder', loc, { bot: this.client.user.username, url: voteUrl }),
          );
        } catch {
          // DMs closed or user gone — mark as sent anyway so we don't retry every cycle.
        }
        await prisma.topggVoter.update({ where: { userId: voter.userId }, data: { reminderSent: true } }).catch(swallow);
      }
    } catch (err) {
      logger.warn({ err }, 'top.gg reminder sweep failed');
    }
  }

  /** Writes a short-lived Redis key so the API can report bot liveness. */
  private async runVoiceXp(): Promise<void> {
    for (const guild of this.client.guilds.cache.values()) {
      await LevelingModule.sweepVoiceXp(guild).catch((err) => logger.error({ err, guildId: guild.id }, 'voice XP sweep failed'));
    }
  }

  private async beatHeartbeat(): Promise<void> {
    try {
      const { pub } = await import('../redis.js');
      await pub.set('bot:heartbeat', JSON.stringify({
        at: Date.now(),
        guilds: this.client.guilds.cache.size,
        ws: this.client.ws.ping,
      }), 'EX', 120);
    } catch { /* redis hiccup — next beat will recover */ }
  }

  /**
   * Permanently deletes all data for guilds whose grace period has elapsed.
   * Guilds that re-added the bot in the meantime have isActive=true again
   * (ensureGuildExists resets it) and are never selected here.
   */
  private async runGuildPurgeSweep(): Promise<void> {
    try {
      const { purgeGuildData, PURGE_GRACE_HOURS } = await import('../utils/guildPurge.js');
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

  /** Clears all active intervals. Call during graceful shutdown. */
  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  // ── Birthday Notifications ──────────────────────────────────────────────────

  private async checkBirthdays(): Promise<void> {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const year = now.getUTCFullYear();

    try {
      const birthdays = await prisma.birthday.findMany({
        where: {
          month,
          day,
          OR: [{ lastNotifiedYear: null }, { lastNotifiedYear: { not: year } }],
        },
      });

      for (const bday of birthdays) {
        await this.sendBirthdayNotification(bday.guildId, bday.userId, year);
      }
    } catch (err) {
      logger.error({ err }, 'Birthday check failed');
    }
  }

  private async sendBirthdayNotification(
    guildId: string,
    userId: string,
    year: number,
  ): Promise<void> {
    try {
      const config = await prisma.birthdayConfig.findUnique({ where: { guildId } });
      if (!config?.enabled || !config.channelId) {
        logger.warn({ guildId, userId }, 'Birthday skipped: config not set or disabled');
        return;
      }

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        logger.warn({ guildId, userId }, 'Birthday skipped: guild not in cache');
        return;
      }

      const member = await guild.members.fetch(userId).catch(swallow);
      if (!member) {
        logger.warn({ guildId, userId }, 'Birthday skipped: member not found');
        return;
      }

      const channel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
      if (!channel?.isTextBased()) {
        logger.warn({ guildId, userId, channelId: config.channelId }, 'Birthday skipped: channel not found or not text-based');
        return;
      }

      const message = config.message.replace(/\{user\}/g, `<@${userId}>`);

      const settings = await getGuildSettings(guildId);
      const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: guild.preferredLocale });
      const birthdayColor = settings?.birthdayColor
        ? (parseInt(settings.birthdayColor.replace('#', ''), 16) as number)
        : 0xffc0cb;

      const notifMsg = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(birthdayColor)
            .setTitle(t('birthday.title', loc))
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(),
        ],
      });

      if (config.birthdayRoleId) {
        const role = guild.roles.cache.get(config.birthdayRoleId);
        if (role && member.roles.cache.has(role.id) === false) {
          await member.roles.add(role, 'Birthday role').catch(swallow);

          // Schedule role removal at midnight UTC so the birthday role lasts
          // exactly one calendar day without needing a separate polling job.
          const msUntilTomorrow =
            new Date(Date.UTC(year, new Date().getUTCMonth(), new Date().getUTCDate() + 1)).getTime() -
            Date.now();
          setTimeout(
            () => member.roles.remove(role, 'Birthday role expired').catch(swallow),
            msUntilTomorrow,
          );
        }
      }

      await prisma.birthday.update({
        where: { guildId_userId: { guildId, userId } },
        data: { lastNotifiedYear: year, notificationMessageId: notifMsg.id, notificationChannelId: notifMsg.channelId },
      });

      logger.info({ guildId, userId }, 'Birthday notification sent');
    } catch (err) {
      logger.error({ err, guildId, userId }, 'Failed to send birthday notification');
    }
  }

  // ── Scheduled Messages ──────────────────────────────────────────────────────

  private async runScheduledMessages(): Promise<void> {
    const now = new Date();

    try {
      const due = await prisma.scheduledMessage.findMany({
        where: {
          enabled: true,
          scheduledAt: { lte: now },
        },
      });

      for (const msg of due) {
        await this.sendScheduledMessage(msg);
      }
    } catch (err) {
      logger.error({ err }, 'Scheduled messages check failed');
    }
  }

  private async sendScheduledMessage(
    msg: Awaited<ReturnType<typeof prisma.scheduledMessage.findFirst>> & object,
  ): Promise<void> {
    if (!msg) return;
    try {
      // Claim the message atomically by matching the expected lastSentAt value.
      // If a concurrent worker already sent it, `count` will be 0 and we abort
      // to prevent duplicate delivery.
      const claimed = await prisma.scheduledMessage.updateMany({
        where: {
          id: msg.id,
          lastSentAt: msg.lastSentAt ?? null,
        },
        data: { lastSentAt: new Date() },
      });
      if (claimed.count === 0) return;

      const guild = this.client.guilds.cache.get(msg.guildId);
      const channel = guild?.channels.cache.get(msg.channelId) as TextChannel | undefined;

      if (!channel?.isTextBased()) {
        await this.recordScheduledFailure(msg.id, 'Channel not found — deleted or the bot lost access');
        return;
      }

      const roleMention = (msg as unknown as { roleMentionId?: string | null }).roleMentionId
        ? `<@&${(msg as unknown as { roleMentionId: string }).roleMentionId}> `
        : '';
      if (msg.embed) {
        const schedSettings = await getGuildSettings(msg.guildId);
        const schedColor = schedSettings?.scheduledMessageColor
          ? parseInt(schedSettings.scheduledMessageColor.replace('#', ''), 16)
          : 0x5865f2;
        await channel.send({
          content: roleMention || undefined,
          embeds: [
            new EmbedBuilder()
              .setDescription(msg.content)
              .setColor(schedColor)
              .setTimestamp(),
          ],
        });
      } else {
        await channel.send({ content: `${roleMention}${msg.content}` });
      }

      // Advance to the next occurrence; disable the record if it has no repeat
      // interval. A successful send also resets the consecutive-failure counter.
      const nextAt = computeNextOccurrence(msg.scheduledAt, msg.repeat ?? null, msg.timezone ?? null, msg.daysOfWeek ?? []);
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: nextAt
          ? { scheduledAt: nextAt, failureCount: 0, lastError: null }
          : { enabled: false, failureCount: 0, lastError: null },
      });

      logger.info({ id: msg.id, guildId: msg.guildId }, 'Scheduled message sent');
    } catch (err) {
      logger.error({ err, id: msg.id }, 'Failed to send scheduled message');
      // Permission-type failures repeat forever until someone fixes the
      // channel — count them and auto-disable instead of retrying every minute.
      const code = (err as { code?: number }).code;
      if (code === 50001 || code === 50013 || code === 10003) {
        const reason = `Discord error ${code}: ${(err as Error).message ?? 'permission denied'}`;
        await this.recordScheduledFailure(msg.id, reason);
      }
    }
  }

  /**
   * Increments a scheduled message's consecutive-failure counter and disables
   * it once the threshold is reached, so broken configurations stop retrying
   * every minute. The counter resets on any successful delivery.
   */
  private async recordScheduledFailure(id: string, reason: string): Promise<void> {
    const MAX_FAILURES = 5;
    try {
      const updated = await prisma.scheduledMessage.update({
        where: { id },
        data: { failureCount: { increment: 1 }, lastError: reason.slice(0, 300) },
        select: { failureCount: true, guildId: true },
      });
      if (updated.failureCount >= MAX_FAILURES) {
        await prisma.scheduledMessage.update({ where: { id }, data: { enabled: false } });
        logger.warn(
          { id, guildId: updated.guildId, failures: updated.failureCount, reason },
          `Scheduled message auto-disabled after ${MAX_FAILURES} consecutive failures`,
        );
      }
    } catch { /* row deleted mid-flight — nothing to record */ }
  }

  // ── Stats Channels ──────────────────────────────────────────────────────────

  private async updateStatsChannels(): Promise<void> {
    try {
      const configs = await prisma.statsChannel.findMany();

      for (const cfg of configs) {
        await this.updateStatsChannel(cfg);
      }
    } catch (err) {
      logger.error({ err }, 'Stats channel update failed');
    }
  }

  private async updateStatsChannel(
    cfg: Awaited<ReturnType<typeof prisma.statsChannel.findFirst>> & object,
  ): Promise<void> {
    if (!cfg) return;
    try {
      const guild = this.client.guilds.cache.get(cfg.guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(cfg.channelId) as VoiceChannel | undefined;
      if (!channel) return;

      let value: string;
      switch (cfg.type) {
        case 'members':
          value = guild.memberCount.toLocaleString();
          break;
        case 'online': {
          // Read from the presence cache rather than bulk-fetching members.
          // Bulk member fetches are rate-limited to one request per guild per 30 s,
          // making them unsuitable for a 5-minute polling interval.
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

  // ── Temp Ban Expiry ─────────────────────────────────────────────────────────

  private async runTempBanExpiry(): Promise<void> {
    const now = new Date();
    try {
      const expired = await prisma.tempBan.findMany({
        where: { unbanned: false, expiresAt: { lte: now } },
      });
      for (const ban of expired) {
        const guild = this.client.guilds.cache.get(ban.guildId);
        if (!guild) continue;
        await guild.bans.remove(ban.userId, 'Temporary ban expired').catch(swallow);
        await prisma.tempBan.update({ where: { id: ban.id }, data: { unbanned: true } });
        logger.info({ guildId: ban.guildId, userId: ban.userId }, 'Temp ban expired and removed');
      }
    } catch (err) {
      logger.error({ err }, 'Temp ban expiry check failed');
    }
  }

  // ── Temp Role Expiry ─────────────────────────────────────────────────────────

  private async runTempRoleExpiry(): Promise<void> {
    const now = new Date();
    try {
      const expired = await db.tempRole.findMany({
        where: { removed: false, expiresAt: { lte: now } },
      });
      for (const tempRole of expired) {
        const guild = this.client.guilds.cache.get(tempRole.guildId);
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

  // ── Reminder Delivery ───────────────────────────────────────────────────────

  private async runReminders(): Promise<void> {
    const now = new Date();
    try {
      const due = await prisma.reminder.findMany({
        where: { sent: false, remindAt: { lte: now } },
      });
      for (const reminder of due) {
        const channel = this.client.channels.cache.get(reminder.channelId);
        if (channel?.isTextBased() && 'send' in channel) {
          const loc = await resolveUserLocale({ user: { id: reminder.userId } });
          await (channel as import('discord.js').TextChannel).send({ content: t('reminders.deliver', loc, { user: `<@${reminder.userId}>`, message: reminder.message }) }).catch(swallow);
        }
        await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
      }
    } catch (err) {
      logger.error({ err }, 'Reminder delivery failed');
    }
  }

  // ── Giveaway Endings ────────────────────────────────────────────────────────

  private async runGiveaways(): Promise<void> {
    const now = new Date();
    try {
      const ended = await prisma.giveaway.findMany({
        where: { ended: false, endsAt: { lte: now } },
      });
      for (const giveaway of ended) {
        await this.endGiveaway(giveaway);
      }
    } catch (err) {
      logger.error({ err }, 'Giveaway check failed');
    }
  }

  private async endGiveaway(giveaway: Awaited<ReturnType<typeof prisma.giveaway.findFirst>> & object): Promise<void> {
    if (!giveaway) return;
    try {
      const guild = this.client.guilds.cache.get(giveaway.guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(giveaway.channelId);
      if (!channel?.isTextBased() || !giveaway.messageId) {
        await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
        return;
      }

      const msg = await channel.messages.fetch(giveaway.messageId).catch(swallow);
      const reaction = msg?.reactions.cache.get('🎉');
      const users = reaction ? await reaction.users.fetch().catch(swallow) : null;
      const eligibleBase = users?.filter(u => !u.bot && u.id !== giveaway.hostId);

      // Filter by required role if set
      const requiredRoleId = (giveaway as Record<string, unknown>).requiredRoleId as string | null | undefined;
      const eligible = requiredRoleId && eligibleBase
        ? eligibleBase.filter((_u: import('discord.js').User, id: string) => guild.members.cache.get(id)?.roles.cache.has(requiredRoleId) ?? false)
        : eligibleBase;

      // Build entries with bonus role duplicates
      let entries = eligible ? [...eligible.values()] : [];
      const bonusRoleEntries = (giveaway as Record<string, unknown>).bonusRoleEntries as Array<{ roleId: string; bonusEntries: number }> | null;
      if (bonusRoleEntries && bonusRoleEntries.length > 0 && eligible) {
        for (const bonus of bonusRoleEntries) {
          for (const user of eligible.values()) {
            if (guild.members.cache.get(user.id)?.roles.cache.has(bonus.roleId)) {
              for (let i = 0; i < bonus.bonusEntries; i++) entries.push(user);
            }
          }
        }
      }

      const loc = await resolveUserLocale({ user: { id: '' }, guildId: giveaway.guildId, guildLocale: guild.preferredLocale });

      let winnerIds: string[] = [];
      let winnerMentions = t('giveaway.noEntrants', loc);

      if (entries.length > 0) {
        const winners = entries.sort(() => Math.random() - 0.5).slice(0, giveaway.winnersCount);
        winnerIds = [...new Set(winners.map(w => w.id))];
        winnerMentions = winnerIds.map(id => `<@${id}>`).join(', ');
      }

      const winnerLabel = winnerIds.length > 1 ? t('giveaway.winnersLabel', loc) : t('giveaway.winnerLabel', loc);

      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true, winnerIds } });

      await channel.send({
        content: t('giveaway.ended', loc, { winnerLabel, winners: winnerMentions, prize: giveaway.prize }),
      });

      if (msg) {
        const { EmbedBuilder } = await import('discord.js');
        const endedEmbed = new EmbedBuilder()
          .setTitle(t('giveaway.endedTitle', loc))
          .setDescription(t('giveaway.endedEmbed', loc, { prize: giveaway.prize, winnerLabel, winners: winnerMentions }))
          .setColor(0x95a5a6)
          .setTimestamp();
        await msg.edit({ embeds: [endedEmbed] }).catch(swallow);
      }

      logger.info({ id: giveaway.id, guildId: giveaway.guildId }, 'Giveaway ended');
    } catch (err) {
      logger.error({ err, id: giveaway?.id }, 'Failed to end giveaway');
    }
  }

  // ── Stream Alerts ────────────────────────────────────────────────────────────

  private async runStreamAlerts(): Promise<void> {
    const twitchClientId = process.env.TWITCH_CLIENT_ID;
    const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;

    try {
      const alerts = await prisma.streamAlert.findMany({ where: { enabled: true } });
      if (!alerts.length) return;

      // YouTube alerts are deduplicated by channel — one pair of API calls per
      // unique channel serves every server watching that creator.
      const youtubeAlerts = alerts.filter((a) => a.platform === 'youtube');
      const otherAlerts = alerts.filter((a) => a.platform !== 'youtube');

      if (youtubeAlerts.length > 0 && youtubeApiKey) {
        await this.runYouTubeAlerts(youtubeAlerts, youtubeApiKey);
      }

      // Obtain a Twitch app token once up-front so every Twitch alert in this
      // cycle can reuse it rather than each alert hitting the token endpoint.
      let twitchToken: string | null = null;
      if (twitchClientId && twitchClientSecret && otherAlerts.some((a) => a.platform === 'twitch')) {
        const tokenRes = await fetch(
          `https://id.twitch.tv/oauth2/token?client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`,
          { method: 'POST' },
        ).catch(swallow);
        if (tokenRes?.ok) {
          const tokenData = await tokenRes.json() as { access_token: string };
          twitchToken = tokenData.access_token;
        }
      }

      const rssParser = new RSSParser();

      // Process alerts in parallel batches of 5 so we don't hammer external APIs
      // with all requests at once while still being much faster than sequential.
      const BATCH = 5;
      for (let i = 0; i < otherAlerts.length; i += BATCH) {
        await Promise.allSettled(
          otherAlerts.slice(i, i + BATCH).map((alert) =>
            this.processStreamAlert(alert, twitchClientId ?? null, twitchClientSecret ?? null, twitchToken, rssParser),
          ),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Stream alerts check failed');
    }
  }

  // ── YouTube Live Alerts ─────────────────────────────────────────────────────

  private async runYouTubeAlerts(
    alerts: Awaited<ReturnType<typeof prisma.streamAlert.findMany>>,
    apiKey: string,
  ): Promise<void> {
    // Resolve channel IDs lazily for any alert that hasn't been resolved yet.
    for (const alert of alerts) {
      if (alert.channelId) continue;
      try {
        const handle = alert.channelUsername.replace(/^@/, '');
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
        ).catch(swallow);
        if (!res?.ok) continue;
        const data = await res.json() as { items?: Array<{ id: string }> };
        const channelId = data.items?.[0]?.id;
        if (!channelId) continue;
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { channelId } });
        alert.channelId = channelId;
        logger.info({ alertId: alert.id, channelId }, 'Resolved YouTube channel ID');
      } catch (err) {
        logger.error({ err, alertId: alert.id }, 'Failed to resolve YouTube channel ID');
      }
    }

    // Group resolved alerts by unique channelId — one API call pair per channel.
    const byChannel = new Map<string, typeof alerts>();
    for (const alert of alerts) {
      if (!alert.channelId) continue;
      const group = byChannel.get(alert.channelId) ?? [];
      group.push(alert);
      byChannel.set(alert.channelId, group);
    }

    for (const [channelId, channelAlerts] of byChannel) {
      try {
        // The uploads playlist ID is always derived from the channel ID (UC→UU).
        const uploadsPlaylistId = `UU${channelId.slice(2)}`;

        const playlistRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5&key=${apiKey}`,
        ).catch(swallow);
        if (!playlistRes?.ok) continue;

        const playlistData = await playlistRes.json() as {
          items?: Array<{ snippet: { resourceId: { videoId: string } } }>;
        };
        const videoIds = (playlistData.items ?? [])
          .map((i) => i.snippet?.resourceId?.videoId)
          .filter(Boolean) as string[];
        if (!videoIds.length) continue;

        const videosRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${videoIds.join(',')}&key=${apiKey}`,
        ).catch(swallow);
        if (!videosRes?.ok) continue;

        const videosData = await videosRes.json() as {
          items?: Array<{
            id: string;
            snippet: {
              title: string;
              channelTitle: string;
              liveBroadcastContent: string;
              thumbnails: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } };
            };
          }>;
        };

        const liveVideo = videosData.items?.find(
          (v) => v.snippet.liveBroadcastContent === 'live',
        ) ?? null;

        for (const alert of channelAlerts) {
          await this.processYouTubeAlert(alert, liveVideo);
        }
      } catch (err) {
        logger.error({ err, channelId }, 'YouTube channel live check failed');
      }
    }

    // YouTube ToS compliance: purge any lastStreamId that has been stored for >30 days.
    // Under normal operation, lastStreamId is cleared within minutes of a stream ending;
    // this is a safety net for edge cases (bot outage, etc.).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.streamAlert.updateMany({
      where: { platform: 'youtube', lastStreamId: { not: null }, createdAt: { lt: thirtyDaysAgo } },
      data: { lastStreamId: null },
    }).catch((err: unknown) => logger.warn({ err }, 'YouTube 30-day lastStreamId cleanup failed'));
  }

  private async processYouTubeAlert(
    alert: Awaited<ReturnType<typeof prisma.streamAlert.findFirst>> & object,
    liveVideo: {
      id: string;
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } };
      };
    } | null,
  ): Promise<void> {
    try {
      if (!liveVideo) {
        if (alert.lastStreamId) {
          await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: null } });
        }
        return;
      }

      if (liveVideo.id === alert.lastStreamId) return;
      await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: liveVideo.id } });

      const guild = this.client.guilds.cache.get(alert.guildId);
      if (!guild) return;
      const channel = guild.channels.cache.get(alert.discordChannelId) as TextChannel | undefined;
      if (!channel?.isTextBased()) {
        await this.recordAlertFailure(alert.id, 'Channel not found — deleted or the bot lost access');
        return;
      }

      const alertSettings = await getGuildSettings(alert.guildId);
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: alert.guildId });
      const alertColor = alertSettings?.streamAlertColor
        ? parseInt(alertSettings.streamAlertColor.replace('#', ''), 16)
        : null;

      const videoUrl = `https://www.youtube.com/watch?v=${liveVideo.id}`;
      const channelName = liveVideo.snippet.channelTitle;
      const streamTitle = liveVideo.snippet.title;
      const thumbnail =
        liveVideo.snippet.thumbnails.maxres?.url ??
        liveVideo.snippet.thumbnails.high?.url ??
        liveVideo.snippet.thumbnails.medium?.url ??
        null;

      const message = alert.message
        .replace(/\{streamer\}/g, channelName)
        .replace(/\{url\}/g, videoUrl)
        .replace(/\{title\}/g, streamTitle)
        .replace(/\{game\}/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const embed = new EmbedBuilder()
        .setTitle(t('streamAlert.youtubeLive', loc, { streamer: channelName }))
        .setDescription(streamTitle)
        .setURL(videoUrl)
        .setColor(alertColor ?? 0xff0000)
        .setFooter({ text: 'YouTube' })
        .setTimestamp();

      if (thumbnail) embed.setImage(thumbnail);

      const alertMsg = await channel.send({ content: message, embeds: [embed] });
      await prisma.streamAlert.update({
        where: { id: alert.id },
        data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId, failureCount: 0, lastError: null },
      }).catch(swallow);
      logger.info({ guildId: alert.guildId, channelId: alert.channelId }, 'YouTube live alert sent');
    } catch (err) {
      logger.error({ err, alertId: alert.id }, 'Failed to process YouTube alert');
      await this.recordAlertPermissionFailure(alert.id, err);
    }
  }

  private async processStreamAlert(
    alert: Awaited<ReturnType<typeof prisma.streamAlert.findFirst>> & object,
    twitchClientId: string | null,
    twitchClientSecret: string | null,
    twitchToken: string | null,
    rssParser: RSSParser,
  ): Promise<void> {
    if (!alert) return;
    try {
      const guild = this.client.guilds.cache.get(alert.guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(alert.discordChannelId) as TextChannel | undefined;
      if (!channel?.isTextBased()) {
        await this.recordAlertFailure(alert.id, 'Channel not found — deleted or the bot lost access');
        return;
      }

      const alertSettings = await getGuildSettings(alert.guildId);
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: alert.guildId });
      const alertColor = alertSettings?.streamAlertColor
        ? parseInt(alertSettings.streamAlertColor.replace('#', ''), 16)
        : null;

      if (alert.platform === 'twitch' && twitchClientId && twitchToken) {
        const res = await fetch(
          `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(alert.channelUsername)}`,
          { headers: { 'Client-ID': twitchClientId, 'Authorization': `Bearer ${twitchToken}` } },
        );
        const data = await res.json() as { data: Array<{ id: string; title: string; game_name: string; thumbnail_url: string }> };
        const stream = data.data?.[0];

        if (!stream) {
          if (alert.lastStreamId) {
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: null } });
          }
          return;
        }

        if (stream.id === alert.lastStreamId) return;
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: stream.id } });

        const message = alert.message
          .replace(/\{streamer\}/g, alert.channelUsername)
          .replace(/\{url\}/g, `https://twitch.tv/${alert.channelUsername}`)
          .replace(/\{title\}/g, stream.title)
          .replace(/\{game\}/g, stream.game_name);

        const previewUrl = stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360');

        const embed = new EmbedBuilder()
          .setTitle(t('streamAlert.twitchLive', loc, { streamer: alert.channelUsername }))
          .setDescription(stream.title)
          .addFields({ name: t('streamAlert.playing', loc), value: stream.game_name || t('streamAlert.unknownGame', loc) })
          .setURL(`https://twitch.tv/${alert.channelUsername}`)
          .setColor(alertColor ?? 0x9146ff)
          .setImage(previewUrl)
          .setTimestamp();

        const alertMsg = await channel.send({ content: message, embeds: [embed] });
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId, failureCount: 0, lastError: null } }).catch(swallow);
        logger.info({ guildId: alert.guildId, streamer: alert.channelUsername }, 'Twitch stream alert sent');

      } else if (alert.platform === 'kick') {
        const res = await fetch(
          `https://kick.com/api/v2/channels/${encodeURIComponent(alert.channelUsername)}`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'ArkenBot/1.0' } },
        );
        if (!res.ok) return;
        const data = await res.json() as { livestream?: { id: number; session_title: string } | null };

        if (!data.livestream) {
          if (alert.lastStreamId) {
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: null } });
          }
          return;
        }

        const streamId = String(data.livestream.id);
        if (streamId === alert.lastStreamId) return;
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: streamId } });

        const kickUrl = `https://kick.com/${alert.channelUsername}`;
        const message = alert.message
          .replace(/\{streamer\}/g, alert.channelUsername)
          .replace(/\{url\}/g, kickUrl)
          .replace(/\{title\}/g, data.livestream.session_title);

        const embed = new EmbedBuilder()
          .setTitle(t('streamAlert.kickLive', loc, { streamer: alert.channelUsername }))
          .setDescription(data.livestream.session_title)
          .setURL(kickUrl)
          .setColor(alertColor ?? 0x53fc18)
          .setTimestamp();

        const alertMsg = await channel.send({ content: message, embeds: [embed] });
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId, failureCount: 0, lastError: null } }).catch(swallow);
        logger.info({ guildId: alert.guildId, streamer: alert.channelUsername }, 'Kick stream alert sent');

      } else if (alert.platform === 'rss') {
        // For RSS/Podcast alerts, `channelUsername` stores the feed URL rather
        // than a platform username, as there is no separate channel concept.
        const feed = await rssParser.parseURL(alert.channelUsername).catch(swallow);
        if (!feed) return;

        const latestItem = feed.items?.[0];
        if (!latestItem) return;

        const itemId = latestItem.guid ?? latestItem.link ?? latestItem.title ?? '';
        if (!itemId || itemId === alert.lastStreamId) return;

        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: itemId } });

        const itemUrl = latestItem.link ?? alert.channelUsername;
        const feedTitle = feed.title ?? t('streamAlert.rssFeedFallback', loc);
        const postFallback = t('streamAlert.rssPostFallback', loc);
        const message = alert.message
          .replace(/\{streamer\}/g, feedTitle)
          .replace(/\{url\}/g, itemUrl)
          .replace(/\{title\}/g, latestItem.title ?? postFallback);

        const embed = new EmbedBuilder()
          .setTitle(latestItem.title ?? postFallback)
          .setURL(itemUrl)
          .setDescription(t('streamAlert.rssNewPost', loc, { feed: feedTitle }))
          .setColor(alertColor ?? 0xf26522)
          .setTimestamp();

        const alertMsg = await channel.send({ content: message, embeds: [embed] });
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId, failureCount: 0, lastError: null } }).catch(swallow);
        logger.info({ guildId: alert.guildId, feed: alert.channelUsername }, 'RSS/Podcast alert sent');
      }
    } catch (err) {
      logger.error({ err, alertId: alert.id }, 'Failed to process stream alert');
      await this.recordAlertPermissionFailure(alert.id, err);
    }
  }

  /**
   * Counts a failure only when Discord says the bot cannot post to the channel.
   * Feed and upstream-API errors are transient and must not disable an alert.
   */
  private async recordAlertPermissionFailure(id: string, err: unknown): Promise<void> {
    const code = (err as { code?: number }).code;
    if (code !== 50001 && code !== 50013 && code !== 10003) return;
    await this.recordAlertFailure(id, `Discord error ${code}: ${(err as Error).message ?? 'permission denied'}`);
    // On a genuine missing-permission error, also ping the guild's alert role.
    if (code === 50013 || code === 50001) {
      const alert = await prisma.streamAlert
        .findUnique({ where: { id }, select: { guildId: true, discordChannelId: true } })
        .catch(() => null);
      const guild = alert ? this.client.guilds.cache.get(alert.guildId) : null;
      if (guild && alert) {
        await notifyActionFailure(guild, {
          action: 'feedPost',
          error: err,
          requiredPermission: 'Send Messages / Embed Links',
          channelId: alert.discordChannelId,
        });
      }
    }
  }

  /**
   * Increments a stream alert's consecutive-failure counter and disables it once
   * the threshold is reached. Without this, an alert pointed at a channel the bot
   * can no longer see retries every 5 minutes forever. Reset on any successful send.
   */
  private async recordAlertFailure(id: string, reason: string): Promise<void> {
    const MAX_FAILURES = 5;
    try {
      const updated = await prisma.streamAlert.update({
        where: { id },
        data: { failureCount: { increment: 1 }, lastError: reason.slice(0, 300) },
        select: { failureCount: true, guildId: true, platform: true, channelUsername: true },
      });
      if (updated.failureCount >= MAX_FAILURES) {
        await prisma.streamAlert.update({ where: { id }, data: { enabled: false } });
        logger.warn(
          { id, guildId: updated.guildId, platform: updated.platform, feed: updated.channelUsername, failures: updated.failureCount, reason },
          `Stream alert auto-disabled after ${MAX_FAILURES} consecutive failures`,
        );
      }
    } catch { /* row deleted mid-flight — nothing to record */ }
  }

  // ── Weekly Analytics Reports ─────────────────────────────────────────────

  private async runWeeklyHighlights(): Promise<void> {
    // Only post on Mondays (UTC) so a restart during the week doesn't repeat it.
    if (new Date().getUTCDay() !== 1) return;
    const configs = await prisma.guildSettings.findMany({ where: { highlightsEnabled: true, highlightsChannelId: { not: null } }, select: { guildId: true } }).catch(() => []);
    for (const cfg of configs) {
      const guild = this.client.guilds.cache.get(cfg.guildId);
      if (!guild) continue;
      await HighlightsModule.postDigest(guild).catch((err) => logger.error({ err, guildId: cfg.guildId }, 'highlights digest failed'));
    }
  }

  private async runWeeklyAnalytics(): Promise<void> {
    // Only post on Mondays (UTC day 1) so mid-week restarts don't double-post.
    if (new Date().getUTCDay() !== 1) return;

    const configs = await prisma.guildSettings.findMany({
      where: { analyticsChannelId: { not: null } },
      select: { guildId: true, analyticsChannelId: true },
    });

    for (const cfg of configs) {
      try {
        const channel = await this.client.channels.fetch(cfg.analyticsChannelId!);
        if (!channel?.isTextBased()) continue;
        await postAnalytics(cfg.guildId, channel as TextChannel);
      } catch (err) {
        logger.error({ err, guildId: cfg.guildId }, 'Failed to send weekly analytics report');
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Computes the next fire time for a repeating scheduled message relative to its
 * previous `base` timestamp. Returns `null` for one-shot messages or unrecognised
 * repeat values, which causes the caller to disable the record.
 */
