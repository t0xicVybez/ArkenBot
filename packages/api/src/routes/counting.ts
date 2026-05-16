/**
 * Routes for reading and managing the counting game state for a guild.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Registers counting game routes.
 *
 * GET  /guilds/:guildId/counting        — current count, best count, and addon status
 * POST /guilds/:guildId/counting/reset  — reset the current count to zero
 */
export async function countingRoutes(server: FastifyInstance): Promise<void> {
  server.get('/guilds/:guildId/counting', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const [state, guildAddon] = await Promise.all([
      prisma.countingState.findUnique({ where: { guildId } }),
      prisma.guildAddon.findFirst({
        where: { guildId, addon: { name: 'counting' } },
        select: { enabled: true, settings: true },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        installed: !!guildAddon,
        enabled:   guildAddon?.enabled ?? false,
        settings:  (guildAddon?.settings ?? {}) as Record<string, unknown>,
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
