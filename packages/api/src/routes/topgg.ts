/**
 * Top.gg integration routes:
 *  - POST /topgg/webhook  — public endpoint top.gg calls on each vote. Validates
 *    the shared secret, then forwards the vote to the bot over Redis for reward
 *    processing. Supports the legacy (v0) and current (v1) payload shapes.
 *  - GET/PATCH /guilds/:id/topgg — per-guild reward configuration (admin only).
 *  - GET /guilds/:id/topgg/leaderboard — the bot's top voters.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../database.js';
import { pub } from '../redis.js';
import { requireGuildAdmin } from '../middleware/auth.js';

/** Normalises a vote webhook body (v0 or v1) into a common shape. */
function parseVote(body: unknown): { userId: string; weight: number; isTest: boolean } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  // v1: { type: 'vote.create' | 'webhook.test', data: { user: { id }, weight } }
  if (typeof b.type === 'string' && (b.type === 'vote.create' || b.type === 'webhook.test')) {
    const data = (b.data ?? {}) as { user?: { id?: string }; weight?: number };
    const userId = data.user?.id;
    if (!userId) return null;
    return { userId, weight: data.weight ?? 1, isTest: b.type === 'webhook.test' };
  }

  // v0: { user, type: 'upvote' | 'test', isWeekend }
  if (typeof b.user === 'string') {
    const isTest = b.type === 'test';
    return { userId: b.user, weight: b.isWeekend ? 2 : 1, isTest };
  }
  return null;
}

/** Constant-time string comparison that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Verifies an inbound webhook against the configured secret.
 *
 * Current webhooks (v1) sign the request: header `x-topgg-signature` is
 * `t={unixTimestamp},v1={signature}` where signature = HMAC-SHA256 of
 * `${timestamp}.${rawBody}` keyed by the `whs_…` secret. Legacy webhooks instead
 * send the secret verbatim in the `Authorization` header — supported as a
 * fallback for anyone still on the old setup.
 */
function verifyWebhook(request: FastifyRequest, secret: string): boolean {
  const sigHeader = request.headers['x-topgg-signature'];
  if (typeof sigHeader === 'string') {
    const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;
    const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
    const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
    return safeEqual(signature, digest);
  }
  // Legacy: shared secret in the Authorization header.
  return typeof request.headers.authorization === 'string' && safeEqual(request.headers.authorization, secret);
}

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  voterRoleId: z.string().nullable().optional(),
  voterRoleHours: z.number().int().min(1).max(168).optional(),
  xpReward: z.number().int().min(0).max(100000).optional(),
  weekendDouble: z.boolean().optional(),
  announceChannelId: z.string().nullable().optional(),
  announceMessage: z.string().max(1000).optional(),
}).strict();

export async function topggRoutes(server: FastifyInstance): Promise<void> {
  // Capture the raw request body so the webhook's HMAC signature can be verified
  // against the exact bytes top.gg signed. Encapsulated to this plugin, so it does
  // not change body parsing for the rest of the API.
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as FastifyRequest & { rawBody?: string }).rawBody = body as string;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // ── Inbound vote webhook (called by top.gg) ────────────────────────────────
  server.post('/topgg/webhook', async (request, reply) => {
    const secret = process.env.TOPGG_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ success: false, error: 'Webhook not configured' });

    if (!verifyWebhook(request, secret)) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }

    const vote = parseVote(request.body);
    if (!vote) return reply.code(400).send({ success: false, error: 'Unrecognised payload' });

    // Acknowledge immediately; the bot does the reward work asynchronously.
    if (!vote.isTest) {
      await pub
        .publish('topgg:vote', JSON.stringify({ userId: vote.userId, weight: vote.weight }))
        .catch((err) => request.log.warn({ err }, 'Failed to publish topgg vote'));
    }
    return reply.code(200).send({ success: true });
  });

  // ── Per-guild reward configuration ─────────────────────────────────────────
  server.get('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.topggConfig.findUnique({ where: { guildId } });
    return reply.send({ success: true, data: config ?? { guildId, enabled: false } });
  });

  server.patch('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = ConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid config', details: parsed.error.issues });

    const config = await prisma.topggConfig.upsert({
      where: { guildId },
      create: { guildId, ...parsed.data },
      update: parsed.data,
    });
    // Let the bot drop any cached config.
    await pub.publish('topgg:config', guildId).catch(() => null);
    return reply.send({ success: true, data: config });
  });

  // ── Top voters (bot-wide) ──────────────────────────────────────────────────
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
