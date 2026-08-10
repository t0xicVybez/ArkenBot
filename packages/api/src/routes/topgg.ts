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
import { encryptSecret, decryptSecretLenient } from '../utils/crypto.js';

/**
 * Normalises a vote webhook body (v0 or v1) into a common shape.
 * `guildId` is set only for *server* votes — the vote was cast for a specific
 * Discord server rather than the bot, so rewards are scoped to that server.
 */
function parseVote(body: unknown): { userId: string; weight: number; isTest: boolean; guildId?: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  // v1: { type, data: { user: { id, platform_id }, project: { type, platform_id }, weight } }.
  // For the user, `platform_id` is the Discord ID (`id` is top.gg's internal one).
  // For the project, type "server" means this is a server vote and platform_id is the guild ID.
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

  // v0: bot vote { user, type, isWeekend } or server vote { user, guild, type, isWeekend }.
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

/** Constant-time string comparison that tolerates unequal lengths. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Verifies an inbound webhook against any of the configured secrets.
 *
 * Bot and server listings each have their own webhook secret, so this accepts a
 * request that validates against either. Current webhooks (v1) sign the request:
 * header `x-topgg-signature` is `t={unixTimestamp},v1={signature}` where signature
 * = HMAC-SHA256 of `${timestamp}.${rawBody}` keyed by the `whs_…` secret. Legacy
 * webhooks instead send the secret verbatim in the `Authorization` header.
 */
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
  // Legacy: shared secret in the Authorization header.
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
  // Explicitly rate limited on top of the global limit: this route is
  // unauthenticated and has to hit the database before the signature can be
  // checked (verifying needs the voted guild's own secret), so we bound how fast
  // an unsigned caller can drive that lookup. The ceiling sits well above real
  // vote traffic, which arrives from top.gg's own hosts.
  server.post('/topgg/webhook', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const vote = parseVote(request.body);
    if (!vote) return reply.code(400).send({ success: false, error: 'Unrecognised payload' });

    // Candidate secrets: the owner's env secrets (bot listing + one server), plus
    // the voted server's own secret from its dashboard config. The body is parsed
    // untrusted only to route to the right secret — forging still requires it.
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

    // Acknowledge immediately; the bot does the reward work asynchronously.
    if (!vote.isTest) {
      await pub
        .publish('topgg:vote', JSON.stringify({ userId: vote.userId, weight: vote.weight, guildId: vote.guildId }))
        .catch((err) => request.log.warn({ err }, 'Failed to publish topgg vote'));
    }
    return reply.code(200).send({ success: true });
  });

  // ── Per-guild reward configuration ─────────────────────────────────────────
  server.get('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = await prisma.topggConfig.findUnique({ where: { guildId } });
    if (!config) return reply.send({ success: true, data: { guildId, enabled: false, hasWebhookSecret: false } });
    // Never return the raw signing secret — only whether one is set.
    const { webhookSecret, ...safe } = config;
    return reply.send({ success: true, data: { ...safe, hasWebhookSecret: !!webhookSecret } });
  });

  server.patch('/guilds/:guildId/topgg', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const parsed = ConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid config', details: parsed.error.issues });

    const data = { ...parsed.data };
    // An empty secret field means "leave it unchanged", not "clear it".
    if (data.webhookSecret === '') delete data.webhookSecret;
    else if (typeof data.webhookSecret === 'string') data.webhookSecret = encryptSecret(data.webhookSecret);

    const config = await prisma.topggConfig.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    // Let the bot drop any cached config.
    await pub.publish('topgg:config', guildId).catch(() => null);
    // Never echo the secret back.
    const { webhookSecret, ...safe } = config;
    return reply.send({ success: true, data: { ...safe, hasWebhookSecret: !!webhookSecret } });
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
