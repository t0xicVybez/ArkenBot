import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Reputation-system data and leaderboards.
 *
 * Routes:
 *   GET    /guilds/:guildId/reputation/top
 *   GET    /guilds/:guildId/reputation/:userId
 */
export async function reputationRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/reputation/top', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const top = await prisma.reputation.groupBy({
      by: ['receiverId'],
      where: { guildId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 25,
    });

    return reply.send({
      success: true,
      data: top.map((r) => ({ userId: r.receiverId, rep: r._count.id })),
    });
  });

  server.get('/guilds/:guildId/reputation/:userId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, userId } = request.params as { guildId: string; userId: string };

    const total = await prisma.reputation.count({ where: { guildId, receiverId: userId } });
    const given = await prisma.reputation.count({ where: { guildId, giverId: userId } });

    return reply.send({ success: true, data: { userId, received: total, given } });
  });
}
