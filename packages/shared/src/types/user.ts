/** User-facing data models for portal sessions and the leveling system. */

/** A Discord user record as exposed to the web portal. */
export interface PortalUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  email?: string;
  isStaff: boolean;
  isBotOwner: boolean;
}

/** A user's XP and level standing within a specific guild. */
export interface UserLevel {
  userId: string;
  guildId: string;
  userTag: string;
  xp: number;
  level: number;
  totalMessages: number;
  /** The user's current rank among all members in the guild. */
  rank?: number;
}

/** An authenticated portal session record. */
export interface UserSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}
