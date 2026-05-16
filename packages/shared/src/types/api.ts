/** Standard API response shapes shared between the bot, API server, and web portal. */

/** Generic envelope for all API responses. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Paginated list response. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** OAuth2 token pair returned after successful authentication. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Response body for the Discord OAuth2 login endpoint. */
export interface LoginResponse {
  user: import('./user.js').PortalUser;
  tokens: AuthTokens;
}

/** Summary of a Discord guild shown in the portal guild list. */
export interface GuildOverview {
  id: string;
  name: string;
  iconUrl?: string;
  memberCount: number;
  /** Whether the bot is currently a member of this guild. */
  botPresent: boolean;
  hasAdminPermission: boolean;
  guildAddons?: Array<{ addon: { name: string; displayName: string } }>;
}

/** Aggregate runtime statistics for the bot instance. */
export interface SystemStats {
  totalGuilds: number;
  activeGuilds: number;
  totalUsers: number;
  totalCommands: number;
  totalCases: number;
  totalWarnings: number;
  totalAddons: number;
  /** Process uptime in seconds. */
  uptime: number;
  /** RSS memory usage in bytes. */
  memoryUsage: number;
  cpuUsage: number;
  version: string;
}

/** Per-guild analytics for the last 24 hours. */
export interface GuildAnalytics {
  guildId: string;
  messageCount24h: number;
  commandsUsed24h: number;
  newMembers24h: number;
  leftMembers24h: number;
  moderationActions24h: number;
  topChannels: Array<{ channelId: string; messageCount: number }>;
  topCommands: Array<{ command: string; count: number }>;
  logEvents?: Array<{ type: string; _count: { type: number } }>;
}
