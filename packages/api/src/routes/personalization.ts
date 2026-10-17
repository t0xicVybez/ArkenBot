import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

const PatchSchema = z.object({
  nickname:     z.string().max(32).nullable().optional(),
  botAvatarUrl: z.string().nullable().optional(),
}).strict();

/**
 * Per-guild dashboard personalization (branding/theme).
 *
 * Routes:
 *   GET    /guilds/:guildId/personalization
 *   PATCH  /guilds/:guildId/personalization
 */
export async function personalizationRoutes(server: FastifyInstance): Promise<void> {

  server.get('/guilds/:guildId/personalization', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    return reply.send({
      success: true,
      data: {
        nickname:     (extended.botNickname as string | null) ?? null,
        botAvatarUrl: (extended.botAvatarUrl as string | null) ?? null,
      },
    });
  });

  // The avatar is sent as a base64 data URI, which is ~33% larger than the raw
  // file. The dashboard caps the raw image at 3MB, so the encoded body can reach
  // ~4MB — allow 6MB here for headroom. (nginx needs a matching
  // client_max_body_size, or it rejects the upload with a 413 first.)
  server.patch('/guilds/:guildId/personalization', { preHandler: [requireGuildAdmin], bodyLimit: 6 * 1024 * 1024 }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { nickname, botAvatarUrl } = PatchSchema.parse(request.body);

    const current  = await prisma.guildSettings.findUnique({ where: { guildId } });
    const prev     = (current?.extended ?? {}) as Record<string, unknown>;
    const extended = {
      ...prev,
      ...(nickname !== undefined     && { botNickname:  nickname ?? null }),
      ...(botAvatarUrl !== undefined && { botAvatarUrl: botAvatarUrl ?? null }),
    };

    await prisma.guildSettings.upsert({
      where:  { guildId },
      update: { extended: extended as never },
      create: { guildId, extended: extended as never },
    });

    if (nickname !== undefined) {
      await pub.publish('api:events', JSON.stringify({
        type: 'bot:nickname:update',
        data: { guildId, nickname: nickname ?? null },
      }));
    }

    if (botAvatarUrl !== undefined) {
      await pub.publish('api:events', JSON.stringify({
        type: 'bot:avatar:update',
        data: { guildId, botAvatarUrl: botAvatarUrl ?? null },
      }));
    }

    return reply.send({ success: true });
  });
}
