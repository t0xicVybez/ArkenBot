/**
 * Server Promotion Tracking — dashboard API.
 *
 * Config:       GET/PATCH /promotion/:guildId/config        (guild admin)
 * Leaderboard:  GET       /promotion/:guildId/leaderboard    (guild admin)
 * Member view:  GET       /promotion/:guildId/members/:userId (guild admin)
 *
 * Durations are aggregated straight from `promotion_sessions`: each session
 * contributes `COALESCE(endedAt, now) - startedAt`, so an open session counts its
 * live elapsed time and offline/invisible gaps (which close sessions) don't count.
 */
import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

interface LeaderRow {
  userId: string;
  username: string | null;
  avatar: string | null;
  status_seconds: number;
  tag_seconds: number;
  status_active_since: Date | null;
  tag_active_since: Date | null;
  last_activity: Date | null;
  sessions: number;
}

function shapeRow(r: LeaderRow) {
  const statusSeconds = Math.round(Number(r.status_seconds) || 0);
  const tagSeconds = Math.round(Number(r.tag_seconds) || 0);
  return {
    userId: r.userId,
    username: r.username,
    avatar: r.avatar,
    statusSeconds,
    tagSeconds,
    totalSeconds: statusSeconds + tagSeconds,
    statusActive: r.status_active_since != null,
    tagActive: r.tag_active_since != null,
    statusActiveSince: r.status_active_since,
    tagActiveSince: r.tag_active_since,
    promoting: r.status_active_since != null || r.tag_active_since != null,
    lastActivity: r.last_activity,
    sessions: Number(r.sessions) || 0,
  };
}

export async function promotionRoutes(server: FastifyInstance): Promise<void> {
  // ── Config ──────────────────────────────────────────────────────────────────
  server.get('/promotion/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const cfg = await prisma.promotionConfig.findUnique({ where: { guildId } });
    return reply.send({
      success: true,
      data: cfg ?? { guildId, enabled: false, trackStatus: true, trackTag: true, keywords: [] },
    });
  });

  server.patch('/promotion/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const b = (request.body ?? {}) as {
      enabled?: boolean; trackStatus?: boolean; trackTag?: boolean; keywords?: string[];
    };

    // Sanitise keywords: trimmed, non-empty, de-duplicated, capped.
    let keywords: string[] | undefined;
    if (Array.isArray(b.keywords)) {
      keywords = [...new Set(b.keywords.map((k) => String(k).trim()).filter((k) => k.length > 0 && k.length <= 100))].slice(0, 25);
    }

    const existing = await prisma.promotionConfig.findUnique({ where: { guildId } });

    // On first enable with no keywords, seed from the Discord server name so it
    // works out of the box (owner can refine them after).
    if (b.enabled && !existing?.enabled && (keywords?.length ?? existing?.keywords.length ?? 0) === 0) {
      try {
        const { data } = await axios.get<{ name: string; vanity_url_code?: string | null }>(
          `https://discord.com/api/v10/guilds/${guildId}?with_counts=false`,
          { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }, timeout: 8000 },
        );
        const seed = [data.name, data.vanity_url_code ? `.gg/${data.vanity_url_code}` : null].filter(Boolean) as string[];
        if (seed.length) keywords = seed;
      } catch { /* best-effort seed */ }
    }

    const cfg = await prisma.promotionConfig.upsert({
      where: { guildId },
      update: {
        ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
        ...(b.trackStatus !== undefined ? { trackStatus: b.trackStatus } : {}),
        ...(b.trackTag !== undefined ? { trackTag: b.trackTag } : {}),
        ...(keywords !== undefined ? { keywords } : {}),
      },
      create: {
        guildId,
        enabled: b.enabled ?? false,
        trackStatus: b.trackStatus ?? true,
        trackTag: b.trackTag ?? true,
        keywords: keywords ?? [],
      },
    });

    // Tell the bot to reload its hot-path cache immediately.
    await pub.publish('promotion:config:updated', guildId).catch(() => undefined);
    return reply.send({ success: true, data: cfg });
  });

  // ── Leaderboard ───────────────────────────────────────────────────────────────
  server.get('/promotion/:guildId/leaderboard', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const q = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const offset = Math.max(Number(q.offset) || 0, 0);

    const rows = await prisma.$queryRaw<LeaderRow[]>`
      SELECT * FROM (
        SELECT
          "userId",
          (array_agg("username" ORDER BY "startedAt" DESC))[1] AS username,
          (array_agg("avatar"   ORDER BY "startedAt" DESC))[1] AS avatar,
          COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'status'), 0)::float8 AS status_seconds,
          COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'tag'), 0)::float8 AS tag_seconds,
          MAX("startedAt") FILTER (WHERE kind = 'status' AND "endedAt" IS NULL) AS status_active_since,
          MAX("startedAt") FILTER (WHERE kind = 'tag' AND "endedAt" IS NULL) AS tag_active_since,
          MAX(COALESCE("endedAt", "startedAt")) AS last_activity,
          COUNT(*)::int AS sessions
        FROM promotion_sessions
        WHERE "guildId" = ${guildId}
        GROUP BY "userId"
      ) t
      ORDER BY (t.status_seconds + t.tag_seconds) DESC
      LIMIT ${limit} OFFSET ${offset}`;

    return reply.send({ success: true, data: rows.map(shapeRow) });
  });

  // ── Member detail (aggregates + recent session history) ─────────────────────────
  server.get('/promotion/:guildId/members/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };

    const agg = await prisma.$queryRaw<LeaderRow[]>`
      SELECT
        "userId",
        (array_agg("username" ORDER BY "startedAt" DESC))[1] AS username,
        (array_agg("avatar"   ORDER BY "startedAt" DESC))[1] AS avatar,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'status'), 0)::float8 AS status_seconds,
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt"))) FILTER (WHERE kind = 'tag'), 0)::float8 AS tag_seconds,
        MAX("startedAt") FILTER (WHERE kind = 'status' AND "endedAt" IS NULL) AS status_active_since,
        MAX("startedAt") FILTER (WHERE kind = 'tag' AND "endedAt" IS NULL) AS tag_active_since,
        MAX(COALESCE("endedAt", "startedAt")) AS last_activity,
        COUNT(*)::int AS sessions
      FROM promotion_sessions
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      GROUP BY "userId"`;

    const sessions = await prisma.promotionSession.findMany({
      where: { guildId, userId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: { id: true, kind: true, value: true, startedAt: true, endedAt: true, endReason: true },
    });

    return reply.send({
      success: true,
      data: { summary: agg[0] ? shapeRow(agg[0]) : null, sessions },
    });
  });
}
