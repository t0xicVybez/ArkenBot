import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { resolveRoleMentions } from '../utils/roleMentions.js';

export async function streamAlertRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // STREAM ALERTS
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/stream-alerts
  server.get('/guilds/:guildId/stream-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const alerts = await prisma.streamAlert.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    return reply.send({ success: true, data: alerts });
  });

  // POST /guilds/:guildId/stream-alerts
  server.post('/guilds/:guildId/stream-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { platform, channelUsername, discordChannelId, message } = request.body as Record<string, unknown>;

    if (!platform || !discordChannelId) {
      return reply.code(400).send({ success: false, error: 'platform and discordChannelId are required' });
    }
    if (!['twitch', 'kick', 'twitter', 'reddit', 'rss'].includes(platform as string)) {
      return reply.code(400).send({ success: false, error: 'platform must be twitch, kick, twitter, reddit, or rss' });
    }

    if (!channelUsername) {
      return reply.code(400).send({ success: false, error: 'platform, channelUsername and discordChannelId are required' });
    }

    const resolvedMessage = await resolveRoleMentions(guildId, typeof message === 'string' ? message : undefined);
    const alert = await prisma.streamAlert.create({
      data: {
        guildId,
        platform: platform as string,
        channelUsername: (channelUsername as string).toLowerCase(),
        discordChannelId: discordChannelId as string,
        message: resolvedMessage ?? undefined,
      },
    });
    return reply.code(201).send({ success: true, data: alert });
  });

  // PATCH /guilds/:guildId/stream-alerts/:id
  server.patch('/guilds/:guildId/stream-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.streamAlert.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });

    let resolvedMessage: string | undefined;
    if (body.message !== undefined) {
      resolvedMessage = await resolveRoleMentions(
        guildId,
        typeof body.message === 'string' ? body.message : undefined,
      );
    }

    const data: Record<string, unknown> = {};
    if (body.enabled !== undefined) data.enabled = body.enabled;
    if (body.discordChannelId) data.discordChannelId = body.discordChannelId;

    if (body.channelUsername) {
      data.channelUsername = (body.channelUsername as string).toLowerCase();
    }

    if (body.message !== undefined) {
      data.message = resolvedMessage?.trim() || undefined;
    }

    if (Object.keys(data).length === 0) {
      return reply.send({ success: true });
    }

    await prisma.streamAlert.update({ where: { id }, data: data as Prisma.StreamAlertUpdateInput });
    return reply.send({ success: true });
  });

  // DELETE /guilds/:guildId/stream-alerts/:id
  server.delete('/guilds/:guildId/stream-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.streamAlert.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });
}
