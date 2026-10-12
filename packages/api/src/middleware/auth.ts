
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database.js';
import { config } from '../config.js';
import { ensureGuildRow } from '../utils/ensureGuild.js';
import { SessionService } from '../services/SessionService.js';
import { setSessionCookie } from '../utils/sessionCookie.js';
import { AuthService } from '../services/AuthService.js';
import { getUserGuilds, GuildFetchRateLimited } from '../utils/userGuilds.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username: string;
      isStaff: boolean;
      isBotOwner: boolean;
    };

    sessionId?: string;
  }
}

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

export async function requireStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (!request.user?.isStaff && !request.user?.isBotOwner) {
    reply.code(403).send({ success: false, error: 'Forbidden: Staff access required' });
  }
}

export async function requireBotOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (!request.user?.isBotOwner) {
    reply.code(403).send({ success: false, error: 'Forbidden: Bot owner access required' });
  }
}

export async function requireGuildAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const { guildId } = request.params as { guildId?: string };
  if (!guildId) {
    reply.code(400).send({ success: false, error: 'Guild ID required' });
    return;
  }

  if (request.user?.isStaff || request.user?.isBotOwner) {
    await ensureGuildRow(guildId);
    return;
  }

  const accessToken = await AuthService.getValidAccessToken(request.user!.id);
  if (!accessToken) {
    reply.code(403).send({ success: false, error: 'Discord authorization expired — please log in again' });
    return;
  }

  try {

    const guilds = await getUserGuilds(request.user!.id, accessToken);
    const guild = guilds.find((g) => g.id === guildId);
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
      return;
    }

    await ensureGuildRow(guildId);
  } catch (err) {
    if (err instanceof GuildFetchRateLimited) {
      reply.header('Retry-After', String(err.retryAfterSeconds));
      reply.code(429).send({ success: false, error: 'Discord is rate-limiting requests — please retry in a moment' });
      return;
    }
    request.log.error({ err, guildId, userId: request.user?.id }, 'Failed to verify guild permissions');
    reply.code(500).send({ success: false, error: 'Failed to verify guild permissions' });
  }
}
