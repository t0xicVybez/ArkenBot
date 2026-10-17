
import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

type EmbedField = { name: string; value: string; inline?: boolean };

type EmbedBody = {
  name?: string;
  messageContent?: string | null;
  embedTitle?: string | null;
  embedDescription?: string | null;
  embedColor?: string | null;
  embedUrl?: string | null;
  embedTimestamp?: boolean;
  embedAuthorName?: string | null;
  embedAuthorIconUrl?: string | null;
  embedAuthorUrl?: string | null;
  embedThumbnailUrl?: string | null;
  embedImageUrl?: string | null;
  embedFooterText?: string | null;
  embedFooterIconUrl?: string | null;
  embedFields?: EmbedField[];
};

/**
 * Saved embeds, and sending an embed to a channel from the dashboard.
 *
 * Routes:
 *   GET    /guilds/:guildId/embeds
 *   POST   /guilds/:guildId/embeds
 *   PATCH  /guilds/:guildId/embeds/:id
 *   DELETE /guilds/:guildId/embeds/:id
 *   POST   /guilds/:guildId/embeds/:id/send
 */
export async function embedRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/embeds', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const rows = await prisma.guildEmbed.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: rows });
  });

  server.post('/guilds/:guildId/embeds', {
    preHandler: [requireGuildAdmin],
    // Embed images are sent as base64 data URIs (~33% larger than the raw file);
    // the dashboard caps the raw image at 3MB, so allow 6MB here (matches the
    // personalization route and nginx's client_max_body_size).
    bodyLimit: 6 * 1024 * 1024,
  }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as EmbedBody;

    if (!body.name?.trim()) {
      return reply.code(400).send({ success: false, error: 'name required' });
    }

    const row = await prisma.guildEmbed.create({
      data: {
        guildId,
        name: body.name.trim(),
        messageContent: body.messageContent ?? null,
        embedTitle: body.embedTitle ?? null,
        embedDescription: body.embedDescription ?? null,
        embedColor: body.embedColor ?? null,
        embedUrl: body.embedUrl ?? null,
        embedTimestamp: body.embedTimestamp ?? false,
        embedAuthorName: body.embedAuthorName ?? null,
        embedAuthorIconUrl: body.embedAuthorIconUrl ?? null,
        embedAuthorUrl: body.embedAuthorUrl ?? null,
        embedThumbnailUrl: body.embedThumbnailUrl ?? null,
        embedImageUrl: body.embedImageUrl ?? null,
        embedFooterText: body.embedFooterText ?? null,
        embedFooterIconUrl: body.embedFooterIconUrl ?? null,
        embedFields: (body.embedFields ?? []) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    return reply.code(201).send({ success: true, data: row });
  });

  server.patch('/guilds/:guildId/embeds/:id', {
    preHandler: [requireGuildAdmin],
    // See the POST handler: base64 image uploads need headroom over the raw 3MB cap.
    bodyLimit: 6 * 1024 * 1024,
  }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as EmbedBody;

    const existing = await prisma.guildEmbed.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });

    const { embedFields, ...rest } = body;
    const updated = await prisma.guildEmbed.update({
      where: { id },
      data: {
        ...rest,
        ...(rest.name !== undefined && { name: rest.name.trim() }),
        ...(embedFields !== undefined && {
          embedFields: embedFields as unknown as import('@prisma/client').Prisma.InputJsonValue,
        }),
      },
    });

    return reply.send({ success: true, data: updated });
  });

  server.delete('/guilds/:guildId/embeds/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.guildEmbed.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });
    await prisma.guildEmbed.delete({ where: { id } });
    return reply.send({ success: true });
  });

  server.post('/guilds/:guildId/embeds/:id/send', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const { channelId } = request.body as { channelId: string };

    if (!channelId?.trim()) {
      return reply.code(400).send({ success: false, error: 'channelId required' });
    }

    const embed = await prisma.guildEmbed.findFirst({ where: { id, guildId } });
    if (!embed) return reply.code(404).send({ success: false, error: 'Not found' });

    await pub.publish('api:events', JSON.stringify({
      type: 'embeds:send',
      data: { guildId, channelId, embed },
    }));

    return reply.code(202).send({ success: true });
  });
}
