/**
 * Discord OAuth2: authorisation-URL construction (with PKCE), code exchange,
 * profile fetch, and portal-user persistence. Session issuance lives in
 * `SessionService`; this module deals only with the Discord side of the flow.
 */
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../database.js';
import { config } from '../config.js';
import { encryptSecret, decryptSecretLenient } from '../utils/crypto.js';
import type { PortalUser } from '@arkenbot/shared';

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

/** A PKCE verifier and its S256 challenge, generated per authorisation attempt. */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

export class AuthService {
  /**
   * Generates a PKCE verifier/challenge pair. The verifier is held server-side
   * (Redis, keyed by state) and replayed at code exchange; only the S256
   * challenge travels to Discord, so an intercepted authorisation code cannot be
   * redeemed without the verifier.
   */
  static generatePkce(): PkcePair {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  /**
   * Builds the Discord OAuth2 authorisation URL for the given CSRF state token
   * and PKCE challenge. The state value must be stored server-side and validated
   * in the callback.
   */
  static getOAuthUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: config.discord.redirectUri,
      response_type: 'code',
      scope: 'identify email guilds',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  /**
   * Exchanges a Discord OAuth2 authorisation code (plus its PKCE verifier) for
   * access and refresh tokens.
   * @throws If the Discord token endpoint returns an error.
   */
  static async exchangeCode(code: string, codeVerifier: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.discord.redirectUri,
      code_verifier: codeVerifier,
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
   * sealing the OAuth tokens at rest and refreshing the bot-owner flag from
   * config.
   */
  static async upsertUser(discordUser: DiscordUser, tokens: DiscordTokenResponse): Promise<PortalUser> {
    const tokenExpires = new Date(Date.now() + tokens.expires_in * 1000);
    const isBotOwner = config.owners.includes(discordUser.id);
    const accessToken = encryptSecret(tokens.access_token);
    const refreshToken = encryptSecret(tokens.refresh_token);

    const shared = {
      username: discordUser.username,
      discriminator: discordUser.discriminator,
      avatar: discordUser.avatar,
      email: discordUser.email,
      accessToken,
      refreshToken,
      tokenExpires,
      isBotOwner,
    };

    const user = await prisma.portalUser.upsert({
      where: { id: discordUser.id },
      update: shared,
      create: { id: discordUser.id, ...shared },
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
   * Exchanges a stored refresh token for a fresh access/refresh token pair.
   * @throws If Discord rejects the refresh (e.g. the grant was revoked); the
   *         caller should treat this as "re-authentication required".
   */
  static async refreshAccessToken(refreshToken: string): Promise<DiscordTokenResponse> {
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await axios.post<DiscordTokenResponse>(
      `${DISCORD_API}/oauth2/token`,
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data;
  }

  /**
   * Returns a currently-valid Discord access token for the user, transparently
   * refreshing (and re-sealing) it when the stored one is within 60s of expiry.
   * Discord rotates the refresh token on each use, so the new pair is persisted.
   * Returns null when there is no token or the refresh grant is no longer valid
   * (the user must log in again).
   */
  static async getValidAccessToken(userId: string): Promise<string | null> {
    const user = await prisma.portalUser.findUnique({
      where: { id: userId },
      select: { accessToken: true, refreshToken: true, tokenExpires: true },
    });
    if (!user?.accessToken) return null;

    const stillValid = user.tokenExpires && user.tokenExpires.getTime() - Date.now() > 60_000;
    if (stillValid) return decryptSecretLenient(user.accessToken);

    // Expired (or about to): refresh using the stored refresh token.
    if (!user.refreshToken) return null;
    try {
      const tokens = await this.refreshAccessToken(decryptSecretLenient(user.refreshToken));
      await prisma.portalUser.update({
        where: { id: userId },
        data: {
          accessToken: encryptSecret(tokens.access_token),
          refreshToken: encryptSecret(tokens.refresh_token),
          tokenExpires: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });
      return tokens.access_token;
    } catch {
      return null;
    }
  }
}
