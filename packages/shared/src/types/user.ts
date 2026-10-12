/**
 * Shared user and session types (portal user, user level, session).
 */
export interface PortalUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  isStaff: boolean;
  isBotOwner: boolean;
}

export interface UserLevel {
  userId: string;
  guildId: string;
  userTag: string;
  xp: number;
  level: number;
  totalMessages: number;

  rank?: number;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}
