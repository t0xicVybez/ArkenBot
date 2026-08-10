/**
 * Routes for managing guild-specific custom text commands.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';

const cmdFields = {
  aliases: z.array(z.string().trim().min(1).max(32)).max(25).optional(),
  response: z.string().min(1).max(2000),
  embed: z.boolean().optional(),
  embedTitle: z.string().max(256).nullish(),
  embedColor: z.string().max(16).nullish(),
  deleteInvoking: z.boolean().optional(),
  dmResponse: z.boolean().optional(),
  cooldown: z.number().int().min(0).max(86400).optional(),
};

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
    const input = parse(z.object({
      name: z.string().trim().min(1).max(32),
      ...cmdFields,
    }), request.body, reply);
    if (!input) return;
    const command = await prisma.customCommand.create({
      data: {
        guildId,
        name: input.name.toLowerCase(),
        aliases: input.aliases ?? [],
        response: input.response,
        embed: input.embed ?? false,
        embedTitle: input.embedTitle ?? null,
        embedColor: input.embedColor ?? null,
        deleteInvoking: input.deleteInvoking ?? false,
        dmResponse: input.dmResponse ?? false,
        cooldown: input.cooldown ?? 0,
      },
    });
    return reply.code(201).send({ success: true, data: command });
  });

  server.patch('/guilds/:guildId/custom-commands/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = parse(z.object({
      enabled: z.boolean().optional(),
      ...cmdFields,
      response: cmdFields.response.optional(),
    }), request.body, reply);
    if (!body) return;
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
