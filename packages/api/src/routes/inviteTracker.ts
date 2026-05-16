import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

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
    }
  }));
  return results;
}

const PatchSchema = z.object({
  enabled: z.boolean(),
}).strict();

export async function inviteTrackerRoutes(server: FastifyInstance): Promise<void> {
  // GET /guilds/:guildId/invite-tracker
  server.get('/guilds/:guildId/invite-tracker', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;

    const rows = await prisma.inviteCount.findMany({
      where:   { guildId, invites: { gt: 0 } },
      orderBy: [{ invites: 'desc' }],
      take:    25,
    });

    // Fetch all InviteJoin records for these inviters in one query.
    const inviterIds = rows.map((r) => r.userId);
    const joinRecords = inviterIds.length > 0
      ? await (prisma as any).inviteJoin.findMany({
          where:   { guildId, inviterId: { in: inviterIds } },
          orderBy: { joinedAt: 'desc' },
        })
      : [];

    // Group join records by inviterId.
    const joinsByInviter = new Map<string, typeof joinRecords>();
    for (const rec of joinRecords) {
      const list = joinsByInviter.get(rec.inviterId) ?? [];
      list.push(rec);
      joinsByInviter.set(rec.inviterId, list);
    }

    const usernameMap = await resolveUsernames(rows.map((r) => r.userId));
    const leaderboard = rows.map((r) => ({
      ...r,
      username: usernameMap[r.userId] ?? r.userId,
      invitees: (joinsByInviter.get(r.userId) ?? []).map((j: any) => ({
        userId:   j.joinedUserId,
        username: j.joinedUsername ?? j.joinedUserId,
        joinedAt: j.joinedAt,
        leftAt:   j.leftAt,
      })),
    }));

    return reply.send({
      success: true,
      data: {
        enabled:     extended.inviteTrackerEnabled === true,
        leaderboard,
      },
    });
  });

  // PATCH /guilds/:guildId/invite-tracker
  server.patch('/guilds/:guildId/invite-tracker', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { enabled } = PatchSchema.parse(request.body);

    const current  = await prisma.guildSettings.findUnique({ where: { guildId } });
    const extended = { ...((current?.extended ?? {}) as Record<string, unknown>), inviteTrackerEnabled: enabled };

    await prisma.guildSettings.upsert({
      where:  { guildId },
      update: { extended: extended as never },
      create: { guildId, extended: extended as never },
    });

    return reply.send({ success: true });
  });

  // PATCH /guilds/:guildId/invite-tracker/bonus — add/remove bonus invites manually
  server.patch('/guilds/:guildId/invite-tracker/bonus', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { userId, bonus } = request.body as { userId: string; bonus: number };

    if (!userId || typeof bonus !== 'number') {
      return reply.code(400).send({ success: false, error: 'userId and bonus (number) required' });
    }

    const row = await prisma.inviteCount.upsert({
      where:  { guildId_userId: { guildId, userId } },
      update: { bonus },
      create: { guildId, userId, bonus },
    });

    return reply.send({ success: true, data: row });
  });
}
