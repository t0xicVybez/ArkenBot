import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { resolveRoleMentions } from '../utils/roleMentions.js';

export async function streamAlertRoutes(server: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════════════
  // STREAM ALERTS
  // ══════════════════════════════════════════════════════════════════

  // GET /guilds/:guildId/stream-alerts?platform=twitch,kick
  server.get('/guilds/:guildId/stream-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { platform } = request.query as { platform?: string };
    const platformFilter = platform ? platform.split(',').map((p) => p.trim()).filter(Boolean) : undefined;
    const alerts = await prisma.streamAlert.findMany({
      where: { guildId, ...(platformFilter?.length ? { platform: { in: platformFilter } } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: alerts });
  });

  // POST /guilds/:guildId/stream-alerts
  server.post('/guilds/:guildId/stream-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { platform, channelUsername, discordChannelId, message } = request.body as Record<string, unknown>;

    if (!platform || !discordChannelId) {
      return reply.code(400).send({ success: false, error: 'platform and discordChannelId are required' });
    }
    if (!['twitch', 'kick', 'rss', 'youtube'].includes(platform as string)) {
      return reply.code(400).send({ success: false, error: 'platform must be twitch, kick, rss, or youtube' });
    }

    if (!channelUsername) {
      return reply.code(400).send({ success: false, error: 'platform, channelUsername and discordChannelId are required' });
    }

    // Normalise YouTube handles — strip URL prefix, ensure leading @
    let normalizedUsername = (channelUsername as string).trim();
    if (platform === 'youtube') {
      normalizedUsername = normalizedUsername
        .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
        .replace(/^@/, '')
        .trim();
      normalizedUsername = `@${normalizedUsername}`;
    } else {
      normalizedUsername = normalizedUsername.toLowerCase();
    }

    const resolvedMessage = await resolveRoleMentions(guildId, typeof message === 'string' ? message : undefined);
    const alert = await prisma.streamAlert.create({
      data: {
        guildId,
        platform: platform as string,
        channelUsername: normalizedUsername,
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

    // Re-enabling or repointing an alert is the user telling us the problem is
    // fixed. Clear the failure counter, or an auto-disabled alert would trip
    // again on its very next failure instead of getting a fresh five attempts.
    if (body.enabled === true || body.discordChannelId) {
      data.failureCount = 0;
      data.lastError = null;
    }

    if (body.channelUsername) {
      let newUsername = (body.channelUsername as string).trim();
      if (existing.platform === 'youtube') {
        newUsername = newUsername
          .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
          .replace(/^@/, '')
          .trim();
        newUsername = `@${newUsername}`;
        // Clear resolved channelId so the bot re-resolves on next poll
        data.channelId = null;
      } else {
        newUsername = newUsername.toLowerCase();
      }
      data.channelUsername = newUsername;
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
