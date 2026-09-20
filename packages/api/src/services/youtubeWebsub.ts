/**
 * YouTube WebSub (PubSubHubbub) subscription management.
 *
 * Rather than polling every watched channel on a timer, we subscribe once per
 * unique YouTube channel to its public Atom feed. YouTube then pushes a
 * notification (0 quota) the moment a channel publishes a video or goes live;
 * the callback route confirms details with a single batched `videos.list`
 * (1 unit) and fans the alert out to every guild watching that channel.
 *
 * Which channels to subscribe is derived from enabled `youtube` StreamAlerts —
 * this table only holds the WebSub lease + per-subscription HMAC secret.
 */
import crypto from 'crypto';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { config } from '../config.js';

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const TOPIC = (channelId: string) => `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
const CALLBACK = () => `${config.publicApiUrl}/youtube/websub`;
const LEASE_SECONDS = 828000; // ~9.5 days (hub caps around 10; we renew well before)

/** UTC-day quota counter so we never approach the daily unit cap. */
function quotaKey(): string {
  return `youtube:quota:${new Date().toISOString().slice(0, 10)}`;
}

/** Record `units` of YouTube Data API cost for today. Best-effort. */
export async function spendQuota(units: number): Promise<void> {
  try {
    const key = quotaKey();
    const total = await redis.incrby(key, units);
    if (total === units) await redis.expire(key, 48 * 3600);
  } catch {
    /* quota metering is best-effort; never block on it */
  }
}

/** Today's consumed YouTube Data API units (0 if unknown). */
export async function getQuotaUsed(): Promise<number> {
  try {
    return parseInt((await redis.get(quotaKey())) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Resolve a YouTube handle (e.g. "@LinusTechTips") or raw channel ID to a
 * canonical channel ID (UC…). Returns null if it can't be resolved.
 * Costs 1 unit when a lookup is needed; a raw UC… id costs nothing.
 */
export async function resolveChannelId(input: string): Promise<string | null> {
  const cleaned = input.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/^@/, '');
  // Already a channel ID.
  if (/^UC[\w-]{22}$/.test(cleaned)) return cleaned;
  if (!config.youtubeApiKey) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(cleaned)}&key=${config.youtubeApiKey}`,
    );
    await spendQuota(1);
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ id: string }> };
    return data.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** POST a subscribe/unsubscribe request to the hub for one channel. */
async function sendHubRequest(channelId: string, secret: string, mode: 'subscribe' | 'unsubscribe'): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      'hub.callback': CALLBACK(),
      'hub.topic': TOPIC(channelId),
      'hub.verify': 'async',
      'hub.mode': mode,
      'hub.secret': secret,
      'hub.lease_seconds': String(LEASE_SECONDS),
    });
    const res = await fetch(HUB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    // The hub returns 202 Accepted; verification then arrives on our GET callback.
    return res.status === 202 || res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Ensure there is an active WebSub subscription for `channelId`. Creates the
 * row (with a fresh secret) if needed and (re)sends the subscribe request.
 * Idempotent — safe to call on every alert create and from the renewal job.
 */
export async function ensureSubscription(channelId: string): Promise<void> {
  if (!/^UC[\w-]{22}$/.test(channelId)) return;
  const existing = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
  const secret = existing?.secret ?? crypto.randomBytes(24).toString('hex');
  if (!existing) {
    await prisma.youtubeSubscription.create({ data: { channelId, secret, status: 'pending' } });
  }
  const ok = await sendHubRequest(channelId, secret, 'subscribe');
  if (!ok) {
    await prisma.youtubeSubscription.update({ where: { channelId }, data: { status: 'failed' } }).catch(() => null);
  }
}

/**
 * Unsubscribe and delete the subscription for `channelId`, but only when no
 * enabled youtube StreamAlert still references it. Call after deleting/disabling
 * an alert.
 */
export async function removeSubscriptionIfUnused(channelId: string): Promise<void> {
  if (!channelId) return;
  const stillUsed = await prisma.streamAlert.count({
    where: { platform: 'youtube', channelId, enabled: true },
  });
  if (stillUsed > 0) return;
  const sub = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
  if (sub) await sendHubRequest(channelId, sub.secret, 'unsubscribe');
  await prisma.youtubeSubscription.delete({ where: { channelId } }).catch(() => null);
}

/**
 * Renew + reconcile all YouTube WebSub subscriptions. Runs periodically:
 *   - (re)subscribes every channel referenced by an enabled alert whose lease is
 *     within 24h of expiring, is pending/failed, or has no subscription yet;
 *   - unsubscribes and prunes rows no enabled alert references any more.
 * WebSub (un)subscribe requests cost no YouTube Data API quota.
 */
export async function reconcileSubscriptions(): Promise<void> {
  const renewCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Backfill channel IDs for any enabled alert that predates the WebSub flow
  // (or whose earlier resolution failed) so it can be subscribed. 1 unit each.
  const unresolved = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: null },
    select: { id: true, channelUsername: true },
  });
  for (const a of unresolved) {
    const channelId = await resolveChannelId(a.channelUsername);
    if (channelId) await prisma.streamAlert.update({ where: { id: a.id }, data: { channelId } }).catch(() => null);
  }

  // Channels we should be watching (deduped across all guilds).
  const rows = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: { not: null } },
    select: { channelId: true },
    distinct: ['channelId'],
  });
  const wanted = new Set(rows.map((r) => r.channelId).filter(Boolean) as string[]);

  // Ensure/renew each wanted channel.
  for (const channelId of wanted) {
    const sub = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
    const needsRenew =
      !sub ||
      sub.status !== 'active' ||
      !sub.leaseExpiresAt ||
      sub.leaseExpiresAt < renewCutoff;
    if (needsRenew) await ensureSubscription(channelId);
  }

  // Prune subscriptions nothing watches any more.
  const subs = await prisma.youtubeSubscription.findMany({ select: { channelId: true } });
  for (const { channelId } of subs) {
    if (!wanted.has(channelId)) await removeSubscriptionIfUnused(channelId);
  }
}

/**
 * Frequent, lightweight retry of subscriptions stuck `failed`/`pending` — e.g.
 * while Google's hub is 503-ing "Transient error" (retry-after ~120s). Only
 * re-POSTs (no YouTube Data API quota) for channels an enabled alert still
 * wants, so push latches on within minutes of the hub recovering instead of
 * waiting for the hourly reconcile.
 */
export async function retryPendingSubscriptions(): Promise<void> {
  const stuck = await prisma.youtubeSubscription.findMany({
    where: { status: { in: ['failed', 'pending'] } },
    select: { channelId: true },
    take: 200, // safety cap; the hub is gentle to spam either way
  });
  if (!stuck.length) return;

  const wantedRows = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: { in: stuck.map((s) => s.channelId) } },
    select: { channelId: true },
    distinct: ['channelId'],
  });
  const wanted = new Set(wantedRows.map((r) => r.channelId));

  for (const { channelId } of stuck) {
    if (wanted.has(channelId)) await ensureSubscription(channelId);
  }
}
