import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { resolveRoleMentions } from '../utils/roleMentions.js';
import { resolveChannelId, ensureSubscription, removeSubscriptionIfUnused } from '../services/youtubeWebsub.js';

/** Guardrail: max YouTube alerts per guild (abuse/hygiene, not a quota limit). */
const YOUTUBE_ALERTS_PER_GUILD = parseInt(process.env.YOUTUBE_ALERTS_PER_GUILD ?? '25', 10);

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
    const { platform, channelUsername, discordChannelId, message, notifyLive, notifyUploads } = request.body as Record<string, unknown>;

    if (!platform || !discordChannelId) {
      return reply.code(400).send({ success: false, error: 'platform and discordChannelId are required' });
    }
    if (!['twitch', 'kick', 'rss', 'youtube'].includes(platform as string)) {
      return reply.code(400).send({ success: false, error: 'platform must be twitch, kick, rss, or youtube' });
    }

    // Per-guild YouTube cap — an abuse/hygiene guardrail, not a quota limit.
    if (platform === 'youtube') {
      const count = await prisma.streamAlert.count({ where: { guildId, platform: 'youtube' } });
      if (count >= YOUTUBE_ALERTS_PER_GUILD) {
        return reply.code(429).send({ success: false, error: `This server has reached the limit of ${YOUTUBE_ALERTS_PER_GUILD} YouTube alerts.` });
      }
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

    // For YouTube, resolve the handle → channel ID up-front (validates it and lets
    // us subscribe to the WebSub feed immediately, so alerts start with no polling).
    let channelId: string | null = null;
    if (platform === 'youtube') {
      channelId = await resolveChannelId(normalizedUsername);
      if (!channelId) {
        return reply.code(400).send({ success: false, error: 'Could not find that YouTube channel. Check the handle or paste the channel URL.' });
      }
    }

    const alert = await prisma.streamAlert.create({
      data: {
        guildId,
        platform: platform as string,
        channelUsername: normalizedUsername,
        channelId,
        discordChannelId: discordChannelId as string,
        message: resolvedMessage ?? undefined,
        ...(platform === 'youtube'
          ? {
              notifyLive: notifyLive === undefined ? true : Boolean(notifyLive),
              notifyUploads: notifyUploads === undefined ? true : Boolean(notifyUploads),
            }
          : {}),
      },
    });

    // Subscribe to the channel's push feed (idempotent across guilds sharing it).
    if (platform === 'youtube' && channelId) {
      void ensureSubscription(channelId);
    }

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
    if (existing.platform === 'youtube') {
      if (body.notifyLive !== undefined) data.notifyLive = Boolean(body.notifyLive);
      if (body.notifyUploads !== undefined) data.notifyUploads = Boolean(body.notifyUploads);
    }

    // Re-enabling or repointing an alert is the user telling us the problem is
    // fixed. Clear the failure counter, or an auto-disabled alert would trip
    // again on its very next failure instead of getting a fresh five attempts.
    if (body.enabled === true || body.discordChannelId) {
      data.failureCount = 0;
      data.lastError = null;
    }

    let newChannelId: string | null | undefined; // undefined = channel unchanged
    if (body.channelUsername) {
      let newUsername = (body.channelUsername as string).trim();
      if (existing.platform === 'youtube') {
        newUsername = newUsername
          .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
          .replace(/^@/, '')
          .trim();
        newUsername = `@${newUsername}`;
        // Re-resolve the channel ID and reset dedup state for the new channel.
        newChannelId = await resolveChannelId(newUsername);
        if (!newChannelId) {
          return reply.code(400).send({ success: false, error: 'Could not find that YouTube channel. Check the handle or paste the channel URL.' });
        }
        data.channelId = newChannelId;
        data.lastStreamId = null;
        data.lastUploadId = null;
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

    // Reconcile YouTube WebSub subscriptions after the change.
    if (existing.platform === 'youtube') {
      const oldChannelId = existing.channelId;
      const effectiveChannelId = newChannelId ?? oldChannelId;
      const enabledNow = body.enabled === undefined ? existing.enabled : Boolean(body.enabled);

      if (newChannelId && newChannelId !== oldChannelId) {
        if (enabledNow) void ensureSubscription(newChannelId);
        if (oldChannelId) void removeSubscriptionIfUnused(oldChannelId);
      } else if (body.enabled !== undefined && effectiveChannelId) {
        if (enabledNow) void ensureSubscription(effectiveChannelId);
        else void removeSubscriptionIfUnused(effectiveChannelId);
      }
    }

    return reply.send({ success: true });
  });

  // DELETE /guilds/:guildId/stream-alerts/:id
  server.delete('/guilds/:guildId/stream-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.streamAlert.findFirst({ where: { id, guildId } });
    await prisma.streamAlert.deleteMany({ where: { id, guildId } });
    // Drop the WebSub subscription if no other enabled alert still watches it.
    if (existing?.platform === 'youtube' && existing.channelId) {
      void removeSubscriptionIfUnused(existing.channelId);
    }
    return reply.code(204).send();
  });
}
