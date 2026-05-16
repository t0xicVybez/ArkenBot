/**
 * Manages all recurring background tasks: birthday notifications, scheduled
 * messages, stats channel updates, temporary ban expiry, reminders, giveaways,
 * stream/social alerts, XP decay, and analytics flushing.
 *
 * Call `start()` once the client is ready and `stop()` during graceful shutdown.
 */

import { EmbedBuilder, type TextChannel, type VoiceChannel } from 'discord.js';
import { prisma } from '../database.js';
import { logger } from '../logger.js';
import type { BotClient } from '../client.js';
import { getGuildSettings } from '../utils/settings.js';
import { XPDecayModule } from './leveling/XPDecayModule.js';
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
   */
  start(): void {
    void this.checkBirthdays();
    this.timers.push(setInterval(() => void this.checkBirthdays(), 60 * 60 * 1000));

    this.timers.push(setInterval(() => void this.runScheduledMessages(), 60 * 1000));
    void this.runScheduledMessages();

    // Stats channels are voice-channel renames — updates are rate-limited by Discord,
    // so 5-minute polling is a safe floor.
    this.timers.push(setInterval(() => void this.updateStatsChannels(), 5 * 60 * 1000));
    void this.updateStatsChannels();

    this.timers.push(setInterval(() => void this.runTempBanExpiry(), 60 * 1000));
    void this.runTempBanExpiry();

    this.timers.push(setInterval(() => void this.runReminders(), 60 * 1000));
    void this.runReminders();

    this.timers.push(setInterval(() => void this.runGiveaways(), 60 * 1000));
    void this.runGiveaways();

    this.timers.push(setInterval(() => void this.runStreamAlerts(), 5 * 60 * 1000));

    this.timers.push(setInterval(() => void XPDecayModule.runDecay(), 24 * 60 * 60 * 1000));

    this.timers.push(setInterval(() => void AnalyticsModule.flushDailyStats(this.client), 24 * 60 * 60 * 1000));

    logger.info('Background jobs started (birthdays, scheduled messages, stats channels, temp bans, reminders, giveaways, stream alerts, xp decay, analytics)');
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

      const member = await guild.members.fetch(userId).catch(() => null);
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
      const birthdayColor = settings?.birthdayColor
        ? (parseInt(settings.birthdayColor.replace('#', ''), 16) as number)
        : 0xffc0cb;

      const notifMsg = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(birthdayColor)
            .setTitle('🎂 Happy Birthday!')
            .setDescription(message)
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp(),
        ],
      });

      if (config.birthdayRoleId) {
        const role = guild.roles.cache.get(config.birthdayRoleId);
        if (role && member.roles.cache.has(role.id) === false) {
          await member.roles.add(role, 'Birthday role').catch(() => null);

          // Schedule role removal at midnight UTC so the birthday role lasts
          // exactly one calendar day without needing a separate polling job.
          const msUntilTomorrow =
            new Date(Date.UTC(year, new Date().getUTCMonth(), new Date().getUTCDate() + 1)).getTime() -
            Date.now();
          setTimeout(
            () => member.roles.remove(role, 'Birthday role expired').catch(() => null),
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

      if (channel?.isTextBased()) {
        if (msg.embed) {
          const schedSettings = await getGuildSettings(msg.guildId);
          const schedColor = schedSettings?.scheduledMessageColor
            ? parseInt(schedSettings.scheduledMessageColor.replace('#', ''), 16)
            : 0x5865f2;
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setDescription(msg.content)
                .setColor(schedColor)
                .setTimestamp(),
            ],
          });
        } else {
          await channel.send({ content: msg.content });
        }
      }

      // Advance to the next occurrence; disable the record if it has no repeat interval.
      const nextAt = getNextOccurrence(msg.scheduledAt, msg.repeat ?? null);
      if (nextAt) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { scheduledAt: nextAt },
        });
      } else {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { enabled: false },
        });
      }

      logger.info({ id: msg.id, guildId: msg.guildId }, 'Scheduled message sent');
    } catch (err) {
      logger.error({ err, id: msg.id }, 'Failed to send scheduled message');
    }
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
        await channel.setName(newName, 'Stats channel update').catch(() => null);
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
        await guild.bans.remove(ban.userId, 'Temporary ban expired').catch(() => null);
        await prisma.tempBan.update({ where: { id: ban.id }, data: { unbanned: true } });
        logger.info({ guildId: ban.guildId, userId: ban.userId }, 'Temp ban expired and removed');
      }
    } catch (err) {
      logger.error({ err }, 'Temp ban expiry check failed');
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
          await (channel as import('discord.js').TextChannel).send({ content: `<@${reminder.userId}> Reminder: ${reminder.message}` }).catch(() => null);
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

      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      const reaction = msg?.reactions.cache.get('🎉');
      const users = reaction ? await reaction.users.fetch().catch(() => null) : null;
      const eligible = users?.filter(u => !u.bot && u.id !== giveaway.hostId) ?? new Map();
      const entries = [...eligible.values()];

      let winnerIds: string[] = [];
      let winnerMentions = 'No eligible entrants';

      if (entries.length > 0) {
        const winners = entries.sort(() => Math.random() - 0.5).slice(0, giveaway.winnersCount);
        winnerIds = winners.map(w => w.id);
        winnerMentions = winners.map(w => `<@${w.id}>`).join(', ');
      }

      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true, winnerIds } });

      await channel.send({
        content: `🎉 Giveaway ended! Winner${winnerIds.length > 1 ? 's' : ''}: ${winnerMentions}\nPrize: **${giveaway.prize}**`,
      });

      if (msg) {
        const { EmbedBuilder } = await import('discord.js');
        const endedEmbed = new EmbedBuilder()
          .setTitle('🎉 Giveaway Ended')
          .setDescription(`**Prize:** ${giveaway.prize}\n**Winner${winnerIds.length > 1 ? 's' : ''}:** ${winnerMentions}`)
          .setColor(0x95a5a6)
          .setTimestamp();
        await msg.edit({ embeds: [endedEmbed] }).catch(() => null);
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
    const twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;

    try {
      const alerts = await prisma.streamAlert.findMany({ where: { enabled: true } });
      if (!alerts.length) return;

      let twitchToken: string | null = null;
      const rssParser = new RSSParser();

      for (const alert of alerts) {
        const guild = this.client.guilds.cache.get(alert.guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(alert.discordChannelId) as TextChannel | undefined;
        if (!channel?.isTextBased()) continue;

        const alertSettings = await getGuildSettings(alert.guildId);
        const alertColor = alertSettings?.streamAlertColor
          ? parseInt(alertSettings.streamAlertColor.replace('#', ''), 16)
          : null;

        try {
          if (alert.platform === 'twitch' && twitchClientId && twitchClientSecret) {
            // Obtain an app access token once per polling cycle and reuse it for
            // all Twitch alerts to avoid hitting the token endpoint repeatedly.
            if (!twitchToken) {
              const tokenRes = await fetch(
                `https://id.twitch.tv/oauth2/token?client_id=${twitchClientId}&client_secret=${twitchClientSecret}&grant_type=client_credentials`,
                { method: 'POST' },
              );
              const tokenData = await tokenRes.json() as { access_token: string };
              twitchToken = tokenData.access_token;
            }

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
              continue;
            }

            if (stream.id === alert.lastStreamId) continue;

            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: stream.id } });

            const message = alert.message
              .replace(/\{streamer\}/g, alert.channelUsername)
              .replace(/\{url\}/g, `https://twitch.tv/${alert.channelUsername}`)
              .replace(/\{title\}/g, stream.title)
              .replace(/\{game\}/g, stream.game_name);

            const previewUrl = stream.thumbnail_url
              .replace('{width}', '640')
              .replace('{height}', '360');

            const embed = new EmbedBuilder()
              .setTitle(`${alert.channelUsername} is live on Twitch!`)
              .setDescription(stream.title)
              .addFields({ name: 'Playing', value: stream.game_name || 'Unknown' })
              .setURL(`https://twitch.tv/${alert.channelUsername}`)
              .setColor(alertColor ?? 0x9146ff)
              .setImage(previewUrl)
              .setTimestamp();

            const alertMsg = await channel.send({ content: message, embeds: [embed] });
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId } }).catch(() => null);
            logger.info({ guildId: alert.guildId, streamer: alert.channelUsername }, 'Twitch stream alert sent');

          } else if (alert.platform === 'kick') {
            const res = await fetch(
              `https://kick.com/api/v2/channels/${encodeURIComponent(alert.channelUsername)}`,
              { headers: { 'Accept': 'application/json', 'User-Agent': 'ArkenBot/1.0' } },
            );
            if (!res.ok) continue;
            const data = await res.json() as { livestream?: { id: number; session_title: string } | null };

            if (!data.livestream) {
              if (alert.lastStreamId) {
                await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: null } });
              }
              continue;
            }

            const streamId = String(data.livestream.id);
            if (streamId === alert.lastStreamId) continue;

            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: streamId } });

            const kickUrl = `https://kick.com/${alert.channelUsername}`;
            const message = alert.message
              .replace(/\{streamer\}/g, alert.channelUsername)
              .replace(/\{url\}/g, kickUrl)
              .replace(/\{title\}/g, data.livestream.session_title);

            const embed = new EmbedBuilder()
              .setTitle(`${alert.channelUsername} is live on Kick!`)
              .setDescription(data.livestream.session_title)
              .setURL(kickUrl)
              .setColor(alertColor ?? 0x53fc18)
              .setTimestamp();

            const alertMsg = await channel.send({ content: message, embeds: [embed] });
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId } }).catch(() => null);
            logger.info({ guildId: alert.guildId, streamer: alert.channelUsername }, 'Kick stream alert sent');

          } else if (alert.platform === 'twitter' && twitterBearerToken) {
            // Twitter's v2 timeline endpoint requires a numeric user ID. On the
            // first alert check, resolve the handle to an ID and persist it so
            // subsequent runs skip the lookup.
            let resolvedUserId = alert.channelId;
            if (!resolvedUserId) {
              const username = alert.channelUsername.replace(/^@/, '');
              const userRes = await fetch(
                `https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`,
                { headers: { 'Authorization': `Bearer ${twitterBearerToken}` } },
              );
              const userData = await userRes.json() as { data?: { id: string } };
              resolvedUserId = userData.data?.id ?? null;
              if (resolvedUserId) {
                await prisma.streamAlert.update({ where: { id: alert.id }, data: { channelId: resolvedUserId } });
              } else {
                logger.warn({ channelUsername: alert.channelUsername }, 'Could not resolve Twitter user ID — skipping');
                continue;
              }
            }

            const tweetsRes = await fetch(
              `https://api.twitter.com/2/users/${resolvedUserId}/tweets?max_results=5&exclude=retweets,replies`,
              { headers: { 'Authorization': `Bearer ${twitterBearerToken}` } },
            );
            const tweetsData = await tweetsRes.json() as { data?: Array<{ id: string; text: string }> };
            const latestTweet = tweetsData.data?.[0];

            if (!latestTweet || latestTweet.id === alert.lastStreamId) continue;

            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: latestTweet.id } });

            const tweetUrl = `https://x.com/${alert.channelUsername.replace(/^@/, '')}/status/${latestTweet.id}`;
            const handle = alert.channelUsername.startsWith('@') ? alert.channelUsername : `@${alert.channelUsername}`;
            const message = alert.message
              .replace(/\{streamer\}/g, handle)
              .replace(/\{url\}/g, tweetUrl)
              .replace(/\{title\}/g, latestTweet.text);

            const embed = new EmbedBuilder()
              .setTitle(`${handle} posted on X`)
              .setDescription(latestTweet.text)
              .setURL(tweetUrl)
              .setColor(alertColor ?? 0x000000)
              .setTimestamp();

            const alertMsg = await channel.send({ content: message, embeds: [embed] });
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId } }).catch(() => null);
            logger.info({ guildId: alert.guildId, streamer: alert.channelUsername }, 'Twitter/X alert sent');

          } else if (alert.platform === 'reddit') {
            const subreddit = alert.channelUsername.replace(/^r\//, '');
            const res = await fetch(
              `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=5`,
              { headers: { 'User-Agent': 'ArkenBot/1.0' } },
            );
            if (!res.ok) continue;
            const data = await res.json() as { data?: { children?: Array<{ data: { id: string; title: string; permalink: string; author: string } }> } };
            const latestPost = data.data?.children?.[0]?.data;

            if (!latestPost || latestPost.id === alert.lastStreamId) continue;

            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: latestPost.id } });

            const postUrl = `https://reddit.com${latestPost.permalink}`;
            const message = alert.message
              .replace(/\{streamer\}/g, `r/${subreddit}`)
              .replace(/\{url\}/g, postUrl)
              .replace(/\{title\}/g, latestPost.title)
              .replace(/\{author\}/g, latestPost.author);

            const embed = new EmbedBuilder()
              .setTitle(latestPost.title)
              .setURL(postUrl)
              .setDescription(`Posted by u/${latestPost.author} in r/${subreddit}`)
              .setColor(alertColor ?? 0xff4500)
              .setTimestamp();

            const alertMsg = await channel.send({ content: message, embeds: [embed] });
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId } }).catch(() => null);
            logger.info({ guildId: alert.guildId, subreddit }, 'Reddit post alert sent');

          } else if (alert.platform === 'rss') {
            // For RSS/Podcast alerts, `channelUsername` stores the feed URL rather
            // than a platform username, as there is no separate channel concept.
            const feed = await rssParser.parseURL(alert.channelUsername).catch(() => null);
            if (!feed) continue;

            const latestItem = feed.items?.[0];
            if (!latestItem) continue;

            const itemId = latestItem.guid ?? latestItem.link ?? latestItem.title ?? '';
            if (!itemId || itemId === alert.lastStreamId) continue;

            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: itemId } });

            const itemUrl = latestItem.link ?? alert.channelUsername;
            const feedTitle = feed.title ?? 'RSS Feed';
            const message = alert.message
              .replace(/\{streamer\}/g, feedTitle)
              .replace(/\{url\}/g, itemUrl)
              .replace(/\{title\}/g, latestItem.title ?? 'New post');

            const embed = new EmbedBuilder()
              .setTitle(latestItem.title ?? 'New post')
              .setURL(itemUrl)
              .setDescription(`New post from **${feedTitle}**`)
              .setColor(alertColor ?? 0xf26522)
              .setTimestamp();

            const alertMsg = await channel.send({ content: message, embeds: [embed] });
            await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastMessageId: alertMsg.id, lastMessageChannelId: alertMsg.channelId } }).catch(() => null);
            logger.info({ guildId: alert.guildId, feed: alert.channelUsername }, 'RSS/Podcast alert sent');
          }
        } catch (err) {
          logger.error({ err, alertId: alert.id }, 'Failed to check stream alert');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Stream alerts check failed');
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Computes the next fire time for a repeating scheduled message relative to its
 * previous `base` timestamp. Returns `null` for one-shot messages or unrecognised
 * repeat values, which causes the caller to disable the record.
 */
function getNextOccurrence(base: Date, repeat: string | null): Date | null {
  if (!repeat) return null;
  const next = new Date(base);
  switch (repeat) {
    case 'hourly':  next.setUTCHours(next.getUTCHours() + 1); break;
    case 'daily':   next.setUTCDate(next.getUTCDate() + 1); break;
    case 'weekly':  next.setUTCDate(next.getUTCDate() + 7); break;
    default:        return null;
  }
  return next;
}
