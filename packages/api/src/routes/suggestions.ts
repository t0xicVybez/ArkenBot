import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { parse } from '../utils/validate.js';
import { prisma } from '../database.js';

/**
 * Suggestion-box configuration and staff management of submissions.
 *
 * Routes:
 *   GET    /guilds/:guildId/suggestions/config
 *   PATCH  /guilds/:guildId/suggestions/config
 *   GET    /guilds/:guildId/suggestions
 *   PATCH  /guilds/:guildId/suggestions/:id
 */
export async function suggestionRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/suggestions/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.suggestionConfig.findUnique({ where: { guildId } });
    return reply.send({ success: true, data: config ?? { guildId, enabled: false, channelId: null, reviewChannelId: null, allowVoting: true } });
  });

  server.patch('/guilds/:guildId/suggestions/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = parse(z.object({
      enabled: z.boolean().optional(),
      channelId: z.string().max(32).nullish(),
      reviewChannelId: z.string().max(32).nullish(),
      allowVoting: z.boolean().optional(),
    }), request.body, reply);
    if (!body) return;
    const config = await prisma.suggestionConfig.upsert({
      where: { guildId },
      update: { ...body },
      create: { guildId, ...body },
    });
    return reply.send({ success: true, data: config });
  });

  server.get('/guilds/:guildId/suggestions', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { status } = request.query as { status?: string };
    const where: { guildId: string; status?: string } = { guildId };
    if (status) where.status = status;
    const suggestions = await prisma.suggestion.findMany({ where, orderBy: { createdAt: 'desc' } });
    return reply.send({ success: true, data: suggestions });
  });

  server.patch('/guilds/:guildId/suggestions/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = parse(z.object({
      status: z.string().max(32).optional(),
      staffNote: z.string().max(1000).nullish(),
    }), request.body, reply);
    if (!body) return;
    const updated = await prisma.suggestion.updateMany({
      where: { id, guildId },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.staffNote !== undefined && { staffNote: body.staffNote }),
      },
    });
    if (updated.count === 0) return reply.code(404).send({ success: false, error: 'Not found' });
    return reply.send({ success: true });
  });
}
