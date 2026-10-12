
import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../database.js';
import { pub } from '../redis.js';
import { requireGuildAdmin } from '../middleware/auth.js';
import { encryptSecret, decryptSecretLenient } from '../utils/crypto.js';

function parseVote(body: unknown): { userId: string; weight: number; isTest: boolean; guildId?: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  if (typeof b.type === 'string' && (b.type === 'vote.create' || b.type === 'webhook.test')) {
    const data = (b.data ?? {}) as {
      user?: { id?: string; platform_id?: string };
      project?: { type?: string; platform_id?: string };
      weight?: number;
    };
    const userId = data.user?.platform_id ?? data.user?.id;
    if (!userId) return null;
    const guildId = data.project?.type === 'server' ? data.project.platform_id : undefined;
    return { userId, weight: data.weight ?? 1, isTest: b.type === 'webhook.test', guildId };
  }

  if (typeof b.user === 'string') {
    return {
      userId: b.user,
      weight: b.isWeekend ? 2 : 1,
      isTest: b.type === 'test',
      guildId: typeof b.guild === 'string' ? b.guild : undefined,
    };
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function verifyWebhook(request: FastifyRequest, secrets: string[]): boolean {
  const sigHeader = request.headers['x-topgg-signature'];
  if (typeof sigHeader === 'string') {
    const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
    return secrets.some((secret) => {
      const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
      return safeEqual(signature, digest);
    });
  }

  const auth = request.headers.authorization;
  return typeof auth === 'string' && secrets.some((secret) => safeEqual(auth, secret));
}

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  voterRoleId: z.string().nullable().optional(),
  voterRoleHours: z.number().int().min(1).max(168).optional(),
  xpReward: z.number().int().min(0).max(100000).optional(),
  weekendDouble: z.boolean().optional(),
  voteUrl: z.string().url().max(300).nullable().optional(),
  webhookSecret: z.string().max(200).nullable().optional(),
  announceChannelId: z.string().nullable().optional(),
  announceMessage: z.string().max(1000).optional(),
}).strict();

export async function topggRoutes(server: FastifyInstance): Promise<void> {

  server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  server.post('/topgg/webhook', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const vote = parseVote(request.body);
    if (!vote) return reply.code(400).send({ success: false, error: 'Unrecognised payload' });

    const secrets = [process.env.TOPGG_WEBHOOK_SECRET, process.env.TOPGG_SERVER_WEBHOOK_SECRET].filter(
      (s): s is string => !!s,
    );
    if (vote.guildId) {
      const cfg = await prisma.topggConfig.findUnique({
        where: { guildId: vote.guildId },
        select: { webhookSecret: true },
      });
      if (cfg?.webhookSecret) secrets.push(decryptSecretLenient(cfg.webhookSecret));
    }
    if (secrets.length === 0) return reply.code(503).send({ success: false, error: 'Webhook not configured' });

    if (!verifyWebhook(request, secrets)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    if (!vote.isTest) {
      await pub
        .publish('topgg:vote', JSON.stringify({ userId: vote.userId, weight: vote.weight, guildId: vote.guildId }))
        .catch((err) => request.log.warn({ err }, 'Failed to publish topgg vote'));
    }
    return reply.code(200).send({ success: true });
  });

  server.get('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.topggConfig.findUnique({ where: { guildId } });
    if (!config) return reply.send({ success: true, data: { guildId, enabled: false, hasWebhookSecret: false } });

    const { webhookSecret, ...safe } = config;
    return reply.send({ success: true, data: { ...safe, hasWebhookSecret: !!webhookSecret } });
  });

  server.patch('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = ConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid config', details: parsed.error.issues });

    const data = { ...parsed.data };

    if (data.webhookSecret === '') delete data.webhookSecret;
    else if (typeof data.webhookSecret === 'string') data.webhookSecret = encryptSecret(data.webhookSecret);

    const config = await prisma.topggConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });

    await pub.publish('topgg:config', guildId).catch(() => null);

    const { webhookSecret, ...safe } = config;
    return reply.send({ success: true, data: { ...safe, hasWebhookSecret: !!webhookSecret } });
  });

  server.get('/guilds/:guildId/topgg/leaderboard', { preHandler: [requireGuildAdmin] }, async (_request, reply) => {
    const voters = await prisma.topggVoter.findMany({
      orderBy: { totalVotes: 'desc' },
      take: 25,
      select: { userId: true, totalVotes: true, currentStreak: true, longestStreak: true, lastVotedAt: true },
    });
    const totals = await prisma.topggVoter.aggregate({ _sum: { totalVotes: true }, _count: true });
    return reply.send({
      success: true,
      data: { voters, totalVotes: totals._sum.totalVotes ?? 0, uniqueVoters: totals._count },
    });
  });
}
