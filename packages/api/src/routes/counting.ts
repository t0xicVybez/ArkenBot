
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Configuration and stats for the counting game.
 *
 * Routes:
 *   GET    /guilds/:guildId/counting
 *   POST   /guilds/:guildId/counting/reset
 */
export async function countingRoutes(server: FastifyInstance): Promise<void> {
  server.get('/guilds/:guildId/counting', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const state = await prisma.countingState.findUnique({ where: { guildId } });

    return reply.send({
      success: true,
      data: {
        installed: true,
        enabled:   !!state?.channelId,
        settings:  {
          channelId:     state?.channelId ?? null,
          allowSameUser: state?.allowSameUser ?? false,
          resetOnFail:   state?.resetOnFail ?? true,
        } as Record<string, unknown>,
        currentCount: state?.currentCount ?? 0,
        bestCount:    state?.bestCount    ?? 0,
        lastUserId:   state?.lastUserId   ?? null,
      },
    });
  });

  server.post('/guilds/:guildId/counting/reset', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    await prisma.countingState.updateMany({
      where: { guildId },
      data:  { currentCount: 0, lastUserId: null },
    });
    return reply.send({ success: true });
  });
}
