
import crypto from 'crypto';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { config } from '../config.js';

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const TOPIC = (channelId: string) => `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
const CALLBACK = () => `${config.publicApiUrl}/youtube/websub`;
const LEASE_SECONDS = 828000;

function quotaKey(): string {
  return `youtube:quota:${new Date().toISOString().slice(0, 10)}`;
}

export async function spendQuota(units: number): Promise<void> {
  try {
    const key = quotaKey();
    const total = await redis.incrby(key, units);
    if (total === units) await redis.expire(key, 48 * 3600);
  } catch {

  }
}

export async function getQuotaUsed(): Promise<number> {
  try {
    return parseInt((await redis.get(quotaKey())) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

export async function resolveChannelId(input: string): Promise<string | null> {
  const cleaned = input.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//i, '').replace(/^@/, '');

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

    return res.status === 202 || res.status === 204;
  } catch {
    return false;
  }
}

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

export async function reconcileSubscriptions(): Promise<void> {
  const renewCutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const unresolved = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: null },
    select: { id: true, channelUsername: true },
  });
  for (const a of unresolved) {
    const channelId = await resolveChannelId(a.channelUsername);
    if (channelId) await prisma.streamAlert.update({ where: { id: a.id }, data: { channelId } }).catch(() => null);
  }

  const rows = await prisma.streamAlert.findMany({
    where: { platform: 'youtube', enabled: true, channelId: { not: null } },
    select: { channelId: true },
    distinct: ['channelId'],
  });
  const wanted = new Set(rows.map((r) => r.channelId).filter(Boolean) as string[]);

  for (const channelId of wanted) {
    const sub = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
    const needsRenew =
      !sub ||
      sub.status !== 'active' ||
      !sub.leaseExpiresAt ||
      sub.leaseExpiresAt < renewCutoff;
    if (needsRenew) await ensureSubscription(channelId);
  }

  const subs = await prisma.youtubeSubscription.findMany({ select: { channelId: true } });
  for (const { channelId } of subs) {
    if (!wanted.has(channelId)) await removeSubscriptionIfUnused(channelId);
  }
}

export async function retryPendingSubscriptions(): Promise<void> {
  const stuck = await prisma.youtubeSubscription.findMany({
    where: { status: { in: ['failed', 'pending'] } },
    select: { channelId: true },
    take: 200,
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
