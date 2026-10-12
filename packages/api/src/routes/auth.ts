
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { AuthService } from '../services/AuthService.js';
import { SessionService } from '../services/SessionService.js';
import { redis } from '../redis.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { setSessionCookie, clearSessionCookie } from '../utils/sessionCookie.js';

const stateKey = (state: string) => `oauth:state:${state}`;

function safeRedirect(target: unknown): string {
  if (typeof target !== 'string') return '/dashboard';
  if (!target.startsWith('/') || target.startsWith('//')) return '/dashboard';
  if (target.includes('://')) return '/dashboard';
  return target;
}

export async function authRoutes(server: FastifyInstance): Promise<void> {

  server.get('/auth/login', async (request, reply) => {
    const state = randomBytes(16).toString('hex');
    const { verifier, challenge } = AuthService.generatePkce();
    const redirect = safeRedirect((request.query as { redirect?: string })?.redirect);

    await redis.setex(stateKey(state), 300, JSON.stringify({ verifier, redirect }));
    return reply.redirect(AuthService.getOAuthUrl(state, challenge));
  });

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

  server.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const sid = request.cookies[config.cookie.name];
    if (sid) await SessionService.revoke(sid);
    clearSessionCookie(reply);
    return reply.send({ success: true, message: 'Logged out' });
  });

  server.post('/auth/logout-all', { preHandler: [requireAuth] }, async (request, reply) => {
    await SessionService.revokeAllForUser(request.user!.id);
    clearSessionCookie(reply);
    return reply.send({ success: true, message: 'Logged out of all sessions' });
  });

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

  server.delete('/auth/sessions/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const revoked = await SessionService.revokeById(request.user!.id, id);
    if (!revoked) return reply.code(404).send({ success: false, error: 'Session not found' });
    return reply.send({ success: true, message: 'Session revoked' });
  });
}
