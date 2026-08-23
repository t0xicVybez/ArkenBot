/**
 * Routes for miscellaneous guild features: per-command toggles, stats channels,
 * birthday tracker, polls, scheduled messages, auto-slowmode, activity graphs,
 * leaderboard management, and member search.
 */
import type { FastifyInstance } from 'fastify';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';
import { wallClockToUtc } from '@arkenbot/shared';

/** Interpret a scheduled-message time: absolute if it carries Z/offset, else wall-clock in tz. */
function resolveScheduledAt(value: string, timezone?: string | null): Date {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return new Date(value);
  return wallClockToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), timezone && timezone.length ? timezone : 'UTC');
}

/** Keep only valid IANA timezones (or null). */
function cleanTimezone(tz: unknown): string | null {
  if (typeof tz !== 'string' || !tz.length) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

/** Normalize a weekday list to unique ints 0-6. */
function cleanDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
}

/**
 * Registers feature routes.
 *
 * Command toggles:     GET/POST/DELETE /guilds/:guildId/commands/available|disabled
 * Stats channels:      GET/POST/DELETE /guilds/:guildId/stats-channels
 * Birthday tracker:    GET/PATCH /guilds/:guildId/birthdays/config, GET/POST/DELETE /guilds/:guildId/birthdays
 * Polls:               GET/POST /guilds/:guildId/polls, PATCH/DELETE /guilds/:guildId/polls/:pollId, POST …/vote
 * Scheduled messages:  GET/POST/PATCH/DELETE /guilds/:guildId/scheduled-messages
 * Auto-slowmode:       GET/POST/PATCH/DELETE /guilds/:guildId/slowmode
 * Activity graphs:     GET /guilds/:guildId/activity
 * Leaderboard reset:   DELETE /guilds/:guildId/leaderboard
 * Member search:       GET /guilds/:guildId/members
 */
export async function featureRoutes(server: FastifyInstance): Promise<void> {

  // ── Per-command toggles ───────────────────────────────────────────────────

  // Returns built-in commands and commands exposed by installed addons.
  // Addon commands are sourced from each addon's manifest to stay in sync
  // with what the bot actually registers.
  server.get('/guilds/:guildId/commands/available', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const BUILTIN: Array<{ name: string; category: string }> = [
      { name: 'ban',           category: 'Moderation' },
      { name: 'kick',          category: 'Moderation' },
      { name: 'mute',          category: 'Moderation' },
      { name: 'unban',         category: 'Moderation' },
      { name: 'warn',          category: 'Moderation' },
      { name: 'warnings',      category: 'Moderation' },
      { name: 'case',          category: 'Moderation' },
      { name: 'clearwarnings', category: 'Moderation' },
      { name: 'purge',         category: 'Moderation' },
      { name: 'suggestion',    category: 'Moderation' },
      { name: 'rank',          category: 'Leveling'   },
      { name: 'leaderboard',   category: 'Leveling'   },
      { name: 'givexp',        category: 'Leveling'   },
      { name: 'removexp',      category: 'Leveling'   },
      { name: 'leveling',      category: 'Leveling'   },
      { name: 'profile',       category: 'Leveling'   },
      { name: 'rankcard',      category: 'Leveling'   },
      { name: 'stats',         category: 'Leveling'   },
      { name: 'invites',       category: 'Community'  },
      { name: 'invitetop',     category: 'Community'  },
      { name: 'startcounting', category: 'Community'  },
      { name: 'avatar',        category: 'Utility'    },
      { name: 'ping',          category: 'Utility'    },
      { name: 'serverinfo',    category: 'Utility'    },
      { name: 'userinfo',      category: 'Utility'    },
      { name: 'poll',          category: 'Utility'    },
      { name: 'birthday',      category: 'Utility'    },
      { name: 'giveaway',      category: 'Utility'    },
      { name: 'remind',        category: 'Utility'    },
      { name: 'rep',           category: 'Utility'    },
      { name: 'suggest',       category: 'Utility'    },
      { name: 'help',          category: 'Utility'    },
      { name: 'play',          category: 'Music'      },
      { name: 'queue',         category: 'Music'      },
      { name: 'skip',          category: 'Music'      },
      { name: 'stop',          category: 'Music'      },
      { name: 'volume',        category: 'Music'      },
      { name: 'loop',          category: 'Music'      },
      { name: 'pause',         category: 'Music'      },
      { name: 'resume',        category: 'Music'      },
    ];

    const guildAddons = await prisma.guildAddon.findMany({
      where: { guildId, enabled: true },
      include: { addon: { select: { displayName: true, manifest: true } } },
    });

    const addonCommands: Array<{ name: string; category: string }> = [];
    for (const ga of guildAddons) {
      const manifest = ga.addon.manifest as { commands?: string[] };
      if (Array.isArray(manifest.commands)) {
        for (const cmdName of manifest.commands) {
          addonCommands.push({ name: cmdName, category: ga.addon.displayName });
        }
      }
    }

    return reply.send({ success: true, data: [...BUILTIN, ...addonCommands] });
  });

  server.get('/guilds/:guildId/commands/disabled', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.disabledCommand.findMany({ where: { guildId }, select: { commandName: true } });
    return reply.send({ success: true, data: rows.map((r) => r.commandName) });
  });

  server.post('/guilds/:guildId/commands/disabled', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { commandName } = request.body as { commandName: string };
    if (!commandName?.trim()) return reply.code(400).send({ success: false, error: 'commandName required' });
    await prisma.disabledCommand.upsert({
      where: { guildId_commandName: { guildId, commandName } },
      update: {},
      create: { guildId, commandName },
    });
    return reply.code(201).send({ success: true });
  });

  server.delete('/guilds/:guildId/commands/disabled/:commandName', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, commandName } = request.params as { guildId: string; commandName: string };
    await prisma.disabledCommand.deleteMany({ where: { guildId, commandName } });
    return reply.send({ success: true });
  });

  // ── Stats channels ────────────────────────────────────────────────────────

  server.get('/guilds/:guildId/stats-channels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.statsChannel.findMany({ where: { guildId } });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/stats-channels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, type, format } = request.body as { channelId: string; type: string; format?: string };
    if (!channelId || !type) return reply.code(400).send({ success: false, error: 'channelId and type required' });

    const defaults: Record<string, string> = {
      members: '👥 {value} Members',
      online: '🟢 {value} Online',
      boosts: '🚀 {value} Boosts',
      bots: '🤖 {value} Bots',
    };

    const row = await prisma.statsChannel.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: { type, format: format ?? defaults[type] ?? '{value}' },
      create: { guildId, channelId, type, format: format ?? defaults[type] ?? '{value}' },
    });

    await pub.publish('api:events', JSON.stringify({ type: 'stats-channels:refresh', data: { guildId } }));
    return reply.code(201).send({ success: true, data: row });
  });

  server.delete('/guilds/:guildId/stats-channels/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.statsChannel.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    await prisma.statsChannel.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Birthday tracker ──────────────────────────────────────────────────────

  server.get('/guilds/:guildId/birthdays/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const cfg = await prisma.birthdayConfig.findUnique({ where: { guildId } });
    return reply.send({ success: true, data: cfg ?? { enabled: false, channelId: null, birthdayRoleId: null, message: '🎂 Happy Birthday {user}! We hope you have a wonderful day!' } });
  });

  server.patch('/guilds/:guildId/birthdays/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as { enabled?: boolean; channelId?: string | null; birthdayRoleId?: string | null; message?: string };
    const cfg = await prisma.birthdayConfig.upsert({
      where: { guildId },
      update: { ...body },
      create: { guildId, ...body },
    });
    return reply.send({ success: true, data: cfg });
  });

  // Usernames are resolved via the Discord API on the fly and are not persisted,
  // so the response may fall back to the raw user ID if the bot token is absent.
  server.get('/guilds/:guildId/birthdays', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.birthday.findMany({ where: { guildId }, orderBy: [{ month: 'asc' }, { day: 'asc' }] });

    const token = process.env.DISCORD_TOKEN;
    const usernameMap: Record<string, string> = {};
    if (token) {
      await Promise.allSettled(rows.map(async (r) => {
        const res = await fetch(`https://discord.com/api/v10/users/${r.userId}`, {
          headers: { Authorization: `Bot ${token}` },
        });
        if (res.ok) {
          const user = await res.json() as { username: string; global_name?: string };
          usernameMap[r.userId] = user.global_name ?? user.username;
        }
      }));
    }

    const data = rows.map((r) => ({ ...r, username: usernameMap[r.userId] ?? r.userId }));
    return reply.send({ success: true, data });
  });

  // This endpoint uses requireAuth (not requireGuildAdmin) because it is called
  // by the bot on behalf of a member using the /birthday slash command.
  server.post('/guilds/:guildId/birthdays', { preHandler: [requireAuth] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { userId, month, day } = request.body as { userId: string; month: number; day: number };
    if (!userId || !month || !day) return reply.code(400).send({ success: false, error: 'userId, month, day required' });
    const row = await prisma.birthday.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { month, day },
      create: { guildId, userId, month, day },
    });
    return reply.code(201).send({ success: true, data: row });
  });

  server.delete('/guilds/:guildId/birthdays/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };
    await prisma.birthday.deleteMany({ where: { guildId, userId } });
    return reply.send({ success: true });
  });

  // ── Polls ─────────────────────────────────────────────────────────────────

  server.get('/guilds/:guildId/polls', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const polls = await prisma.poll.findMany({
      where: { guildId },
      include: { votes: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return reply.send({ success: true, data: polls });
  });

  // Called by the bot when a member uses the /poll command to persist the poll data.
  server.post('/guilds/:guildId/polls', { preHandler: [requireAuth] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, question, options, endsAt, multiVote, createdById } = request.body as {
      channelId: string; question: string; options: string[];
      endsAt?: string; multiVote?: boolean; createdById: string;
    };
    if (!channelId || !question || !options?.length) {
      return reply.code(400).send({ success: false, error: 'channelId, question, and options required' });
    }
    const poll = await prisma.poll.create({
      data: {
        guildId, channelId, question,
        options: options as unknown as import('@prisma/client').Prisma.InputJsonValue,
        endsAt: endsAt ? new Date(endsAt) : null,
        multiVote: multiVote ?? false,
        createdById,
      },
    });
    return reply.code(201).send({ success: true, data: poll });
  });

  // Called by the bot to store the Discord message ID after posting the poll embed.
  server.patch('/guilds/:guildId/polls/:pollId', { preHandler: [requireAuth] }, async (request, reply) => {
    const { guildId, pollId } = request.params as { guildId: string; pollId: string };
    const { messageId, closed } = request.body as { messageId?: string; closed?: boolean };
    const existing = await prisma.poll.findFirst({ where: { id: pollId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Poll not found' });
    const updated = await prisma.poll.update({
      where: { id: pollId },
      data: { ...(messageId !== undefined && { messageId }), ...(closed !== undefined && { closed }) },
    });
    return reply.send({ success: true, data: updated });
  });

  server.post('/guilds/:guildId/polls/:pollId/vote', { preHandler: [requireAuth] }, async (request, reply) => {
    const { guildId, pollId } = request.params as { guildId: string; pollId: string };
    const { userId, optionIndex } = request.body as { userId: string; optionIndex: number };

    const poll = await prisma.poll.findFirst({ where: { id: pollId, guildId, closed: false } });
    if (!poll) return reply.code(404).send({ success: false, error: 'Poll not found or closed' });

    if (!poll.multiVote) {
      // Single-vote polls: replace the user's existing vote.
      await prisma.pollVote.deleteMany({ where: { pollId, userId } });
    }

    await prisma.pollVote.upsert({
      where: { pollId_userId_optionIndex: { pollId, userId, optionIndex } },
      update: {},
      create: { pollId, userId, optionIndex },
    });

    const votes = await prisma.pollVote.findMany({ where: { pollId } });
    return reply.send({ success: true, data: votes });
  });

  server.delete('/guilds/:guildId/polls/:pollId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, pollId } = request.params as { guildId: string; pollId: string };
    const existing = await prisma.poll.findFirst({ where: { id: pollId, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Poll not found' });
    await prisma.poll.delete({ where: { id: pollId } });
    return reply.send({ success: true });
  });

  // ── Scheduled messages ────────────────────────────────────────────────────

  server.get('/guilds/:guildId/scheduled-messages', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.scheduledMessage.findMany({ where: { guildId }, orderBy: { scheduledAt: 'asc' } });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/scheduled-messages', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, content, embed, scheduledAt, repeat, timezone, daysOfWeek } = request.body as {
      channelId: string; content: string; embed?: boolean; scheduledAt: string; repeat?: string; timezone?: string | null; daysOfWeek?: number[];
    };
    if (!channelId || !content || !scheduledAt) {
      return reply.code(400).send({ success: false, error: 'channelId, content, scheduledAt required' });
    }
    const tz = cleanTimezone(timezone);
    const row = await prisma.scheduledMessage.create({
      data: {
        guildId, channelId, content, embed: embed ?? false,
        scheduledAt: resolveScheduledAt(scheduledAt, tz),
        repeat: repeat ?? null,
        timezone: tz,
        daysOfWeek: cleanDays(daysOfWeek),
      },
    });
    return reply.code(201).send({ success: true, data: row });
  });

  server.patch('/guilds/:guildId/scheduled-messages/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as { channelId?: string; content?: string; embed?: boolean; scheduledAt?: string; repeat?: string | null; enabled?: boolean; timezone?: string | null; daysOfWeek?: number[] };
    const existing = await prisma.scheduledMessage.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    const effectiveTz = body.timezone !== undefined ? cleanTimezone(body.timezone) : (existing.timezone ?? null);
    const { timezone: _tz, daysOfWeek: _dow, scheduledAt: _sa, ...rest } = body;
    const updated = await prisma.scheduledMessage.update({
      where: { id },
      data: {
        ...rest,
        ...(body.timezone !== undefined && { timezone: effectiveTz }),
        ...(body.daysOfWeek !== undefined && { daysOfWeek: cleanDays(body.daysOfWeek) }),
        ...(body.scheduledAt && { scheduledAt: resolveScheduledAt(body.scheduledAt, effectiveTz) }),
      },
    });
    return reply.send({ success: true, data: updated });
  });

  server.delete('/guilds/:guildId/scheduled-messages/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.scheduledMessage.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    await prisma.scheduledMessage.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Auto-slowmode ─────────────────────────────────────────────────────────

  server.get('/guilds/:guildId/slowmode', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.slowmodeConfig.findMany({ where: { guildId } });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/slowmode', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { channelId, enabled, threshold, windowSeconds, slowmodeSeconds, resetAfter } = request.body as {
      channelId: string; enabled?: boolean; threshold?: number; windowSeconds?: number; slowmodeSeconds?: number; resetAfter?: number;
    };
    if (!channelId) return reply.code(400).send({ success: false, error: 'channelId required' });
    const row = await prisma.slowmodeConfig.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: { enabled: enabled ?? true, threshold: threshold ?? 10, windowSeconds: windowSeconds ?? 10, slowmodeSeconds: slowmodeSeconds ?? 5, resetAfter: resetAfter ?? 30 },
      create: { guildId, channelId, enabled: enabled ?? true, threshold: threshold ?? 10, windowSeconds: windowSeconds ?? 10, slowmodeSeconds: slowmodeSeconds ?? 5, resetAfter: resetAfter ?? 30 },
    });
    return reply.code(201).send({ success: true, data: row });
  });

  server.patch('/guilds/:guildId/slowmode/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as { enabled?: boolean; threshold?: number; windowSeconds?: number; slowmodeSeconds?: number; resetAfter?: number };
    const existing = await prisma.slowmodeConfig.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    const updated = await prisma.slowmodeConfig.update({ where: { id }, data: body });
    return reply.send({ success: true, data: updated });
  });

  server.delete('/guilds/:guildId/slowmode/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.slowmodeConfig.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    await prisma.slowmodeConfig.delete({ where: { id } });
    return reply.send({ success: true });
  });

  // ── Activity graphs ───────────────────────────────────────────────────────

  server.get('/guilds/:guildId/activity', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { days?: string };
    const days = Math.min(parseInt(query.days ?? '30'), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await prisma.messageActivity.findMany({
      where: { guildId, date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    return reply.send({ success: true, data: rows });
  });

  // ── Leaderboard and member search ─────────────────────────────────────────

  server.delete('/guilds/:guildId/leaderboard', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { count } = await prisma.userLevel.deleteMany({ where: { guildId } });
    return reply.send({ success: true, data: { deleted: count } });
  });

  server.get('/guilds/:guildId/members', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const query = request.query as { search?: string };

    const rows = await prisma.userLevel.findMany({
      where: {
        guildId,
        ...(query.search ? { userTag: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      orderBy: { xp: 'desc' },
      take: 50,
      select: { userId: true, userTag: true, level: true, xp: true },
    });

    return reply.send({ success: true, data: rows });
  });
}
