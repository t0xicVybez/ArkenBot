import type { FastifyInstance } from 'fastify';
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

  // DELETE /guilds/:guildId/giveaways/:id
  server.delete('/guilds/:guildId/giveaways/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.giveaway.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });
}
