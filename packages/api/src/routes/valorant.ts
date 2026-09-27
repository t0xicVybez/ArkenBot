/**
 * VALORANT integration via Riot Sign-On (RSO).
 *
 * DORMANT until a Production key + RSO client are granted: every route guards on
 * `config.valorant.isConfigured` and 503s while the RIOT_* env vars are blank.
 *
 * Link flow (official RSO OAuth):
 *   1. GET  /valorant/rso/login    (authed) → store state→discordId, redirect to Riot authorize
 *   2. GET  /valorant/rso/callback → verify state, exchange code, fetch PUUID + Riot ID, upsert link
 *   3. GET  /valorant/link         (authed) → current user's link status
 *   4. DEL  /valorant/link         (authed) → unlink
 *   5. GET/PATCH /valorant/config/:guildId (guild admin) → per-guild config
 *   6. GET  /valorant/leaderboard/:guildId → linked members ranked (from cached tiers)
 *
 * NOTE: live rank/match DATA fetching (VAL-MATCH / MMR) is intentionally NOT wired
 * here yet — it can't be tested without a real key. See ValorantService (bot side).
 */
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import axios from 'axios';
import { requireAuth, requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { redis } from '../redis.js';
import { config } from '../config.js';

const RSO_AUTHORIZE = 'https://auth.riotgames.com/authorize';
const RSO_TOKEN = 'https://auth.riotgames.com/token';
const RSO_USERINFO = 'https://auth.riotgames.com/userinfo';
const STATE_TTL = 600; // seconds

/** Regional routing host for account-v1 (Riot ID lookup). */
function accountHost(region: string): string {
  if (['eu', 'europe', 'eune', 'euw'].includes(region)) return 'europe';
  if (['ap', 'asia', 'kr'].includes(region)) return 'asia';
  return 'americas';
}

export async function valorantRoutes(server: FastifyInstance): Promise<void> {
  const guard = (reply: import('fastify').FastifyReply): boolean => {
    if (!config.valorant.isConfigured) {
      reply.code(503).send({ success: false, error: 'The Valorant integration is not configured yet.' });
      return false;
    }
    return true;
  };

  // 1. Begin RSO — redirect the browser to Riot's authorize page.
  server.get('/valorant/rso/login', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!guard(reply)) return;
    const discordId = request.user!.id;
    const state = randomBytes(24).toString('hex');
    await redis.set(`valorant:rso:${state}`, discordId, 'EX', STATE_TTL);
    const params = new URLSearchParams({
      client_id: config.valorant.clientId,
      redirect_uri: config.valorant.redirectUri,
      response_type: 'code',
      scope: 'openid offline_access',
      state,
    });
    return reply.redirect(`${RSO_AUTHORIZE}?${params.toString()}`);
  });

  // 2. RSO callback — exchange the code, resolve PUUID + Riot ID, store the link.
  server.get('/valorant/rso/callback', async (request, reply) => {
    if (!config.valorant.isConfigured) return reply.redirect(`${config.web.url}/dashboard?valorant=unavailable`);
    const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
    if (error || !code || !state) return reply.redirect(`${config.web.url}/dashboard?valorant=denied`);

    const discordId = await redis.get(`valorant:rso:${state}`);
    if (!discordId) return reply.redirect(`${config.web.url}/dashboard?valorant=expired`);
    await redis.del(`valorant:rso:${state}`);

    try {
      // Exchange the authorization code for tokens (client basic auth).
      const basic = Buffer.from(`${config.valorant.clientId}:${config.valorant.clientSecret}`).toString('base64');
      const tokenRes = await axios.post(
        RSO_TOKEN,
        new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.valorant.redirectUri }).toString(),
        { headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const { access_token, refresh_token, expires_in } = tokenRes.data as { access_token: string; refresh_token?: string; expires_in?: number };

      // PUUID from the RSO userinfo endpoint.
      const userinfo = await axios.get(RSO_USERINFO, { headers: { Authorization: `Bearer ${access_token}` } });
      const puuid = (userinfo.data as { sub?: string }).sub;
      if (!puuid) return reply.redirect(`${config.web.url}/dashboard?valorant=error`);

      // Riot ID (gameName#tagLine) via account-v1 (needs the production API key).
      let gameName = '', tagLine = '';
      try {
        const acct = await axios.get(
          `https://${accountHost('na')}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`,
          { headers: { 'X-Riot-Token': config.valorant.apiKey } },
        );
        gameName = (acct.data as { gameName?: string }).gameName ?? '';
        tagLine = (acct.data as { tagLine?: string }).tagLine ?? '';
      } catch { /* Riot ID is best-effort; the link still works via PUUID */ }

      await prisma.valorantLink.upsert({
        where: { discordId },
        update: {
          puuid, gameName, tagLine,
          accessToken: access_token, refreshToken: refresh_token ?? null,
          tokenExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        },
        create: {
          discordId, puuid, gameName, tagLine,
          accessToken: access_token, refreshToken: refresh_token ?? null,
          tokenExpiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
        },
      });
      return reply.redirect(`${config.web.url}/dashboard?valorant=linked`);
    } catch (err) {
      request.log.error({ err }, 'valorant rso callback failed');
      return reply.redirect(`${config.web.url}/dashboard?valorant=error`);
    }
  });

  // 3. Current user's link status.
  server.get('/valorant/link', { preHandler: [requireAuth] }, async (request, reply) => {
    const link = await prisma.valorantLink.findUnique({
      where: { discordId: request.user!.id },
      select: { gameName: true, tagLine: true, region: true, currentTier: true, currentRr: true, peakTier: true, linkedAt: true, lastSyncAt: true },
    });
    return reply.send({ success: true, data: { configured: config.valorant.isConfigured, link } });
  });

  // 4. Unlink.
  server.delete('/valorant/link', { preHandler: [requireAuth] }, async (request, reply) => {
    await prisma.valorantLink.deleteMany({ where: { discordId: request.user!.id } });
    return reply.send({ success: true });
  });

  // 5a. Per-guild config.
  server.get('/valorant/config/:guildId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const cfg = await prisma.valorantGuildConfig.findUnique({ where: { guildId } });
    return reply.send({
      success: true,
      data: cfg ?? { enabled: false, syncRolesEnabled: true, rankRoles: {}, matchAlertsEnabled: false, alertChannelId: null, leaderboardEnabled: true, presenceEnabled: false },
    });
  });

  // 5b. Update per-guild config (whitelisted fields).
  server.patch('/valorant/config/:guildId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const b = request.body as {
      enabled?: boolean; syncRolesEnabled?: boolean; rankRoles?: Record<string, string>;
      matchAlertsEnabled?: boolean; alertChannelId?: string | null; leaderboardEnabled?: boolean; presenceEnabled?: boolean;
    };
    const data = {
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
      ...(b.syncRolesEnabled !== undefined ? { syncRolesEnabled: b.syncRolesEnabled } : {}),
      ...(b.rankRoles !== undefined ? { rankRoles: b.rankRoles } : {}),
      ...(b.matchAlertsEnabled !== undefined ? { matchAlertsEnabled: b.matchAlertsEnabled } : {}),
      ...(b.alertChannelId !== undefined ? { alertChannelId: b.alertChannelId } : {}),
      ...(b.leaderboardEnabled !== undefined ? { leaderboardEnabled: b.leaderboardEnabled } : {}),
      ...(b.presenceEnabled !== undefined ? { presenceEnabled: b.presenceEnabled } : {}),
    };
    const cfg = await prisma.valorantGuildConfig.upsert({ where: { guildId }, update: data, create: { guildId, ...data } });
    return reply.send({ success: true, data: cfg });
  });

  // 6. Server leaderboard — ranks linked members by their cached competitive tier.
  //    (Tiers are populated by the sync job once the integration is live.)
  server.get('/valorant/leaderboard/:guildId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const rows = await prisma.valorantLink.findMany({
      where: { currentTier: { not: null } },
      orderBy: [{ currentTier: 'desc' }, { currentRr: 'desc' }],
      take: 100,
      select: { discordId: true, gameName: true, tagLine: true, currentTier: true, currentRr: true, peakTier: true },
    });
    return reply.send({ success: true, data: rows });
  });
}
