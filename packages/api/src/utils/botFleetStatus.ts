/**
 * Aggregates the bot's live status across all shards from their per-shard
 * heartbeats (`bot:heartbeat:shard:<id>`), so the staff metrics and public
 * status page are correct whether the bot runs as one process or many shards.
 * Falls back to the legacy single `bot:heartbeat` key for an older bot build.
 */
import { redis } from '../redis.js';

export interface BotFleetStatus {
  online: boolean;
  guilds: number | null;
  wsPingMs: number | null;
  lastSeen: string | null;
  rssMb: number | null;
  uptimeSec: number | null;
  shardCount: number;
}

interface Heartbeat {
  at: number;
  guilds?: number;
  ws?: number;
  rss?: number;
  startedAt?: number;
}

const STALE_MS = 90_000;
const EMPTY: BotFleetStatus = {
  online: false, guilds: null, wsPingMs: null, lastSeen: null, rssMb: null, uptimeSec: null, shardCount: 0,
};

export async function getBotFleetStatus(): Promise<BotFleetStatus> {
  try {
    const keys = await redis.keys('bot:heartbeat:shard:*');
    const now = Date.now();

    // Fallback: a bot build that only writes the legacy single key.
    if (keys.length === 0) {
      const raw = await redis.get('bot:heartbeat');
      if (!raw) return EMPTY;
      const hb = JSON.parse(raw) as Heartbeat;
      if (now - hb.at > STALE_MS) return { ...EMPTY, lastSeen: new Date(hb.at).toISOString() };
      return {
        online: true,
        guilds: hb.guilds ?? null,
        wsPingMs: hb.ws != null && hb.ws >= 0 ? hb.ws : null,
        lastSeen: new Date(hb.at).toISOString(),
        rssMb: hb.rss != null ? Math.round(hb.rss / 1048576) : null,
        uptimeSec: hb.startedAt ? Math.floor((now - hb.startedAt) / 1000) : null,
        shardCount: 1,
      };
    }

    let guilds = 0, rss = 0, lastAt = 0, oldestStart = now, pingSum = 0, pingCount = 0, fresh = 0;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const hb = JSON.parse(raw) as Heartbeat;
      if (now - hb.at > STALE_MS) continue;
      fresh++;
      guilds += hb.guilds ?? 0;
      rss += hb.rss ?? 0;
      lastAt = Math.max(lastAt, hb.at);
      if (hb.startedAt && hb.startedAt < oldestStart) oldestStart = hb.startedAt;
      if (hb.ws != null && hb.ws >= 0) { pingSum += hb.ws; pingCount++; }
    }
    if (fresh === 0) return EMPTY;

    return {
      online: true,
      guilds,
      wsPingMs: pingCount ? Math.round(pingSum / pingCount) : null,
      lastSeen: lastAt ? new Date(lastAt).toISOString() : null,
      rssMb: Math.round(rss / 1048576),
      uptimeSec: Math.floor((now - oldestStart) / 1000),
      shardCount: fresh,
    };
  } catch {
    return EMPTY;
  }
}
