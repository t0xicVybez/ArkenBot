/**
 * Discord OAuth helper: builds the PKCE login URL, exchanges the returned code for tokens, and refreshes/validates a user's access token.
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

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export class AuthService {

  static generatePkce(): PkcePair {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

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

  static async getDiscordUser(accessToken: string): Promise<DiscordUser> {
    const response = await axios.get<DiscordUser>(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }

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

  static async getValidAccessToken(userId: string): Promise<string | null> {
    const user = await prisma.portalUser.findUnique({
      where: { id: userId },
      select: { accessToken: true, refreshToken: true, tokenExpires: true },
    });
    if (!user?.accessToken) return null;

    const stillValid = user.tokenExpires && user.tokenExpires.getTime() - Date.now() > 60_000;
    if (stillValid) return decryptSecretLenient(user.accessToken);

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
