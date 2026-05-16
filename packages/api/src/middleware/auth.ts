/**
 * Fastify preHandler hooks for JWT-based authentication and role-based
 * authorization. Import and pass these directly in route `preHandler` arrays.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database.js';
import { config } from '../config.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      username: string;
      isStaff: boolean;
      isBotOwner: boolean;
    };
  }
}

/**
 * Verifies the JWT and attaches the authenticated user to `request.user`.
 * Responds with 401 if the token is missing, invalid, or the user no longer exists.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as unknown as { sub: string };

    const user = await prisma.portalUser.findUnique({ where: { id: payload.sub } });
    if (!user) {
      reply.code(401).send({ success: false, error: 'User not found' });
      return;
    }

    request.user = {
      id: user.id,
      username: user.username,
      isStaff: user.isStaff,
      isBotOwner: user.isBotOwner,
    };
  } catch {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
  }
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

  const user = await prisma.portalUser.findUnique({ where: { id: request.user!.id } });
  if (!user?.accessToken) {
    reply.code(403).send({ success: false, error: 'No Discord access token' });
    return;
  }

  try {
    const { default: axios } = await import('axios');
    const guildsRes = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    const guild = guildsRes.data.find((g: { id: string; permissions: string }) => g.id === guildId);
    if (!guild) {
      reply.code(403).send({ success: false, error: 'You are not a member of this guild' });
      return;
    }

    const ADMINISTRATOR = BigInt(0x8);
    const hasAdmin = (BigInt(guild.permissions) & ADMINISTRATOR) === ADMINISTRATOR;

    if (!hasAdmin && guild.owner !== true) {
      reply.code(403).send({ success: false, error: 'Administrator permission required' });
    }
  } catch {
    reply.code(500).send({ success: false, error: 'Failed to verify guild permissions' });
  }
}
