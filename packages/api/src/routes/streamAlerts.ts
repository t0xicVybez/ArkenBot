import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { resolveRoleMentions } from '../utils/roleMentions.js';
import { resolveChannelId, ensureSubscription, removeSubscriptionIfUnused } from '../services/youtubeWebsub.js';

const YOUTUBE_ALERTS_PER_GUILD = parseInt(process.env.YOUTUBE_ALERTS_PER_GUILD ?? '25', 10);

export async function streamAlertRoutes(server: FastifyInstance): Promise<void> {

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

  server.post('/guilds/:guildId/stream-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { platform, channelUsername, discordChannelId, message, notifyLive, notifyUploads } = request.body as Record<string, unknown>;

    if (!platform || !discordChannelId) {
      return reply.code(400).send({ success: false, error: 'platform and discordChannelId are required' });
    }
    if (!['twitch', 'kick', 'rss', 'youtube', 'reddit'].includes(platform as string)) {
      return reply.code(400).send({ success: false, error: 'platform must be twitch, kick, rss, youtube, or reddit' });
    }

    if (platform === 'youtube') {
      const count = await prisma.streamAlert.count({ where: { guildId, platform: 'youtube' } });
      if (count >= YOUTUBE_ALERTS_PER_GUILD) {
        return reply.code(429).send({ success: false, error: `This server has reached the limit of ${YOUTUBE_ALERTS_PER_GUILD} YouTube alerts.` });
      }
    }

    if (!channelUsername || typeof channelUsername !== 'string' || channelUsername.length > 300) {
      return reply.code(400).send({ success: false, error: 'platform, channelUsername and discordChannelId are required' });
    }

    let normalizedUsername = (channelUsername as string).trim();
    if (platform === 'youtube') {
      normalizedUsername = normalizedUsername
        .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
        .replace(/^@/, '')
        .trim();
      normalizedUsername = `@${normalizedUsername}`;
    } else if (platform === 'reddit') {

      normalizedUsername = normalizedUsername
        .replace(/^https?:\/\/(www\.|old\.|np\.)?reddit\.com\//i, '')
        .replace(/^\/?r\//i, '')
        .split('/')[0]
        .trim();
      if (!/^[A-Za-z0-9_]{3,21}$/.test(normalizedUsername)) {
        return reply.code(400).send({ success: false, error: 'Enter a valid subreddit (e.g. "gaming" or "r/gaming").' });
      }
    } else {
      normalizedUsername = normalizedUsername.toLowerCase();
    }

    const resolvedMessage = await resolveRoleMentions(guildId, typeof message === 'string' ? message : undefined);

    let channelId: string | null = null;
    if (platform === 'youtube') {
      channelId = await resolveChannelId(normalizedUsername);
      if (!channelId) {
        return reply.code(400).send({ success: false, error: 'Could not find that YouTube channel. Check the handle or paste the channel URL.' });
      }
    }

    let alert;
    try {
      alert = await prisma.streamAlert.create({
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
    } catch (err) {

      if ((err as { code?: string }).code === 'P2002') {
        return reply.code(409).send({ success: false, error: 'This server already has an alert for that channel.' });
      }
      throw err;
    }

    if (platform === 'youtube' && channelId) {
      void ensureSubscription(channelId);
    }

    return reply.code(201).send({ success: true, data: alert });
  });

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

    if (body.enabled === true || body.discordChannelId) {
      data.failureCount = 0;
      data.lastError = null;
    }

    let newChannelId: string | null | undefined;
    if (body.channelUsername) {
      if (typeof body.channelUsername !== 'string' || body.channelUsername.length > 300) {
        return reply.code(400).send({ success: false, error: 'channelUsername is invalid' });
      }
      let newUsername = body.channelUsername.trim();
      if (existing.platform === 'youtube') {
        newUsername = newUsername
          .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
          .replace(/^@/, '')
          .trim();
        newUsername = `@${newUsername}`;

        newChannelId = await resolveChannelId(newUsername);
        if (!newChannelId) {
          return reply.code(400).send({ success: false, error: 'Could not find that YouTube channel. Check the handle or paste the channel URL.' });
        }
        data.channelId = newChannelId;
        data.lastStreamId = null;
        data.lastUploadId = null;
      } else if (existing.platform === 'reddit') {
        newUsername = newUsername
          .replace(/^https?:\/\/(www\.|old\.|np\.)?reddit\.com\//i, '')
          .replace(/^\/?r\//i, '')
          .split('/')[0]
          .trim();
        if (!/^[A-Za-z0-9_]{3,21}$/.test(newUsername)) {
          return reply.code(400).send({ success: false, error: 'Enter a valid subreddit (e.g. "gaming" or "r/gaming").' });
        }
        data.lastStreamId = null;
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

  server.delete('/guilds/:guildId/stream-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const existing = await prisma.streamAlert.findFirst({ where: { id, guildId } });
    await prisma.streamAlert.deleteMany({ where: { id, guildId } });

    if (existing?.platform === 'youtube' && existing.channelId) {
      void removeSubscriptionIfUnused(existing.channelId);
    }
    return reply.code(204).send();
  });
}
