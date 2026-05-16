import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

const PatchSchema = z.object({
  nickname:     z.string().max(32).nullable().optional(),
  botAvatarUrl: z.string().nullable().optional(),
}).strict();

export async function personalizationRoutes(server: FastifyInstance): Promise<void> {
  // GET /guilds/:guildId/personalization
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

  // PATCH /guilds/:guildId/personalization
  server.patch('/guilds/:guildId/personalization', { preHandler: [requireGuildAdmin], bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
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
