
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Per-role command allow/deny rules and disabled-command toggles.
 *
 * Routes:
 *   GET    /guilds/:guildId/command-permissions
 *   POST   /guilds/:guildId/command-permissions
 *   DELETE /guilds/:guildId/command-permissions/:id
 */
export async function commandPermissionRoutes(server: FastifyInstance): Promise<void> {
  server.get('/guilds/:guildId/command-permissions', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const permissions = await prisma.commandRolePermission.findMany({
      where: { guildId },
      orderBy: [{ commandName: 'asc' }, { roleId: 'asc' }],
    });
    return reply.send({ success: true, data: permissions });
  });

  server.post('/guilds/:guildId/command-permissions', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = z.object({
      commandName: z.string().min(1).max(64),
      roleId: z.string().min(1),
      allow: z.boolean(),
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body' });
    }

    const { commandName, roleId, allow } = parsed.data;

    const permission = await prisma.commandRolePermission.upsert({
      where: { guildId_commandName_roleId: { guildId, commandName, roleId } },
      update: { allow },
      create: { guildId, commandName, roleId, allow },
    });

    return reply.send({ success: true, data: permission });
  });

  server.delete('/guilds/:guildId/command-permissions/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.commandRolePermission.deleteMany({ where: { id, guildId } });
    return reply.send({ success: true });
  });
}
