
/**
 * Polls the services we watch for new content and posts alerts. Runs every few
 * minutes: Twitch/Kick go-lives, plus Reddit (delegated to RedditAlerts) and
 * other RSS-based feeds. YouTube has its own push-based path (YouTubeAlerts),
 * so it's excluded here.
 */
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';
import { notifyActionFailure } from '../../utils/permissionAlert.js';
import { runRedditAlerts } from '../streamAlerts/RedditAlerts.js';
import RSSParser from 'rss-parser';
import type { BotClient } from '../../client.js';

export async function runStreamAlerts(client: BotClient): Promise<void> {
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;

  try {

    void runRedditAlerts(client).catch((err) => logger.error({ err }, 'Reddit alerts check failed'));
    const otherAlerts = await prisma.streamAlert.findMany({
      where: { enabled: true, platform: { notIn: ['youtube', 'reddit'] } },
    });
    if (!otherAlerts.length) return;

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

    const BATCH = 5;
    for (let i = 0; i < otherAlerts.length; i += BATCH) {
      await Promise.allSettled(
        otherAlerts.slice(i, i + BATCH).map((alert) =>
          processStreamAlert(client, alert, twitchClientId ?? null, twitchClientSecret ?? null, twitchToken, rssParser),
        ),
      );
    }
  } catch (err) {
    logger.error({ err }, 'Stream alerts check failed');
  }
}

async function processStreamAlert(
  client: BotClient,
  alert: Awaited<ReturnType<typeof prisma.streamAlert.findFirst>> & object,
  twitchClientId: string | null,
  twitchClientSecret: string | null,
  twitchToken: string | null,
  rssParser: RSSParser,
): Promise<void> {
  if (!alert) return;
  try {
    const guild = client.guilds.cache.get(alert.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(alert.discordChannelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      await recordAlertFailure(alert.id, 'Channel not found — deleted or the bot lost access');
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

        .replace(/\{feed\}/g, feedTitle)
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
    await recordAlertPermissionFailure(client, alert.id, err);
  }
}

async function recordAlertPermissionFailure(client: BotClient, id: string, err: unknown): Promise<void> {
  const code = (err as { code?: number }).code;
  if (code !== 50001 && code !== 50013 && code !== 10003) return;
  await recordAlertFailure(id, `Discord error ${code}: ${(err as Error).message ?? 'permission denied'}`);

  if (code === 50013 || code === 50001) {
    const alert = await prisma.streamAlert
      .findUnique({ where: { id }, select: { guildId: true, discordChannelId: true } })
      .catch(() => null);
    const guild = alert ? client.guilds.cache.get(alert.guildId) : null;
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

async function recordAlertFailure(id: string, reason: string): Promise<void> {
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
  } catch {  }
}
