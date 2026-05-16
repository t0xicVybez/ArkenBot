import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

export async function levelRoleRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // LEVEL ROLES
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/level-roles
  server.get('/guilds/:guildId/level-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const roles = await prisma.levelRole.findMany({ where: { guildId }, orderBy: { level: 'asc' } });
    return reply.send({ success: true, data: roles });
  });

  // POST /guilds/:guildId/level-roles
  server.post('/guilds/:guildId/level-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { level, roleId } = request.body as any;
    if (!level || !roleId) return reply.code(400).send({ success: false, error: 'level and roleId are required' });
    const role = await prisma.levelRole.upsert({
      where: { guildId_level: { guildId, level: Number(level) } },
      update: { roleId },
      create: { guildId, level: Number(level), roleId },
    });
    return reply.code(201).send({ success: true, data: role });
  });

  // DELETE /guilds/:guildId/level-roles/:level
  server.delete('/guilds/:guildId/level-roles/:level', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, level } = request.params as { guildId: string; level: string };
    await prisma.levelRole.deleteMany({ where: { guildId, level: Number(level) } });
    return reply.code(204).send();
  });
}
