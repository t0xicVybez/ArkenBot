/**
 * Handles Discord OAuth2 authentication, JWT issuance, refresh-token rotation,
 * and portal user persistence.
 */
import axios from 'axios';
import { prisma } from '../database.js';
import { config } from '../config.js';
import type { FastifyInstance } from 'fastify';
import type { LoginResponse, PortalUser } from '@arkenbot/shared';

const DISCORD_API = 'https://discord.com/api/v10';

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

export class AuthService {
  /**
   * Builds the Discord OAuth2 authorisation URL for the given CSRF state token.
   * The state value must be stored server-side and validated in the callback.
   */
  static getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: config.discord.redirectUri,
      response_type: 'code',
      scope: 'identify email guilds',
      state,
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  /**
   * Exchanges a Discord OAuth2 authorisation code for access and refresh tokens.
   * @throws If the Discord token endpoint returns an error.
   */
  static async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.discord.redirectUri,
    });

    const response = await axios.post<DiscordTokenResponse>(
      `${DISCORD_API}/oauth2/token`,
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return response.data;
  }

  /**
   * Fetches the authenticated Discord user's profile using their access token.
   */
  static async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const response = await axios.get<DiscordUser>(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }

  /**
   * Creates or updates the portal user record for the given Discord user,
   * storing fresh OAuth tokens and refreshing the bot-owner flag from config.
   */
  static async upsertUser(discordUser: DiscordUser, tokens: DiscordTokenResponse): Promise<PortalUser> {
    const tokenExpires = new Date(Date.now() + tokens.expires_in * 1000);
    const isBotOwner = config.owners.includes(discordUser.id);

    const user = await prisma.portalUser.upsert({
      where: { id: discordUser.id },
      update: {
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpires,
        isBotOwner,
      },
      create: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        avatar: discordUser.avatar,
        email: discordUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpires,
        isBotOwner,
      },
    });

    return {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar ?? undefined,
      email: user.email ?? undefined,
      isStaff: user.isStaff,
      isBotOwner: user.isBotOwner,
    };
  }

  /**
   * Issues a new access/refresh token pair for the given user, persists the
   * refresh token as a `UserSession`, and prunes any expired sessions for that
   * user in the same transaction window.
   *
   * Expiry is computed from the config string at call time rather than being
   * hard-coded, so changes to `JWT_REFRESH_EXPIRY` take effect without a schema
   * migration.
   */
  static async generateTokens(
    server: FastifyInstance,
    userId: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = server.jwt.sign({ sub: userId }, { expiresIn: config.jwt.accessExpiry });
    const refreshToken = server.jwt.sign({ sub: userId, type: 'refresh' }, { expiresIn: config.jwt.refreshExpiry });

    const expiresAt = new Date(Date.now() + parseExpiry(config.jwt.refreshExpiry));

    await prisma.userSession.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });

    await prisma.userSession.create({
      data: { userId, token: refreshToken, expiresAt },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Validates a refresh token against the database, rotates it by issuing a new
   * token pair, and deletes the consumed session. Returns `null` if the token is
   * invalid, expired, or not a refresh token.
   */
  static async refreshTokens(
    server: FastifyInstance,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const session = await prisma.userSession.findUnique({ where: { token: refreshToken } });
    if (!session || session.expiresAt < new Date()) return null;

    try {
      const payload = server.jwt.verify<{ sub: string; type: string }>(refreshToken);
      if (payload.type !== 'refresh') return null;

      await prisma.userSession.delete({ where: { id: session.id } });

      return this.generateTokens(server, session.userId);
    } catch {
      return null;
    }
  }

  /**
   * Invalidates the session associated with the given refresh token.
   */
  static async logout(refreshToken: string): Promise<void> {
    await prisma.userSession.deleteMany({ where: { token: refreshToken } });
  }

  /** Removes all expired sessions from the database. Called once at API startup. */
  static async cleanupExpiredSessions(): Promise<void> {
    const { count } = await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      console.info(`[AuthService] Cleaned up ${count} expired session(s)`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converts a JWT expiry string such as "15m", "7d", or "3600s" to milliseconds. */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 30 * 24 * 3600 * 1000; // fallback: 30 days
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'd': return value * 86400 * 1000;
    default:  return 30 * 24 * 3600 * 1000;
  }
}
