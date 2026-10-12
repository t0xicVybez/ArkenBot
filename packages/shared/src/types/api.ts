

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: import('./user.js').PortalUser;
  tokens: AuthTokens;
}

export interface GuildOverview {
  id: string;
  name: string;
  iconUrl?: string;
  memberCount: number;

  botPresent: boolean;
  hasAdminPermission: boolean;
  guildAddons?: Array<{ addon: { name: string; displayName: string } }>;
}

export interface SystemStats {
  totalGuilds: number;
  activeGuilds: number;
  totalUsers: number;
  totalCommands: number;
  totalCases: number;
  totalWarnings: number;
  totalAddons: number;

  uptime: number;

  memoryUsage: number | null;

  totalMemoryUsage?: number | null;
  cpuUsage: number;
  version: string;
}

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
