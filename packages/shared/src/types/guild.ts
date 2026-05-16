/** Guild data models including settings, auto-mod, welcome configuration, and custom commands. */

/** Core guild record stored in the database. */
export interface GuildData {
  id: string;
  name: string;
  iconUrl?: string;
  ownerId: string;
  joinedAt: Date;
  isActive: boolean;
  memberCount?: number;
  settings?: GuildSettings;
}

/** Full guild configuration record. */
export interface GuildSettings {
  guildId: string;
  prefix: string;
  locale: string;
  timezone: string;

  // Feature toggles
  moderationEnabled: boolean;
  autoModEnabled: boolean;
  levelingEnabled: boolean;
  welcomeEnabled: boolean;
  loggingEnabled: boolean;
  musicEnabled: boolean;
  reactionRolesEnabled: boolean;

  // Channels
  logChannelId?: string;
  modLogChannelId?: string;
  welcomeChannelId?: string;
  leaveChannelId?: string;
  levelUpChannelId?: string;

  // Roles
  muteRoleId?: string;
  autoRoleId?: string;
  memberRoleId?: string;

  // Leveling
  xpPerMessage: number;
  xpCooldown: number;
  xpMultiplier: number;
  keepPreviousRoles: boolean;
  levelUpMessage: string;
  levelUpEmbed: boolean;
  xpDecayEnabled: boolean;
  xpDecayDays: number;
  xpDecayPercent: number;

  // Embed accent colors (hex strings)
  accentColor: string;
  musicColor: string;
  levelUpColor: string;
  giveawayColor: string;
  birthdayColor: string;
  starboardColor: string;
  moderationColor: string;
  reactionRolesColor: string;
  streamAlertColor: string;
  scheduledMessageColor: string;
  loggingColor: string;
  announcementColor: string;

  /** Addon-specific extended settings stored as a freeform map. */
  extended: Record<string, unknown>;
}

/** Auto-moderation configuration for a guild. */
export interface AutoModConfig {
  guildId: string;
  antiSpamEnabled: boolean;
  antiSpamThreshold: number;
  antiSpamInterval: number;
  antiSpamAction: AutoModAction;
  filterEnabled: boolean;
  filteredWords: string[];
  filterAction: AutoModAction;
  filterWarnBeforeTimeout: number;
  filterTimeoutDuration: number;
  filterWarnBeforeKick: number;
  filterWarnMessage: string;
  filterKickMessage: string;
  filterKickDMMessage: string;
  antiLinkEnabled: boolean;
  allowedDomains: string[];
  linkAction: AutoModAction;
  antiMentionEnabled: boolean;
  mentionThreshold: number;
  antiCapsEnabled: boolean;
  capsThreshold: number;
  antiRaidEnabled: boolean;
  raidThreshold: number;
  raidInterval: number;
  raidAction: string;
  exemptRoles: string[];
  exemptChannels: string[];
}

/** Action taken by auto-mod when a rule is triggered. */
export type AutoModAction = 'delete' | 'warn' | 'mute' | 'kick' | 'ban';

/** Welcome and leave message configuration for a guild. */
export interface WelcomeConfig {
  guildId: string;
  welcomeEnabled: boolean;
  welcomeChannelId?: string;
  welcomeMessage: string;
  welcomeEmbed: boolean;
  welcomeColor: string;
  welcomeDMEnabled: boolean;
  welcomeDMMessage: string;
  leaveEnabled: boolean;
  leaveChannelId?: string;
  leaveMessage: string;
}

/** A single reaction-role mapping. */
export interface ReactionRole {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
  /** `toggle` adds or removes the role; `add` only adds; `remove` only removes. */
  type: 'toggle' | 'add' | 'remove';
}

/** A guild-defined text command that responds with a fixed message. */
export interface CustomCommand {
  id: string;
  guildId: string;
  name: string;
  response: string;
  embed: boolean;
  enabled: boolean;
  uses: number;
}
