/**
 * Reddit new-post alerts — no Reddit API (they no longer issue keys). Polls each
 * watched subreddit's public RSS feed (`/r/<sub>/new/.rss`) with a descriptive
 * User-Agent (a generic UA gets 429'd). Alerts are grouped by subreddit so every
 * guild watching the same sub shares one fetch per cycle, keeping request volume
 * low and staying within Reddit's tolerance for feed readers.
 */
import Parser from 'rss-parser';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';

const UA = 'ArkenBot/1.0 (+https://arkenbot.app; Discord new-post alerts)';
const directParser = new Parser({ headers: { 'User-Agent': UA }, timeout: 15000 });

// A generic UA gets 429'd, and Reddit sometimes rate-limits datacenter IPs
// outright. We fetch directly by default (free) and only fall back to the
// residential SOCKS proxy on a 429/403, so proxy bandwidth stays near-zero.
let proxyParser: Parser | null = null;
function getProxyParser(): Parser | null {
  if (proxyParser) return proxyParser;
  if (!process.env.YTDLP_PROXY) return null;
  proxyParser = new Parser({
    headers: { 'User-Agent': UA },
    timeout: 20000,
    requestOptions: { agent: new SocksProxyAgent(process.env.YTDLP_PROXY) },
  });
  return proxyParser;
}

/** Normalise stored value (a bare subreddit name) to its new-posts RSS URL. */
function feedUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new/.rss`;
}

type Feed = Awaited<ReturnType<Parser['parseURL']>>;

/** Fetch a subreddit feed direct-first, retrying via the proxy on a block. */
async function fetchFeed(sub: string): Promise<Feed | null> {
  const url = feedUrl(sub);
  try {
    return await directParser.parseURL(url);
  } catch (err) {
    if (/\b(429|403)\b/.test(String(err))) {
      const pp = getProxyParser();
      if (pp) {
        try {
          const feed = await pp.parseURL(url);
          logger.debug({ sub }, 'Reddit feed fetched via proxy fallback');
          return feed;
        } catch { /* proxy also failed */ }
      }
    }
    logger.debug({ sub, err: String(err).slice(0, 120) }, 'Reddit feed fetch failed (will retry next cycle)');
    return null;
  }
}

type AlertRow = Awaited<ReturnType<typeof prisma.streamAlert.findFirst>> & object;

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
      logger.warn({ id, guildId: updated.guildId, feed: updated.channelUsername }, `Reddit alert auto-disabled after ${MAX} failures`);
    }
  } catch { /* row deleted mid-flight */ }
}

async function postAlert(client: BotClient, alert: AlertRow, sub: string, item: { title?: string; link?: string; creator?: string; author?: string }): Promise<void> {
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
    const url = item.link ?? `https://www.reddit.com/r/${sub}`;
    const title = item.title ?? t('streamAlert.rssPostFallback', loc);
    const author = item.author ?? item.creator ?? '';

    const message = alert.message
      .replace(/\{feed\}/g, `r/${sub}`)
      .replace(/\{streamer\}/g, `r/${sub}`)
      .replace(/\{url\}/g, url)
      .replace(/\{title\}/g, title)
      .replace(/\s{2,}/g, ' ')
      .trim();

    const embed = new EmbedBuilder()
      .setTitle(title.slice(0, 256))
      .setURL(url)
      .setDescription(t('streamAlert.redditNewPost', loc, { sub }))
      .setColor(color ?? 0xff4500)
      .setFooter({ text: author ? `Reddit • ${author}` : 'Reddit' })
      .setTimestamp();

    const msg = await channel.send({ content: message || undefined, embeds: [embed] });
    await prisma.streamAlert.update({
      where: { id: alert.id },
      data: { lastMessageId: msg.id, lastMessageChannelId: msg.channelId, failureCount: 0, lastError: null },
    }).catch(swallow);
    logger.info({ guildId: alert.guildId, sub }, 'Reddit alert sent');
  } catch (err) {
    const code = (err as { code?: number }).code;
    await recordAlertFailure(alert.id, `Discord error ${code ?? '?'}: ${(err as Error).message ?? 'delivery failed'}`);
  }
}

/** Poll every watched subreddit once and fan out new posts to its alerts. */
export async function runRedditAlerts(client: BotClient): Promise<void> {
  const alerts = await prisma.streamAlert.findMany({ where: { platform: 'reddit', enabled: true } });
  if (!alerts.length) return;

  // Group alerts by subreddit (case-insensitive) → one fetch per unique sub.
  const bySub = new Map<string, AlertRow[]>();
  for (const a of alerts) {
    const key = a.channelUsername.toLowerCase();
    (bySub.get(key) ?? bySub.set(key, []).get(key)!).push(a as AlertRow);
  }

  for (const [sub, subAlerts] of bySub) {
    // A rate-limited fetch is skipped this cycle and is NOT counted as a delivery
    // failure, so it never auto-disables a working alert.
    const feed = await fetchFeed(sub);
    if (!feed) continue;
    const item = feed.items?.[0];
    if (!item) continue;
    const itemId = item.guid ?? item.id ?? item.link ?? item.title ?? '';
    if (!itemId) continue;

    for (const alert of subAlerts) {
      // Already alerted this post → skip. Otherwise post it (on a brand-new alert
      // this fires the subreddit's current latest post, confirming setup works —
      // matching how RSS alerts behave), then remember it for dedup.
      if (alert.lastStreamId === itemId) continue;
      await prisma.streamAlert.update({ where: { id: alert.id }, data: { lastStreamId: itemId } }).catch(swallow);
      await postAlert(client, alert, sub, item as { title?: string; link?: string; creator?: string; author?: string });
    }
  }
}
