
import crypto from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../database.js';
import { pub, redis } from '../redis.js';
import { config } from '../config.js';
import { spendQuota } from '../services/youtubeWebsub.js';

const CHANNEL_FROM_TOPIC = /channel_id=(UC[\w-]{22})/;

type VideoInfo = {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
  live: boolean;
  upcoming: boolean;
  isStream: boolean;
};

async function fetchVideos(ids: string[]): Promise<Map<string, VideoInfo>> {
  const out = new Map<string, VideoInfo>();
  if (!ids.length || !config.youtubeApiKey) return out;
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids.join(',')}&key=${config.youtubeApiKey}`,
  ).catch(() => null);
  await spendQuota(1);
  if (!res?.ok) return out;
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        title: string;
        channelTitle: string;
        liveBroadcastContent?: string;
        thumbnails?: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string } };
      };
      liveStreamingDetails?: unknown;
    }>;
  };
  for (const v of data.items ?? []) {
    const s = v.snippet;
    if (!s) continue;
    out.set(v.id, {
      id: v.id,
      title: s.title,
      channelTitle: s.channelTitle,
      thumbnail: s.thumbnails?.maxres?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.medium?.url ?? null,
      live: s.liveBroadcastContent === 'live',
      upcoming: s.liveBroadcastContent === 'upcoming',
      isStream: v.liveStreamingDetails != null,
    });
  }
  return out;
}

export async function youtubeWebsubRoutes(server: FastifyInstance): Promise<void> {

  server.addContentTypeParser(
    ['application/atom+xml', 'application/xml', 'text/xml'],
    { parseAs: 'string' },
    (req, body, done) => {
      (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      done(null, body);
    },
  );

  server.get('/youtube/websub', { config: { rateLimit: false } }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const mode = q['hub.mode'];
    const topic = q['hub.topic'] ?? '';
    const challenge = q['hub.challenge'];
    const leaseSeconds = parseInt(q['hub.lease_seconds'] ?? '0', 10);
    const channelId = CHANNEL_FROM_TOPIC.exec(topic)?.[1];

    if (!mode || !challenge || !channelId) {
      return reply.code(400).send('bad request');
    }

    const sub = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
    if (!sub) {

      return reply.code(404).send('not found');
    }

    if (mode === 'subscribe') {
      await prisma.youtubeSubscription.update({
        where: { channelId },
        data: {
          status: 'active',
          verifiedAt: new Date(),
          leaseExpiresAt: leaseSeconds > 0 ? new Date(Date.now() + leaseSeconds * 1000) : null,
        },
      }).catch(() => null);
    }

    return reply.code(200).type('text/plain').send(challenge);
  });

  server.post('/youtube/websub', { config: { rateLimit: false } }, async (request, reply) => {
    const raw = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';

    reply.code(204).send();

    try {
      const channelId = /<yt:channelId>(UC[\w-]{22})<\/yt:channelId>/.exec(raw)?.[1];
      if (!channelId) return;

      const sub = await prisma.youtubeSubscription.findUnique({ where: { channelId } });
      if (!sub) return;

      const sig = (request.headers['x-hub-signature'] as string | undefined) ?? '';
      const [algo, provided] = sig.split('=');
      if (algo !== 'sha1' || !provided) return;
      const expected = crypto.createHmac('sha1', sub.secret).update(raw).digest('hex');
      const a = Buffer.from(provided, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return;

      await prisma.youtubeSubscription.update({
        where: { channelId },
        data: { lastNotifiedAt: new Date() },
      }).catch(() => null);

      if (/<at:deleted-entry/.test(raw)) return;

      const videoId = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(raw)?.[1];
      const published = /<published>([^<]+)<\/published>/.exec(raw)?.[1];
      if (!videoId) return;

      const info = (await fetchVideos([videoId])).get(videoId);
      if (!info) return;

      if (info.live) {
        await redis.hdel('youtube:upcoming', videoId).catch(() => null);
        await pub.publish('youtube:live', JSON.stringify({ channelId, video: info })).catch(() => null);
        return;
      }

      if (info.upcoming) {

        await redis.hset('youtube:upcoming', videoId, channelId).catch(() => null);
        return;
      }

      if (info.isStream) {

        await redis.hdel('youtube:upcoming', videoId).catch(() => null);
        return;
      }

      const publishedAt = published ? Date.parse(published) : Date.now();
      if (Date.now() - publishedAt > 2 * 3600 * 1000) return;
      await pub.publish('youtube:upload', JSON.stringify({ channelId, video: info })).catch(() => null);
    } catch {

    }
  });
}
