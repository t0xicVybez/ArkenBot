/**
 * YouTube stream/upload alerts — WebSub-driven fan-out plus backstop polls.
 *
 * Detection is push-based: the API's PubSubHubbub callback publishes Redis
 * `youtube:live` / `youtube:upload` events, which `handleYouTubeEvent` fans out
 * to every guild watching that channel (0-quota for idle channels). Two polls
 * back it up within a strict daily quota budget:
 *   - `pollUpcoming`  — tracks scheduled streams until they go live.
 *   - `pollSafetyNet` — round-robins channels to catch any missed push.
 * Both simply publish the same Redis events, so all posting flows through one
 * deduplicated fan-out path.
 */
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { redis, pub } from '../../redis.js';
import { logger, swallow } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';

/** Leave ~15k of the 60k/day cap as headroom; polls stop when we cross this. */
const QUOTA_BUDGET = parseInt(process.env.YOUTUBE_QUOTA_BUDGET ?? '45000', 10);
const YT = 'https://www.googleapis.com/youtube/v3';

type AlertRow = Awaited<ReturnType<typeof prisma.streamAlert.findFirst>> & object;
type VideoInfo = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
  live: boolean;
  upcoming: boolean;
  isStream: boolean;
};
type EventKind = 'live' | 'upload';

// ── Quota metering (shared Redis counter with the API) ────────────────────────

function quotaKey(): string {
  return `youtube:quota:${new Date().toISOString().slice(0, 10)}`;
}
export async function spendQuota(units: number): Promise<void> {
  try {
    const total = await redis.incrby(quotaKey(), units);
    if (total === units) await redis.expire(quotaKey(), 48 * 3600);
  } catch { /* best-effort */ }
}
async function overBudget(): Promise<boolean> {
  try {
    return (parseInt((await redis.get(quotaKey())) ?? '0', 10) || 0) >= QUOTA_BUDGET;
  } catch {
    return false;
  }
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** One batched videos.list (≤50 ids) → classify each. Costs 1 unit. */
async function fetchVideos(ids: string[], apiKey: string): Promise<Map<string, VideoInfo>> {
  const out = new Map<string, VideoInfo>();
  if (!ids.length) return out;
  const res = await fetch(`${YT}/videos?part=snippet,liveStreamingDetails&id=${ids.join(',')}&key=${apiKey}`).catch(() => null);
  await spendQuota(1);
  if (!res?.ok) return out;
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title: string; channelTitle: string; liveBroadcastContent?: string; thumbnails?: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } } };
      liveStreamingDetails?: unknown;
    }>;
  };
  for (const v of data.items ?? []) {
    const s = v.snippet;
    if (!s) continue;
    out.set(v.id, {
      id: v.id,
      title: s.title,
      channelTitle: s.channelTitle,
      thumbnail: s.thumbnails?.maxres?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.medium?.url ?? null,
      live: s.liveBroadcastContent === 'live',
      upcoming: s.liveBroadcastContent === 'upcoming',
      isStream: v.liveStreamingDetails != null,
    });
  }
  return out;
}

// ── Delivery ──────────────────────────────────────────────────────────────────

async function recordAlertFailure(id: string, reason: string): Promise<void> {
  const MAX = 5;
  try {
    const updated = await prisma.streamAlert.update({
      where: { id },
      data: { failureCount: { increment: 1 }, lastError: reason.slice(0, 300) },
      select: { failureCount: true, guildId: true, channelUsername: true },
    });
    if (updated.failureCount >= MAX) {
      await prisma.streamAlert.update({ where: { id }, data: { enabled: false } });
      logger.warn({ id, guildId: updated.guildId, feed: updated.channelUsername }, `YouTube alert auto-disabled after ${MAX} failures`);
    }
  } catch { /* row deleted mid-flight */ }
}

async function postAlert(client: BotClient, alert: AlertRow, video: VideoInfo, kind: EventKind): Promise<void> {
  try {
    const guild = client.guilds.cache.get(alert.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(alert.discordChannelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      await recordAlertFailure(alert.id, 'Channel not found — deleted or the bot lost access');
      return;
    }

    const settings = await getGuildSettings(alert.guildId);
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: alert.guildId });
    const color = settings?.streamAlertColor ? parseInt(settings.streamAlertColor.replace('#', ''), 16) : null;
    const url = `https://www.youtube.com/watch?v=${video.id}`;

    const message = alert.message
      .replace(/\{streamer\}/g, video.channelTitle)
      .replace(/\{url\}/g, url)
      .replace(/\{title\}/g, video.title)
      .replace(/\{game\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const title = kind === 'live'
      ? t('streamAlert.youtubeLive', loc, { streamer: video.channelTitle })
      : t('streamAlert.youtubeUpload', loc, { streamer: video.channelTitle });

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(video.title)
      .setURL(url)
      .setColor(color ?? 0xff0000)
      .setFooter({ text: 'YouTube' })
      .setTimestamp();
    if (video.thumbnail) embed.setImage(video.thumbnail);

    const msg = await channel.send({ content: message || undefined, embeds: [embed] });
    await prisma.streamAlert.update({
      where: { id: alert.id },
      data: {
        ...(kind === 'live' ? { lastStreamId: video.id } : { lastUploadId: video.id }),
        lastMessageId: msg.id,
        lastMessageChannelId: msg.channelId,
        failureCount: 0,
        lastError: null,
      },
    }).catch(swallow);
    logger.info({ guildId: alert.guildId, channelId: alert.channelId, kind }, 'YouTube alert sent');
  } catch (err) {
    const code = (err as { code?: number }).code;
    await recordAlertFailure(alert.id, `Discord error ${code ?? '?'}: ${(err as Error).message ?? 'delivery failed'}`);
  }
}

/**
 * Fan a Redis `youtube:live`/`youtube:upload` event out to every guild watching
 * the channel. A global NX lock collapses YouTube's aggressive resends; the
 * per-alert lastStreamId/lastUploadId is the durable idempotency guard.
 */
export async function handleYouTubeEvent(client: BotClient, kind: EventKind, raw: string): Promise<void> {
  let payload: { channelId: string; video: VideoInfo };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const { channelId, video } = payload;
  if (!channelId || !video?.id) return;

  const lock = await redis.set(`youtube:sent:${kind}:${video.id}`, '1', 'EX', 6 * 3600, 'NX').catch(() => null);
  if (lock !== 'OK') return; // another worker/resend already handled this video

  const alerts = await prisma.streamAlert.findMany({
    where: {
      platform: 'youtube',
      channelId,
      enabled: true,
      ...(kind === 'live' ? { notifyLive: true } : { notifyUploads: true }),
    },
  });
  for (const alert of alerts) {
    if (kind === 'live') {
      // Each stream has a unique ID; alert once per new live video.
      if (alert.lastStreamId === video.id) continue;
      await postAlert(client, alert as AlertRow, video, 'live');
    } else {
      if (alert.lastUploadId === video.id) continue;
      // Baseline: the first upload we ever see for this alert is the channel's
      // current newest — seed it silently so the pre-existing back catalogue
      // never fires. Only genuinely new uploads after this point alert.
      if (alert.lastUploadId === null) {
        await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastUploadId: video.id } }).catch(swallow);
        continue;
      }
      await postAlert(client, alert as AlertRow, video, 'upload');
    }
  }
}

// ── Backstop poll: scheduled ("upcoming") streams until they go live ──────────

export async function pollUpcoming(): Promise<void> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return;
  const hash = await redis.hgetall('youtube:upcoming').catch(() => ({} as Record<string, string>));
  const ids = Object.keys(hash);
  if (!ids.length) return;

  const now = Date.now();
  for (const group of chunk(ids, 50)) {
    if (await overBudget()) break;
    const infos = await fetchVideos(group, apiKey);
    for (const vid of group) {
      const [chId, tsStr] = (hash[vid] ?? '').split(':');
      const info = infos.get(vid);
      if (!info) { await redis.hdel('youtube:upcoming', vid).catch(swallow); continue; }
      if (info.live) {
        await redis.hdel('youtube:upcoming', vid).catch(swallow);
        await pub.publish('youtube:live', JSON.stringify({ channelId: chId, video: info })).catch(swallow);
      } else if (!info.upcoming) {
        await redis.hdel('youtube:upcoming', vid).catch(swallow); // ended / not a stream anymore
      } else if (now - (parseInt(tsStr ?? '0', 10) || 0) > 48 * 3600 * 1000) {
        await redis.hdel('youtube:upcoming', vid).catch(swallow); // stale schedule
      }
    }
  }
}

// ── Primary detection: poll the public Atom feed (0 YouTube Data API quota) ───

/**
 * The channel's real RSS/Atom feed — a public endpoint, NOT the Data API, so
 * polling it costs zero quota. Note: `/feeds/videos.xml` returns the actual
 * entries; the `/xml/feeds/…` path is only the WebSub *topic identifier* stub.
 */
const FEED = (channelId: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

/** Fetch + parse a channel's Atom feed → video IDs, newest first. Zero quota. */
async function fetchFeedVideoIds(channelId: string): Promise<string[]> {
  try {
    const res = await fetch(FEED(channelId), { headers: { 'user-agent': 'ArkenBot-StreamAlerts/1.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    const ids: string[] = [];
    const re = /<yt:videoId>([\w-]{11})<\/yt:videoId>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) ids.push(m[1]);
    return ids;
  } catch {
    return [];
  }
}

/**
 * Primary, reliable, quota-free detector. Polls every watched channel's public
 * Atom feed over plain HTTP (no Data API quota, no dependency on Google's
 * WebSub hub), finds video IDs newer than a per-channel marker, and spends a
 * `videos.list` unit only to classify those genuinely-new videos. Publishes the
 * same `youtube:live`/`youtube:upload` events as the push path, so everything
 * flows through the one deduplicated fan-out (WebSub push, when the hub is up,
 * simply wins the race and the poll's later publish is de-duped).
 */
export async function pollFeeds(): Promise<void> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return;

  // YouTube ToS: don't retain video IDs beyond 30 days (turnover handles this
  // normally; safety net for edge cases).
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.streamAlert.updateMany({
    where: { platform: 'youtube', createdAt: { lt: cutoff }, OR: [{ lastStreamId: { not: null } }, { lastUploadId: { not: null } }] },
    data: { lastStreamId: null, lastUploadId: null },
  }).catch(swallow);

  const rows = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: { not: null } },
    select: { channelId: true },
    distinct: ['channelId'],
  });
  const channels = rows.map((r) => r.channelId).filter(Boolean) as string[];
  if (!channels.length) return;

  // Discover new video IDs across all channels (0 quota), 10 feeds at a time.
  const toClassify: Array<{ videoId: string; channelId: string }> = [];
  for (const group of chunk(channels, 10)) {
    await Promise.all(group.map(async (chId) => {
      const ids = await fetchFeedVideoIds(chId);
      if (!ids.length) return;
      const markerKey = `youtube:feed:${chId}`;
      const marker = await redis.get(markerKey).catch(() => null);
      await redis.set(markerKey, ids[0]).catch(swallow);
      if (!marker) {
        // First observation → baseline. Classify only the newest so a channel
        // that's live *right now* still alerts; a plain newest upload is seeded
        // silently by the fan-out's upload baseline (no back-catalogue spam).
        toClassify.push({ videoId: ids[0], channelId: chId });
        return;
      }
      if (ids[0] === marker) return; // nothing new
      const idx = ids.indexOf(marker);
      const fresh = idx === -1 ? ids.slice(0, 5) : ids.slice(0, idx); // cap if marker aged off the feed
      for (const vid of fresh) toClassify.push({ videoId: vid, channelId: chId });
    }));
  }
  if (!toClassify.length) return;

  // Classify ONLY the new videos with batched videos.list (1 unit / 50 ids).
  const byId = new Map<string, VideoInfo>();
  for (const grp of chunk([...new Set(toClassify.map((c) => c.videoId))], 50)) {
    if (await overBudget()) break;
    for (const [k, v] of await fetchVideos(grp, apiKey)) byId.set(k, v);
  }

  for (const { videoId, channelId } of toClassify) {
    const info = byId.get(videoId);
    if (!info) continue;
    if (info.live) {
      await pub.publish('youtube:live', JSON.stringify({ channelId, video: info })).catch(swallow);
    } else if (info.upcoming) {
      await redis.hset('youtube:upcoming', info.id, `${channelId}:${Date.now()}`).catch(swallow);
    } else if (!info.isStream) {
      await pub.publish('youtube:upload', JSON.stringify({ channelId, video: info })).catch(swallow);
    }
    // isStream && !live && !upcoming → finished-stream VOD; ignore.
  }
}
