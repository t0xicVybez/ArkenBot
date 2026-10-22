
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireStaff, requireBotOwner } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';
import { register } from 'prom-client';
import { execSync } from 'child_process';
import { readServiceLogs } from '../services/ServiceLogReader.js';
import { getPm2Memory } from '../utils/pm2Memory.js';
import { getBotFleetStatus } from '../utils/botFleetStatus.js';
import { resolveGuildNames, resolveChannelNames } from '../services/LogContextResolver.js';
const GITHUB_REPO = 't0xicVybez/ArkenBot';

/**
 * Staff portal API — fleet-wide guild and user management, system metrics, service logs, and broadcast announcements. Staff/owner only.
 *
 * Routes:
 *   GET    /admin/guilds
 *   GET    /admin/moderation/cases
 *   GET    /admin/moderation/warnings
 *   DELETE /admin/guilds/:guildId
 *   GET    /admin/stats
 *   GET    /admin/users
 *   PATCH  /admin/users/:id
 *   GET    /admin/metrics
 *   GET    /admin/logs
 *   GET    /admin/service-logs
 *   POST   /admin/announcements/generate
 *   GET    /admin/announcements
 *   POST   /admin/announcements
 *   GET    /admin/bot-config
 *   PATCH  /admin/bot-config
 */
export async function adminRoutes(server: FastifyInstance): Promise<void> {

  server.get('/admin/guilds', { preHandler: [requireStaff] }, async (request, reply) => {
    const query = request.query as { page?: string; search?: string; active?: string };
    const page = Math.max(0, parseInt(query.page ?? '1') - 1);
    const pageSize = 20;

    const where = {
      ...(query.active !== undefined ? { isActive: query.active === 'true' } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };

    const [guilds, total] = await Promise.all([
      prisma.guild.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
        include: { settings: { select: { moderationEnabled: true, levelingEnabled: true } } },
      }),
      prisma.guild.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: guilds, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total },
    });
  });

  server.get('/admin/moderation/cases', { preHandler: [requireStaff] }, async (request, reply) => {
    const query = request.query as { page?: string; search?: string; type?: string; active?: string };
    const page = Math.max(0, parseInt(query.page ?? '1') - 1);
    const pageSize = 25;
    const s = query.search?.trim();
    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.active === 'true' || query.active === 'false' ? { active: query.active === 'true' } : {}),
      ...(s ? { OR: [
        { userTag: { contains: s, mode: 'insensitive' as const } },
        { moderatorTag: { contains: s, mode: 'insensitive' as const } },
        { reason: { contains: s, mode: 'insensitive' as const } },
        { userId: { contains: s } },
        { guildId: { contains: s } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.moderationCase.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: page * pageSize, take: pageSize,
        select: {
          id: true, caseNumber: true, guildId: true, type: true, userId: true, userTag: true,
          moderatorTag: true, reason: true, active: true, createdAt: true,
          guild: { select: { name: true } },
        },
      }),
      prisma.moderationCase.count({ where }),
    ]);
    return reply.send({ success: true, data: { items, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total } });
  });

  server.get('/admin/moderation/warnings', { preHandler: [requireStaff] }, async (request, reply) => {
    const query = request.query as { page?: string; search?: string; active?: string };
    const page = Math.max(0, parseInt(query.page ?? '1') - 1);
    const pageSize = 25;
    const s = query.search?.trim();
    const where = {
      ...(query.active === 'true' || query.active === 'false' ? { active: query.active === 'true' } : {}),
      ...(s ? { OR: [
        { userTag: { contains: s, mode: 'insensitive' as const } },
        { moderatorTag: { contains: s, mode: 'insensitive' as const } },
        { reason: { contains: s, mode: 'insensitive' as const } },
        { userId: { contains: s } },
        { guildId: { contains: s } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.warning.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: page * pageSize, take: pageSize,
        select: {
          id: true, guildId: true, userId: true, userTag: true, moderatorTag: true,
          reason: true, active: true, createdAt: true, guild: { select: { name: true } },
        },
      }),
      prisma.warning.count({ where }),
    ]);
    return reply.send({ success: true, data: { items, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total } });
  });

  server.delete('/admin/guilds/:guildId', { preHandler: [requireStaff] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { isActive: true },
    });

    if (!guild) {
      return reply.code(404).send({ success: false, error: 'Guild not found' });
    }

    if (guild.isActive) {
      return reply.code(400).send({ success: false, error: 'Only inactive guilds can be deleted' });
    }

    await prisma.guild.delete({ where: { id: guildId } });

    return reply.send({ success: true });
  });

  server.get('/admin/stats', { preHandler: [requireStaff] }, async (_request, reply) => {
    const [
      totalGuilds,
      activeGuilds,
      xpTrackedUsers,
      totalCases,
      totalAddons,
      totalWarnings,
    ] = await Promise.all([
      prisma.guild.count(),
      prisma.guild.count({ where: { isActive: true } }),
      prisma.userLevel.count(),
      prisma.moderationCase.count(),
      prisma.addon.count({ where: { enabled: true } }),
      prisma.warning.count({ where: { active: true } }),
    ]);

    const [{ botMb: pm2BotMb, totalMb: pm2TotalMb }, fleet] = await Promise.all([
      getPm2Memory(),
      getBotFleetStatus(),
    ]);
    // Real Discord membership across every guild, from the bot's own gateway
    // cache via the heartbeat — not a DB count, so it includes everyone, not
    // just users who've earned XP. Falls back to the XP count if the bot is
    // offline/the heartbeat is stale, so the card never shows a dead zero.
    const totalUsers = fleet.members ?? xpTrackedUsers;
    // Bot memory from the shard heartbeats (sum of every shard's RSS) is correct
    // whether the bot runs as one process or many — pm2 only sees the shard
    // MANAGER when sharded, which undercounts badly.
    const memoryUsage = fleet.rssMb ?? pm2BotMb;
    // Replace pm2's single 'bot' entry (manager-only when sharded) with the real
    // summed bot memory so the fleet total is accurate.
    const totalMemoryUsage =
      pm2TotalMb != null && pm2BotMb != null && fleet.rssMb != null
        ? pm2TotalMb - pm2BotMb + fleet.rssMb
        : pm2TotalMb;

    return reply.send({
      success: true,
      data: {
        totalGuilds,
        activeGuilds,
        totalUsers,
        totalCases,
        totalAddons,
        totalWarnings,
        uptime: fleet.uptimeSec ?? Math.floor(process.uptime()),
        memoryUsage,
        totalMemoryUsage,
        shardCount: fleet.shardCount,
        version: '1.0.0',
      },
    });
  });

  server.get('/admin/users', { preHandler: [requireStaff] }, async (request, reply) => {
    const query = request.query as { search?: string };

    const users = await prisma.portalUser.findMany({
      where: query.search
        ? { username: { contains: query.search, mode: 'insensitive' } }
        : {},
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        username: true,
        discriminator: true,
        avatar: true,
        isStaff: true,
        isBotOwner: true,
        createdAt: true,
      },
    });

    return reply.send({ success: true, data: users });
  });

  server.patch('/admin/users/:id', { preHandler: [requireBotOwner] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isStaff } = request.body as { isStaff: boolean };

    const user = await prisma.portalUser.update({
      where: { id },
      data: { isStaff },
    });

    return reply.send({ success: true, data: { id: user.id, username: user.username, isStaff: user.isStaff } });
  });

  server.get('/admin/metrics', { preHandler: [requireStaff] }, async (_request, reply) => {
    const metrics = await register.metrics();
    return reply.header('Content-Type', register.contentType).send(metrics);
  });

  server.get('/admin/logs', { preHandler: [requireStaff] }, async (request, reply) => {
    const query = request.query as { guildId?: string; type?: string; page?: string };
    const page = Math.max(0, parseInt(query.page ?? '1') - 1);
    const pageSize = 100;

    const where = {
      ...(query.guildId ? { guildId: query.guildId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [entries, total] = await Promise.all([
      prisma.logEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.logEntry.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: entries, total, page: page + 1, pageSize, hasMore: (page + 1) * pageSize < total },
    });
  });

  server.get('/admin/service-logs', { preHandler: [requireStaff] }, async (request, reply) => {
    const q = request.query as {
      service?: string; stream?: string; level?: string; search?: string; limit?: string;
    };
    const isService = (s?: string): s is 'bot' | 'api' | 'web' => s === 'bot' || s === 'api' || s === 'web';
    const isLevel = (l?: string): l is 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' =>
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(l ?? '');

    const items = await readServiceLogs({
      service: isService(q.service) ? q.service : 'all',
      stream: q.stream === 'out' || q.stream === 'err' ? q.stream : 'all',
      minLevel: isLevel(q.level) ? q.level : undefined,
      search: q.search?.slice(0, 200) || undefined,
      limit: q.limit ? Math.min(Math.max(parseInt(q.limit, 10) || 200, 1), 1000) : 200,
    });

    const guildIds = [...new Set(items.map((i) => i.guildId).filter((v): v is string => !!v))];
    const channelIds = [...new Set(items.map((i) => i.channelId).filter((v): v is string => !!v))];
    const [guildNames, channelNames] = await Promise.all([
      resolveGuildNames(guildIds),
      resolveChannelNames(channelIds),
    ]);
    for (const item of items) {
      if (item.guildId && guildNames[item.guildId]) item.guildName = guildNames[item.guildId];
      if (item.channelId && channelNames[item.channelId]) item.channelName = channelNames[item.channelId];
    }

    return reply.send({ success: true, data: { items, services: ['bot', 'api', 'web'] } });
  });

  server.post('/admin/announcements/generate', {
    preHandler: [requireStaff],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { count = 50 } = request.body as { count?: number };

    const lastAnnouncement = await prisma.botAnnouncement.findFirst({ orderBy: { sentAt: 'desc' } });
    const since: Date | null = lastAnnouncement?.sentAt ?? null;

    let rawLog = '';
    try {
      const token = process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = { 'User-Agent': 'ArkenBot/1.0', Accept: 'application/vnd.github+json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const sinceParam = since ? `&since=${since.toISOString()}` : '';
      const ghRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=main&per_page=${Math.min(count, 50)}${sinceParam}`,
        { headers },
      );
      if (ghRes.ok) {
        const commits = await ghRes.json() as Array<{ commit: { message: string } }>;
        rawLog = commits.map((c) => c.commit.message.split('\n')[0]).join('\n');
      } else {
        throw new Error(`GitHub API ${ghRes.status}`);
      }
    } catch {

    }

    if (!rawLog) {
      try {
        const afterFlag = since ? `--after="${since.toISOString()}"` : `-${Math.min(count, 50)}`;
        rawLog = execSync(
          `git -C "${process.cwd()}" log --pretty=format:"%s" ${afterFlag}`,
          { encoding: 'utf8' },
        ).trim();
      } catch {
        return reply.code(500).send({ success: false, error: 'Could not read commit history.' });
      }
    }

    if (!rawLog) {
      return reply.code(400).send({ success: false, error: 'No commits found.' });
    }

    const CONV = /^(feat|fix|hotfix|perf|refactor|chore|docs|style|test|ci|build|revert)(?:\(([^)]+)\))?!?:\s*(.+)$/i;

    const NOISE = /submodule|tsbuildinfo|merge (branch|pull)|bump version|version bump|lockfile|\.gitignore|typo|lint|eslint|prettier|dependabot/i;

    const features: string[] = [];
    const fixes: string[] = [];
    const improvements: string[] = [];

    for (const line of rawLog.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || NOISE.test(trimmed)) continue;
      const m = trimmed.match(CONV);

      if (!m) continue;
      const [, commitType, , subject] = m;

      const clean = subject.charAt(0).toUpperCase() + subject.slice(1).replace(/\s*\(#\d+\)$/, '');
      const t = commitType.toLowerCase();
      if (t === 'feat') features.push(clean);
      else if (t === 'fix' || t === 'hotfix' || t === 'revert') fixes.push(clean);
      else if (t === 'perf' || t === 'docs') improvements.push(clean);

    }

    if (!features.length && !fixes.length && !improvements.length) {
      return reply.code(400).send({ success: false, error: 'No user-facing changes found in recent commits.' });
    }

    let type = 'update';
    if (features.length > 0 && fixes.length === 0) type = 'feature';
    else if (fixes.length > 0 && features.length === 0) type = 'hotfix';

    const sections: string[] = [];
    if (features.length) sections.push(`✨ **What's New**\n${features.map((f) => `• ${f}`).join('\n')}`);
    if (improvements.length) sections.push(`⚡ **Improvements**\n${improvements.map((f) => `• ${f}`).join('\n')}`);
    if (fixes.length) sections.push(`🐛 **Bug Fixes**\n${fixes.map((f) => `• ${f}`).join('\n')}`);

    let title = 'ArkenBot Update';
    if (type === 'feature') title = features.length > 1 ? 'New Features Just Landed' : 'A New Feature Just Landed';
    else if (type === 'hotfix') title = 'Bug Fixes Deployed';
    else if (features.length && fixes.length) title = 'New Features & Fixes';

    let body = sections.join('\n\n');

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const prompt = [
          'You write short, friendly Discord announcements for ArkenBot, a free Discord bot.',
          'Rewrite the developer changelog below for server owners and members with no technical background.',
          'Rules:',
          '- Plain, upbeat language. No jargon: never say API, webhook, endpoint, schema, refactor, submodule, repo, backend, or route.',
          '- Describe what each change means for the user, not how it was built.',
          '- Group into sections with these exact headers when relevant: "✨ **What\'s New**", "⚡ **Improvements**", "🐛 **Bug Fixes**".',
          '- One bullet per change starting with "• ". Merge closely related changes into one bullet. Maximum 8 bullets total.',
          '- Discord markdown only. Keep the whole body under 1500 characters.',
          'Respond with ONLY a JSON object: {"title": "...", "body": "..."} — a catchy title under 60 characters and the announcement body.',
          '',
          'Developer changelog:',
          body,
        ].join('\n');

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-oss-20b',
            messages: [{ role: 'user', content: prompt }],
            reasoning_effort: 'low',
            temperature: 0.4,
            max_tokens: 900,
            response_format: { type: 'json_object' },
          }),
        });
        if (groqRes.ok) {
          const json = await groqRes.json() as { choices?: Array<{ message?: { content?: string } }> };
          const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as { title?: string; body?: string };
          if (parsed.title && parsed.body) {
            title = parsed.title.slice(0, 100);
            body = parsed.body.slice(0, 1900);
          }
        }
      } catch (err) {
        request.log.warn({ err }, 'Groq announcement rewrite failed — using deterministic draft');
      }
    }

    return reply.send({
      success: true,
      data: { title, body, type },
    });
  });

  server.get('/admin/announcements', { preHandler: [requireStaff] }, async (_request, reply) => {
    const announcements = await prisma.botAnnouncement.findMany({
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    return reply.send({ success: true, data: announcements });
  });

  server.post('/admin/announcements', { preHandler: [requireStaff] }, async (request, reply) => {
    const user = request.user!;
    const input = parse(z.object({
      title: z.string().trim().min(1).max(256),
      body: z.string().trim().min(1).max(4000),
      type: z.string().trim().max(32).optional(),
    }), request.body, reply);
    if (!input) return;
    const { title, body, type } = input;

    const opted = await prisma.guildSettings.findMany({
      where: { announcementsEnabled: true },
      select: { guildId: true, announcementChannelId: true },
    });

    const announcement = await prisma.botAnnouncement.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        type: type ?? 'update',
        authorId: user.id,
        guildCount: opted.length,
      },
    });

    await pub.publish('api:events', JSON.stringify({
      type: 'bot:announcement',
      data: {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        type: announcement.type,
        targets: opted,
      },
    }));

    return reply.code(201).send({ success: true, data: announcement });
  });

  server.get('/admin/bot-config', { preHandler: [requireStaff] }, async (_request, reply) => {
    const config = await prisma.botConfig.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main' },
    });
    return reply.send({ success: true, data: config });
  });

  server.patch('/admin/bot-config', { preHandler: [requireBotOwner] }, async (request, reply) => {
    const { activityType, activityText, status } = request.body as {
      activityType?: string;
      activityText?: string;
      status?: string;
    };

    const config = await prisma.botConfig.upsert({
      where: { id: 'main' },
      update: {
        ...(activityType !== undefined && { activityType }),
        ...(activityText !== undefined && { activityText }),
        ...(status !== undefined && { status }),
      },
      create: {
        id: 'main',
        activityType: activityType ?? 'Watching',
        activityText: activityText ?? '{servers} servers',
        status: status ?? 'online',
      },
    });

    await pub.publish('api:events', JSON.stringify({ type: 'bot:presence:update', data: config }));

    return reply.send({ success: true, data: config });
  });
}
