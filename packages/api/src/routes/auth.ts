/**
 * Discord OAuth2 authentication routes. Handles the OAuth2 flow, JWT issuance,
 * token refresh, logout, and the authenticated user profile endpoint.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/AuthService.js';
import { redis } from '../redis.js';
import { requireAuth } from '../middleware/auth.js';
import { randomBytes } from 'crypto';
import { config } from '../config.js';

/**
 * Registers authentication routes.
 *
 * GET  /auth/url      — generate a Discord OAuth2 URL with a CSRF state token
 * POST /auth/callback — exchange an authorisation code for JWT tokens
 * POST /auth/refresh  — rotate a refresh token for a new access/refresh pair
 * POST /auth/logout   — invalidate a refresh token session
 * GET  /auth/me       — return the authenticated user's profile
 */
export async function authRoutes(server: FastifyInstance): Promise<void> {
  // Store the state token in Redis with a 5-minute TTL so it can be validated
  // in the callback without server-side session state.
  server.get('/auth/url', async (request, reply) => {
    const state = randomBytes(16).toString('hex');
    await redis.setex(`oauth:state:${state}`, 300, '1');
    const url = AuthService.getOAuthUrl(state);
    return reply.send({ success: true, data: { url, state } });
  });

  // Tight rate limit on this endpoint because each call makes two Discord API
  // requests (token exchange + user fetch) and creates a database session.
  server.post('/auth/callback', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = z.object({ code: z.string(), state: z.string() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid request body' });
    }
    const { code, state } = parsed.data;

    // Deleting the key atomically validates and consumes the state token in one operation,
    // preventing replay attacks.
    const valid = await redis.del(`oauth:state:${state}`);
    if (!valid) {
      return reply.code(400).send({ success: false, error: 'Invalid state parameter' });
    }

    try {
      const tokens = await AuthService.exchangeCode(code);
      const discordUser = await AuthService.getDiscordUser(tokens.access_token);
      const user = await AuthService.upsertUser(discordUser, tokens);
      const jwtTokens = await AuthService.generateTokens(server, user.id);

      return reply.send({
        success: true,
        data: {
          user,
          accessToken: jwtTokens.accessToken,
          refreshToken: jwtTokens.refreshToken,
          expiresIn: parseAccessExpiry(config.jwt.accessExpiry),
        },
      });
    } catch (err) {
      server.log.error(err);
      return reply.code(500).send({ success: false, error: 'OAuth2 exchange failed' });
    }
  });

  server.post('/auth/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };
    if (!refreshToken) {
      return reply.code(400).send({ success: false, error: 'Refresh token required' });
    }

    const tokens = await AuthService.refreshTokens(server, refreshToken);
    if (!tokens) {
      return reply.code(401).send({ success: false, error: 'Invalid or expired refresh token' });
    }

    return reply.send({ success: true, data: { ...tokens, expiresIn: 900 } });
  });

  server.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (refreshToken) await AuthService.logout(refreshToken);
    return reply.send({ success: true, message: 'Logged out' });
  });

  server.get('/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const { prisma } = await import('../database.js');
    const user = await prisma.portalUser.findUnique({ where: { id: request.user!.id } });
    if (!user) return reply.code(404).send({ success: false, error: 'User not found' });

    return reply.send({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
        isStaff: user.isStaff,
        isBotOwner: user.isBotOwner,
      },
    });
  });
}

/**
 * Converts a JWT expiry string (e.g. "1h", "15m") to a seconds integer
 * for inclusion in the `expiresIn` response field consumed by clients.
 */
function parseAccessExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;
  const v = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return v;
    case 'm': return v * 60;
    case 'h': return v * 3600;
    case 'd': return v * 86400;
    default:  return 3600;
  }
}
