/**
 * Shared constants: the XP curve, default configs and limits, permission and log-type lists, the brand colour palette, Redis key builders, and addon/locale constants.
 */
export const XP_PER_LEVEL_BASE = 100;

export const XP_MULTIPLIER = 1.5;

export const DEFAULT_PREFIX = '!';
export const DEFAULT_COLOR = '#5865F2';

export const MAX_WARNINGS = 10;
export const MAX_CUSTOM_COMMANDS = 50;

export const PERMISSION_LEVELS = {
  EVERYONE: 0,
  MODERATOR: 1,
  ADMIN: 2,
  GUILD_OWNER: 3,
  BOT_STAFF: 4,
  BOT_OWNER: 5,
} as const;

export const LOG_TYPES = {
  MESSAGE_DELETE: 'message_delete',
  MESSAGE_EDIT: 'message_edit',
  MEMBER_JOIN: 'member_join',
  MEMBER_LEAVE: 'member_leave',
  MEMBER_BAN: 'member_ban',
  MEMBER_UNBAN: 'member_unban',
  MEMBER_KICK: 'member_kick',
  MEMBER_MUTE: 'member_mute',
  MEMBER_UNMUTE: 'member_unmute',
  MEMBER_WARN: 'member_warn',
  CHANNEL_CREATE: 'channel_create',
  CHANNEL_DELETE: 'channel_delete',
  ROLE_CREATE: 'role_create',
  ROLE_DELETE: 'role_delete',
  AUTOMOD: 'automod',
} as const;

export type LogType = (typeof LOG_TYPES)[keyof typeof LOG_TYPES];

export const COLORS = {
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  WARNING: 0xfee75c,
  INFO: 0x5865f2,
  MODERATION: 0xeb459e,
  NEUTRAL: 0x99aab5,
} as const;

export const ADDON_CATEGORY_PREFIX = 'addon:';

export const REDIS_KEYS = {
  GUILD_SETTINGS: (guildId: string) => `guild:settings:${guildId}`,
  GUILD_ADDON: (guildId: string, addonName: string) => `guild:addon:${guildId}:${addonName}`,
  USER_XP_COOLDOWN: (guildId: string, userId: string) => `xp:cooldown:${guildId}:${userId}`,
  SPAM_TRACKER: (guildId: string, userId: string) => `spam:${guildId}:${userId}`,
  MUTED_USER: (guildId: string, userId: string) => `muted:${guildId}:${userId}`,
  RAID_TRACKER: (guildId: string) => `raid:${guildId}`,
  RAID_LOCKDOWN: (guildId: string) => `raid:lockdown:${guildId}`,
  BOT_STATS: 'bot:stats',
} as const;
