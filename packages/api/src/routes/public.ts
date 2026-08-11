import type { FastifyInstance } from 'fastify';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { xpForLevel } from '@arkenbot/shared';

export async function publicRoutes(server: FastifyInstance): Promise<void> {
  // GET /public/status — component health for the public status page.
  // Reports only live, measured facts: no synthetic uptime percentages.
  server.get('/public/status', async (_request, reply) => {
    const now = Date.now();

    // Database
    let database = false;
    let dbLatencyMs: number | null = null;
    try {
      const t = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t;
      database = true;
    } catch { /* down */ }

    // Redis
    let cache = false;
    try {
      cache = (await redis.ping()) === 'PONG';
    } catch { /* down */ }

    // Bot — heartbeat key written every 30s by the bot process (EX 120)
    let bot: { online: boolean; guilds: number | null; wsPingMs: number | null; lastSeen: string | null } =
      { online: false, guilds: null, wsPingMs: null, lastSeen: null };
    try {
      const raw = await redis.get('bot:heartbeat');
      if (raw) {
        const hb = JSON.parse(raw) as { at: number; guilds: number; ws: number };
        bot = {
          online: now - hb.at < 90_000,
          guilds: hb.guilds,
          wsPingMs: hb.ws >= 0 ? hb.ws : null,
          lastSeen: new Date(hb.at).toISOString(),
        };
      }
    } catch { /* leave defaults */ }

    return reply.send({
      success: true,
      data: {
        api: { online: true, uptimeSeconds: Math.floor(process.uptime()) },
        database: { online: database, latencyMs: dbLatencyMs },
        cache: { online: cache },
        bot,
        checkedAt: new Date(now).toISOString(),
      },
    });
  });

  // GET /public/stats — live stats for the landing page
  server.get('/public/stats', async (_request, reply) => {
    const [servers, users] = await Promise.all([
      prisma.guild.count({ where: { isActive: true } }),
      prisma.userLevel.count(),
    ]);
    return reply.send({ success: true, data: { servers, users } });
  });

  // GET /public/changelog — staff announcements, newest first, for the public changelog page
  server.get('/public/changelog', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '20', 10)));

    const [entries, total] = await Promise.all([
      prisma.botAnnouncement.findMany({
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // authorId and guildCount are internal — expose only public fields
        select: { id: true, title: true, body: true, type: true, sentAt: true },
      }),
      prisma.botAnnouncement.count(),
    ]);

    return reply.send({ success: true, data: { entries, total, page, pages: Math.ceil(total / limit) } });
  });

  // GET /public/leaderboard/:guildId — no auth required
  server.get('/public/leaderboard/:guildId', async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { page?: string; limit?: string; period?: string };

    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(query.limit ?? '25', 10)));
    const skip = (page - 1) * limit;
    const period = query.period ?? 'all'; // all | weekly | monthly

    const guild = await prisma.guild.findUnique({
      where: { id: guildId, isActive: true },
      select: {
        id: true,
        name: true,
        iconUrl: true,
        settings: { select: { levelingEnabled: true } },
      },
    });

    if (!guild) {
      return reply.code(404).send({ success: false, error: 'Guild not found' });
    }

    if (!guild.settings?.levelingEnabled) {
      return reply.code(403).send({ success: false, error: 'Leveling is not enabled for this server' });
    }

    // For time-filtered periods, only show users active within the window
    const periodWhere: Record<string, unknown> = { guildId };
    if (period === 'weekly') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      periodWhere.updatedAt = { gte: since };
    } else if (period === 'monthly') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      periodWhere.updatedAt = { gte: since };
    }

    const [entries, total] = await Promise.all([
      prisma.userLevel.findMany({
        where: periodWhere,
        orderBy: { xp: 'desc' },
        skip,
        take: limit,
        select: { userId: true, userTag: true, xp: true, level: true, totalMessages: true },
      }),
      prisma.userLevel.count({ where: periodWhere }),
    ]);

    // Compute xp needed for next level for each entry
    const enriched = entries.map((entry, i) => {
      const rank = skip + i + 1;
      const xpForNext = xpForLevel(entry.level + 1);
      const xpForCurrent = entry.level > 0
        ? Array.from({ length: entry.level }, (_, n) => xpForLevel(n + 1)).reduce((a, b) => a + b, 0)
        : 0;
      const xpIntoLevel = entry.xp - xpForCurrent;

      return {
        rank,
        userId: entry.userId,
        userTag: entry.userTag,
        level: entry.level,
        xp: entry.xp,
        xpIntoLevel,
        xpForNext,
        totalMessages: entry.totalMessages,
      };
    });

    return reply.send({
      success: true,
      data: {
        guild: { id: guild.id, name: guild.name, iconUrl: guild.iconUrl },
        entries: enriched,
        total,
        page,
        period,
        limit,
        hasMore: skip + limit < total,
      },
    });
  });
}
