import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

export async function starboardRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // STARBOARD
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/starboard/config
  server.get('/guilds/:guildId/starboard/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.starboardConfig.findUnique({ where: { guildId } });
    return reply.send({ success: true, data: config ?? { guildId, enabled: false, channelId: null, threshold: 3, emoji: '⭐', selfStar: false } });
  });

  // PATCH /guilds/:guildId/starboard/config
  server.patch('/guilds/:guildId/starboard/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as any;
    const config = await prisma.starboardConfig.upsert({
      where: { guildId },
      update: { ...body },
      create: { guildId, ...body },
    });
    return reply.send({ success: true, data: config });
  });

  // GET /guilds/:guildId/starboard/entries
  server.get('/guilds/:guildId/starboard/entries', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const entries = await prisma.starboardEntry.findMany({ where: { guildId }, orderBy: { starCount: 'desc' }, take: 50 });
    return reply.send({ success: true, data: entries });
  });
}
