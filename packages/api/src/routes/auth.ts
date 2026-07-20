/**
 * Discord OAuth2 authentication routes — a fully server-mediated flow.
 *
 * The browser never sees the authorisation code or a token. `/auth/login`
 * redirects to Discord; Discord redirects back to `/auth/callback` (this API);
 * the callback exchanges the code, creates an opaque server-side session, sets
 * an httpOnly cookie, and redirects to the dashboard. Everything else reads the
 * session from that cookie via `requireAuth`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { AuthService } from '../services/AuthService.js';
import { SessionService } from '../services/SessionService.js';
import { redis } from '../redis.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie.js';

/** Redis key holding the state → { verifier, redirect } binding during the OAuth round-trip. */
const stateKey = (state: string) => `oauth:state:${state}`;

/**
 * Validates a post-login redirect target: same-origin relative paths only, so
 * the `redirect` query parameter cannot be abused as an open redirect.
 */
function safeRedirect(target: unknown): string {
  if (typeof target !== 'string') return '/dashboard';
  if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
  if (target.includes('://')) return '/dashboard';
  return target;
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  // ── Begin OAuth: stash state + PKCE verifier server-side, redirect to Discord ──
  server.get('/auth/login', async (request, reply) => {
    const state = randomBytes(16).toString('hex');
    const { verifier, challenge } = AuthService.generatePkce();
    const redirect = safeRedirect((request.query as { redirect?: string })?.redirect);

    await redis.setex(stateKey(state), 300, JSON.stringify({ verifier, redirect }));
    return reply.redirect(AuthService.getOAuthUrl(state, challenge));
  });

  // ── OAuth callback: exchange code, create session, set cookie, back to dashboard ──
  // Rate-limited because each call makes two Discord API requests and a DB write.
  server.get(
    '/auth/callback',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = z
        .object({ code: z.string(), state: z.string() })
        .safeParse(request.query);
      if (!parsed.success) {
        return reply.redirect(`${config.web.url}/auth?error=invalid_request`);
      }
      const { code, state } = parsed.data;

      // Consume the state atomically-ish: read then delete so it cannot be replayed.
      const raw = await redis.get(stateKey(state));
      await redis.del(stateKey(state));
      if (!raw) {
        return reply.redirect(`${config.web.url}/auth?error=invalid_state`);
      }
      const { verifier, redirect } = JSON.parse(raw) as { verifier: string; redirect: string };

      try {
        const tokens = await AuthService.exchangeCode(code, verifier);
        const discordUser = await AuthService.getDiscordUser(tokens.access_token);
        const user = await AuthService.upsertUser(discordUser, tokens);

        const sid = await SessionService.create(user.id, {
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
        });
        setSessionCookie(reply, sid);

        return reply.redirect(`${config.web.url}${safeRedirect(redirect)}`);
      } catch (err) {
        server.log.error(err);
        return reply.redirect(`${config.web.url}/auth?error=oauth_failed`);
      }
    }
  );

  // ── Current user profile (cookie-authenticated) ──
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

  // ── Logout: revoke this session and clear the cookie ──
  server.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const sid = request.cookies[config.cookie.name];
    if (sid) await SessionService.revoke(sid);
    clearSessionCookie(reply);
    return reply.send({ success: true, message: 'Logged out' });
  });

  // ── Logout everywhere: revoke every session for the user ──
  server.post('/auth/logout-all', { preHandler: [requireAuth] }, async (request, reply) => {
    await SessionService.revokeAllForUser(request.user!.id);
    clearSessionCookie(reply);
    return reply.send({ success: true, message: 'Logged out of all sessions' });
  });

  // ── Active sessions for the current user (device management) ──
  server.get('/auth/sessions', { preHandler: [requireAuth] }, async (request, reply) => {
    const currentId = request.sessionId;
    const sessions = await SessionService.list(request.user!.id);
    return reply.send({
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
        current: s.id === currentId,
      })),
    });
  });

  // ── Revoke one session by id (cannot be used to revoke someone else's) ──
  server.delete('/auth/sessions/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const revoked = await SessionService.revokeById(request.user!.id, id);
    if (!revoked) return reply.code(404).send({ success: false, error: 'Session not found' });
    return reply.send({ success: true, message: 'Session revoked' });
  });
}
