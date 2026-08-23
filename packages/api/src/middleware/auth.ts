/**
 * Fastify preHandler hooks for cookie-session authentication and role-based
 * authorization. Import and pass these directly in route `preHandler` arrays.
 *
 * Authentication is by opaque server-side session (see `SessionService`): the
 * httpOnly cookie carries an id, `requireAuth` resolves it to a user, and — when
 * the session rotates its id — transparently re-sets the cookie on the response.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database.js';
import { config } from '../config.js';
import { SessionService } from '../services/SessionService.js';
import { setSessionCookie } from '../utils/sessionCookie.js';
import { AuthService } from '../services/AuthService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
      isStaff: boolean;
      isBotOwner: boolean;
    };
    /** Database id of the session that authenticated this request. */
    sessionId?: string;
  }
}

/**
 * Resolves the session cookie, attaches the authenticated user to `request.user`,
 * and re-sets the cookie if the session rotated its id. Responds with 401 if the
 * cookie is missing, invalid, expired, revoked, or the user no longer exists.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = request.cookies[config.cookie.name];
  if (!sid) {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
    return;
  }

  const resolved = await SessionService.resolve(sid, {
    userAgent: request.headers['user-agent'] ?? null,
    ipAddress: request.ip,
  });
  if (!resolved) {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
    return;
  }

  // Transparent rotation: hand the browser the freshly-minted id.
  if (resolved.newSid) setSessionCookie(reply, resolved.newSid);

  const user = await prisma.portalUser.findUnique({ where: { id: resolved.userId } });
  if (!user) {
    reply.code(401).send({ success: false, error: 'User not found' });
    return;
  }

  request.sessionId = resolved.sessionId;
  request.user = {
    id: user.id,
    username: user.username,
    isStaff: user.isStaff,
    isBotOwner: user.isBotOwner,
  };
}

/**
 * Extends `requireAuth` to additionally require the staff or bot-owner flag.
 * Responds with 403 for authenticated users who lack the required role.
 */
export async function requireStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (!request.user?.isStaff && !request.user?.isBotOwner) {
    reply.code(403).send({ success: false, error: 'Forbidden: Staff access required' });
  }
}

/**
 * Extends `requireAuth` to additionally require the bot-owner flag.
 * Responds with 403 for authenticated users who are not the bot owner.
 */
export async function requireBotOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (!request.user?.isBotOwner) {
    reply.code(403).send({ success: false, error: 'Forbidden: Bot owner access required' });
  }
}

/**
 * Extends `requireAuth` to additionally verify that the user has the Discord
 * Administrator permission (or is the owner) in the guild identified by the
 * `:guildId` route parameter. Staff and bot owners bypass the Discord API check.
 *
 * Permission bits are compared as BigInt because Discord permissions exceed
 * the safe integer range for JavaScript numbers.
 */
export async function requireGuildAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const { guildId } = request.params as { guildId?: string };
  if (!guildId) {
    reply.code(400).send({ success: false, error: 'Guild ID required' });
    return;
  }

  // Staff and bot owners have implicit access to all guilds.
  if (request.user?.isStaff || request.user?.isBotOwner) return;

  const accessToken = await AuthService.getValidAccessToken(request.user!.id);
  if (!accessToken) {
    reply.code(403).send({ success: false, error: 'Discord authorization expired — please log in again' });
    return;
  }

  try {
    const { default: axios } = await import('axios');
    // Paginate /users/@me/guilds (200/page) and stop as soon as the target guild
    // is found, so admins of 200+ servers can still open a recently-joined one.
    type UserGuild = { id: string; permissions: string; owner?: boolean };
    let guild: UserGuild | undefined;
    let after: string | undefined;
    for (let page = 0; page < 10 && !guild; page++) {
      const url = `https://discord.com/api/v10/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`;
      const guildsRes = await axios.get<UserGuild[]>(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      guild = guildsRes.data.find((g) => g.id === guildId);
      if (guildsRes.data.length < 200) break;
      after = guildsRes.data[guildsRes.data.length - 1].id;
    }
    if (!guild) {
      reply.code(403).send({ success: false, error: 'You are not a member of this guild' });
      return;
    }

    const ADMINISTRATOR = BigInt(0x8);
    const MANAGE_GUILD = BigInt(0x20);
    const perms = BigInt(guild.permissions);
    const canManage =
      (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;

    if (!canManage && guild.owner !== true) {
      reply.code(403).send({ success: false, error: 'Administrator or Manage Server permission required' });
    }
  } catch {
    reply.code(500).send({ success: false, error: 'Failed to verify guild permissions' });
  }
}
