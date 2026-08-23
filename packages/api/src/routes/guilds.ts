import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { AuthService } from '../services/AuthService.js';

export async function guildRoutes(server: FastifyInstance): Promise<void> {
  // GET /guilds - List guilds the user can manage
  server.get('/guilds', { preHandler: [requireAuth] }, async (request, reply) => {
    const accessToken = await AuthService.getValidAccessToken(request.user!.id);
    if (!accessToken) {
      return reply.code(401).send({ success: false, error: 'Discord authorization expired — please log in again' });
    }

    try {
      type DiscordGuild = {
        id: string;
        name: string;
        icon: string | null;
        permissions: string;
        owner: boolean;
        approximate_member_count?: number;
      };
      // /users/@me/guilds returns at most 200 guilds per page. Paginate with the
      // `after` cursor so users in 200+ servers still see all of them (otherwise
      // recently-joined servers — which sort last by ID — get cut off).
      const allGuilds: DiscordGuild[] = [];
      let after: string | undefined;
      for (let page = 0; page < 10; page++) {
        const url = `https://discord.com/api/v10/users/@me/guilds?limit=200&with_counts=true${after ? `&after=${after}` : ''}`;
        const res = await axios.get<DiscordGuild[]>(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        allGuilds.push(...res.data);
        if (res.data.length < 200) break;
        after = res.data[res.data.length - 1].id;
      }

      // Access is granted to the server owner, or anyone with Administrator or
      // Manage Server — the standard "can configure this server" threshold.
      const ADMINISTRATOR = BigInt(0x8);
      const MANAGE_GUILD = BigInt(0x20);
      const adminGuilds = allGuilds.filter((g) => {
        const perms = BigInt(g.permissions);
        const canManage =
          (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
        return canManage || g.owner;
      });

      // Enrich with bot presence
      const guildIds = adminGuilds.map((g) => g.id);
      const botGuilds = await prisma.guild.findMany({
        where: { id: { in: guildIds } },
        select: { id: true, isActive: true },
      });
      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));

      const enriched = adminGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        hasAdminPermission: true,
        botPresent: botGuildMap.has(g.id) && (botGuildMap.get(g.id)?.isActive ?? false),
        memberCount: g.approximate_member_count ?? 0,
      }));


      return reply.send({ success: true, data: enriched });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      server.log.error({ err, msg }, 'Failed to fetch guilds');
      return reply.code(500).send({ success: false, error: `Failed to fetch guilds: ${msg}` });
    }
  });

  // GET /guilds/:guildId - Get guild overview
  server.get('/guilds/:guildId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: {
        settings: true,
        welcomeConfig: true,
        automodConfig: true,
        guildAddons: { where: { enabled: true }, include: { addon: { select: { name: true, displayName: true } } } },
      },
    });

    if (!guild) {
      return reply.code(404).send({ success: false, error: 'Guild not found' });
    }

    // Stats
    const [caseCount, warningCount, levelCount, customCommandCount] = await Promise.all([
      prisma.moderationCase.count({ where: { guildId } }),
      prisma.warning.count({ where: { guildId, active: true } }),
      prisma.userLevel.count({ where: { guildId } }),
      prisma.customCommand.count({ where: { guildId } }),
    ]);

    return reply.send({
      success: true,
      data: {
        ...guild,
        stats: { caseCount, warningCount, levelCount, customCommandCount },
      },
    });
  });

  // GET /guilds/:guildId/channels - List channels
  server.get('/guilds/:guildId/channels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    try {
      const { default: axiosInstance } = await import('axios');
      const res = await axiosInstance.get(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      });
      return reply.send({ success: true, data: res.data });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to fetch channels' });
    }
  });

  // GET /guilds/:guildId/roles - List roles
  server.get('/guilds/:guildId/roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    try {
      const { default: axiosInstance } = await import('axios');
      const res = await axiosInstance.get(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
      });
      return reply.send({ success: true, data: res.data });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to fetch roles' });
    }
  });

  // GET /guilds/:guildId/analytics/automod
  server.get('/guilds/:guildId/analytics/automod', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { days = '14' } = request.query as Record<string, string>;
    const daysNum = Math.min(90, Math.max(7, parseInt(days, 10)));
    const since = new Date(Date.now() - daysNum * 24 * 3600 * 1000);

    const entries = await prisma.logEntry.findMany({
      where: { guildId, type: 'automod', createdAt: { gte: since } },
      select: { data: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate by filter type (reason) and action
    const byFilter: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    const dailyMap: Map<string, number> = new Map();

    for (const entry of entries) {
      const d = entry.data as { reason?: string; action?: string } | null;
      const reason = d?.reason ?? 'Unknown';
      const action = d?.action ?? 'unknown';
      byFilter[reason] = (byFilter[reason] ?? 0) + 1;
      byAction[action] = (byAction[action] ?? 0) + 1;

      const dateKey = entry.createdAt.toISOString().slice(0, 10);
      dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + 1);
    }

    // Build a complete daily time-series with zero-fill for missing dates
    const timeseries: { date: string; hits: number }[] = [];
    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      timeseries.push({ date: dateKey, hits: dailyMap.get(dateKey) ?? 0 });
    }

    return reply.send({
      success: true,
      data: {
        total: entries.length,
        byFilter,
        byAction,
        timeseries,
      },
    });
  });

  // GET /guilds/:guildId/analytics
  server.get('/guilds/:guildId/analytics', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const [modActions24h, logEntries24h] = await Promise.all([
      prisma.moderationCase.count({ where: { guildId, createdAt: { gte: since } } }),
      prisma.logEntry.groupBy({
        by: ['type'],
        where: { guildId, createdAt: { gte: since } },
        _count: { type: true },
      }),
    ]);

    const joinEvents = logEntries24h.find((e) => e.type === 'member_join')?._count.type ?? 0;
    const leaveEvents = logEntries24h.find((e) => e.type === 'member_leave')?._count.type ?? 0;

    // Historical daily stats (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const dailyHistory = await prisma.serverDailyStats.findMany({
      where: { guildId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'asc' },
    });

    return reply.send({
      success: true,
      data: {
        guildId,
        moderationActions24h: modActions24h,
        newMembers24h: joinEvents,
        leftMembers24h: leaveEvents,
        logEvents: logEntries24h,
        history: dailyHistory,
      },
    });
  });
}
