
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { redis } from '../redis.js';

const CACHE_KEY = (guildId: string) => `sr:list:${guildId}`;

async function bustCache(guildId: string) {
  await redis.del(CACHE_KEY(guildId));
}

/**
 * Configure which roles members may self-assign.
 *
 * Routes:
 *   GET    /guilds/:guildId/self-roles
 *   POST   /guilds/:guildId/self-roles
 *   DELETE /guilds/:guildId/self-roles/:id
 */
export async function selfRoleRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/self-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.selfRole.findMany({
      where: { guildId },
      select: { id: true, roleId: true, name: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/self-roles', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { roleId, name } = request.body as { roleId?: string; name?: string };

    if (!roleId || !name) {
      return reply.code(400).send({ success: false, error: 'roleId and name are required' });
    }

    const cleanName = name.toLowerCase().trim();
    if (!cleanName) {
      return reply.code(400).send({ success: false, error: 'name cannot be empty' });
    }

    try {
      const row = await prisma.selfRole.create({
        data: { guildId, roleId, name: cleanName },
        select: { id: true, roleId: true, name: true },
      });
      await bustCache(guildId);
      return reply.code(201).send({ success: true, data: row });
    } catch {
      return reply.code(409).send({ success: false, error: 'A self-assignable role with that name or role ID already exists' });
    }
  });

  server.delete('/guilds/:guildId/self-roles/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const result = await prisma.selfRole.deleteMany({ where: { id, guildId } });
    if (!result.count) return reply.code(404).send({ success: false, error: 'Not found' });
    await bustCache(guildId);
    return reply.code(204).send();
  });
}
