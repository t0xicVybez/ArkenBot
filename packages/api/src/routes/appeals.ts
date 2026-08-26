import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

export async function appealsRoutes(server: FastifyInstance): Promise<void> {
  // ── Public (any logged-in user): servers where they can appeal ──
  server.get('/me/appealable', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user!.id; // PortalUser.id is the Discord user ID
    // Active ban/mute cases for this user, in guilds that have appeals enabled.
    const cases = await prisma.moderationCase.findMany({
      where: { userId, active: true, type: { in: ['ban', 'tempban', 'mute'] } },
      select: { guildId: true, type: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (cases.length === 0) return reply.send({ success: true, data: [] });

    const guildIds = [...new Set(cases.map((c) => c.guildId))];
    const [settings, guilds, pending] = await Promise.all([
      prisma.guildSettings.findMany({ where: { guildId: { in: guildIds }, appealsEnabled: true }, select: { guildId: true } }),
      prisma.guild.findMany({ where: { id: { in: guildIds } }, select: { id: true, name: true, iconUrl: true } }),
      prisma.moderationAppeal.findMany({ where: { userId, status: 'pending' }, select: { guildId: true } }),
    ]);
    const enabled = new Set(settings.map((s) => s.guildId));
    const pendingSet = new Set(pending.map((p) => p.guildId));
    const guildMap = new Map(guilds.map((g) => [g.id, g]));

    // One appealable entry per guild (dedupe cases), preferring a ban over a mute.
    const seen = new Set<string>();
    const data = [] as Array<{ guildId: string; guildName: string; guildIcon: string | null; type: string; reason: string; hasPending: boolean }>;
    for (const c of cases) {
      if (!enabled.has(c.guildId) || seen.has(c.guildId)) continue;
      seen.add(c.guildId);
      const g = guildMap.get(c.guildId);
      data.push({
        guildId: c.guildId,
        guildName: g?.name ?? 'Unknown server',
        guildIcon: g?.iconUrl ?? null,
        type: c.type === 'mute' ? 'mute' : 'ban',
        reason: c.reason,
        hasPending: pendingSet.has(c.guildId),
      });
    }
    return reply.send({ success: true, data });
  });

  // ── Public: submit an appeal for a guild the user is banned/muted in ──
  server.post('/me/appeals', { preHandler: [requireAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    const userTag = request.user!.username;
    const body = parse(z.object({ guildId: z.string().min(1).max(32), reason: z.string().min(5).max(1000) }), request.body, reply);
    if (!body) return;

    const settings = await prisma.guildSettings.findUnique({ where: { guildId: body.guildId }, select: { appealsEnabled: true, appealChannelId: true } });
    if (!settings?.appealsEnabled || !settings.appealChannelId) return reply.code(400).send({ success: false, error: 'Appeals are not enabled for that server.' });

    const activeCase = await prisma.moderationCase.findFirst({ where: { guildId: body.guildId, userId, active: true, type: { in: ['ban', 'tempban', 'mute'] } }, orderBy: { createdAt: 'desc' } });
    if (!activeCase) return reply.code(400).send({ success: false, error: 'You have no active ban or mute to appeal in that server.' });

    const dup = await prisma.moderationAppeal.findFirst({ where: { guildId: body.guildId, userId, status: 'pending' } });
    if (dup) return reply.code(409).send({ success: false, error: 'You already have a pending appeal for that server.' });

    const type = activeCase.type === 'mute' ? 'mute' : 'ban';
    const appeal = await prisma.moderationAppeal.create({ data: { guildId: body.guildId, userId, userTag, type, reason: body.reason } });
    await pub.publish('api:events', JSON.stringify({ type: 'appeal:submitted', data: { appealId: appeal.id } }));
    return reply.send({ success: true, data: { id: appeal.id } });
  });

  // ── Staff (guild admin): list appeals for a guild ──
  server.get('/guilds/:guildId/appeals', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { status } = request.query as { status?: string };
    const where: { guildId: string; status?: string } = { guildId };
    if (status && ['pending', 'approved', 'denied'].includes(status)) where.status = status;
    const appeals = await prisma.moderationAppeal.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 100 });
    return reply.send({ success: true, data: appeals });
  });

  // ── Staff: approve/deny an appeal from the dashboard ──
  server.post('/guilds/:guildId/appeals/:id/decision', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = parse(z.object({ action: z.enum(['approve', 'deny']) }), request.body, reply);
    if (!body) return;
    const approved = body.action === 'approve';
    // Atomically claim the pending appeal so the Discord buttons can't double-handle it.
    const claimed = await prisma.moderationAppeal.updateMany({
      where: { id, guildId, status: 'pending' },
      data: { status: approved ? 'approved' : 'denied', reviewedBy: request.user!.id, reviewedAt: new Date() },
    });
    if (claimed.count === 0) return reply.code(409).send({ success: false, error: 'That appeal is no longer pending.' });
    await pub.publish('api:events', JSON.stringify({ type: 'appeal:decision', data: { appealId: id, approved, reviewerTag: request.user!.username } }));
    const appeal = await prisma.moderationAppeal.findUnique({ where: { id } });
    return reply.send({ success: true, data: appeal });
  });
}
