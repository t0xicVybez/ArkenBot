import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

/**
 * Parses a human duration string (e.g. "1h", "3d", "30m") into milliseconds.
 * Mirrors the bot's `/giveaway` duration parser so the dashboard and the slash
 * command accept the same format. Returns `null` for an unrecognised string.
 */
function parseDurationMs(str: string): number | null {
  const match = str.trim().match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * (unit[match[2].toLowerCase()] ?? 0);
}

async function resolveUsernames(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const token = process.env.DISCORD_TOKEN;
  if (!token) return {};
  const results: Record<string, string> = {};
  await Promise.allSettled(userIds.map(async (id) => {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const user = await res.json() as { username: string; global_name?: string };
      results[id] = user.global_name ?? user.username;
    } else {
      results[id] = id;
    }
  }));
  return results;
}

export async function giveawayRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // GIVEAWAYS
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/giveaways?ended=true/false
  server.get('/guilds/:guildId/giveaways', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const ended = (request.query as any).ended;
    const where: any = { guildId };
    if (ended === 'true') where.ended = true;
    if (ended === 'false') where.ended = false;
    const giveaways = await prisma.giveaway.findMany({ where, orderBy: { createdAt: 'desc' } });

    // Resolve all unique winner IDs to usernames in one pass
    const allWinnerIds = [...new Set(giveaways.flatMap((g) => g.winnerIds))];
    const usernameMap = await resolveUsernames(allWinnerIds);

    const data = giveaways.map((g) => ({
      ...g,
      winnerNames: g.winnerIds.map((id) => usernameMap[id] ?? id),
    }));

    return reply.send({ success: true, data });
  });

  // GET /guilds/:guildId/giveaways/:id
  server.get('/guilds/:guildId/giveaways/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId } });
    if (!giveaway) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true, data: giveaway });
  });

  // POST /guilds/:guildId/giveaways — create from dashboard
  server.post('/guilds/:guildId/giveaways', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as {
      prize?: string;
      duration?: string;
      winnersCount?: number;
      channelId?: string;
      requiredRoleId?: string;
      bonusRoleEntries?: unknown;
    };

    if (!body.prize?.trim()) return reply.code(400).send({ success: false, error: 'prize is required' });
    if (!body.duration) return reply.code(400).send({ success: false, error: 'duration is required' });
    if (!body.channelId) return reply.code(400).send({ success: false, error: 'channelId is required' });

    // The dashboard sends a human duration ("1h", "3d", "30m"); fall back to
    // parsing an ISO date string for any other caller.
    const durationMs = parseDurationMs(body.duration);
    const endsAt = durationMs !== null ? new Date(Date.now() + durationMs) : new Date(body.duration);
    if (isNaN(endsAt.getTime()) || endsAt <= new Date()) {
      return reply.code(400).send({ success: false, error: 'duration must be a value like 1h, 3d, 30m (or a future ISO date)' });
    }

    const portalUser = (request as unknown as { user?: { id: string; username: string } }).user;
    const hostId = portalUser?.id ?? 'portal';

    // The winner draw reads bonus entries under the key `bonusEntries`; older
    // dashboard payloads used `entries`. Normalise so bonus roles actually count.
    const bonusRoleEntries = Array.isArray(body.bonusRoleEntries)
      ? (body.bonusRoleEntries as Array<Record<string, unknown>>)
          .filter((e) => e && typeof e.roleId === 'string')
          .map((e) => ({ roleId: e.roleId as string, bonusEntries: Number(e.bonusEntries ?? e.entries ?? 1) }))
      : undefined;

    const giveaway = await prisma.giveaway.create({
      data: {
        guildId,
        channelId: body.channelId,
        hostId,
        prize: body.prize.trim(),
        winnersCount: body.winnersCount ?? 1,
        endsAt,
        winnerIds: [],
        ...(body.requiredRoleId && { requiredRoleId: body.requiredRoleId }),
        ...(bonusRoleEntries && bonusRoleEntries.length > 0 && { bonusRoleEntries: bonusRoleEntries as import('@prisma/client').Prisma.InputJsonValue }),
      },
    });

    // Notify bot to post the giveaway message in Discord
    pub.publish('giveaway:start', JSON.stringify({ guildId, giveawayId: giveaway.id })).catch(() => null);

    return reply.code(201).send({ success: true, data: giveaway });
  });

  // DELETE /guilds/:guildId/giveaways/:id
  server.delete('/guilds/:guildId/giveaways/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.giveaway.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });
}
