/**
 * Routes for managing guild-specific custom text commands.
 */
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

/**
 * Registers custom command routes.
 *
 * GET    /guilds/:guildId/custom-commands      — list all custom commands
 * POST   /guilds/:guildId/custom-commands      — create a new custom command
 * PATCH  /guilds/:guildId/custom-commands/:id  — update a custom command
 * DELETE /guilds/:guildId/custom-commands/:id  — delete a custom command
 */
export async function customCommandRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/custom-commands', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const commands = await prisma.customCommand.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
    return reply.send({ success: true, data: commands });
  });

  server.post('/guilds/:guildId/custom-commands', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { name, aliases, response, embed, embedTitle, embedColor, deleteInvoking, dmResponse, cooldown } = request.body as any;
    if (!name || !response) {
      return reply.code(400).send({ success: false, error: 'name and response are required' });
    }
    const command = await prisma.customCommand.create({
      data: {
        guildId,
        name: name.toLowerCase().trim(),
        aliases: aliases ?? [],
        response,
        embed: embed ?? false,
        embedTitle: embedTitle ?? null,
        embedColor: embedColor ?? null,
        deleteInvoking: deleteInvoking ?? false,
        dmResponse: dmResponse ?? false,
        cooldown: cooldown ?? 0,
      },
    });
    return reply.code(201).send({ success: true, data: command });
  });

  server.patch('/guilds/:guildId/custom-commands/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as any;
    const result = await prisma.customCommand.updateMany({
      where: { id, guildId },
      data: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.response !== undefined && { response: body.response }),
        ...(body.embed !== undefined && { embed: body.embed }),
        ...(body.embedTitle !== undefined && { embedTitle: body.embedTitle }),
        ...(body.embedColor !== undefined && { embedColor: body.embedColor }),
        ...(body.deleteInvoking !== undefined && { deleteInvoking: body.deleteInvoking }),
        ...(body.dmResponse !== undefined && { dmResponse: body.dmResponse }),
        ...(body.cooldown !== undefined && { cooldown: body.cooldown }),
        ...(body.aliases !== undefined && { aliases: body.aliases }),
      },
    });
    if (result.count === 0) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true });
  });

  server.delete('/guilds/:guildId/custom-commands/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.customCommand.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });
}
