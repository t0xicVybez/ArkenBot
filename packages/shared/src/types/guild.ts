

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

export interface GuildSettings {
  guildId: string;
  prefix: string;
  locale: string;
  timezone: string;

  moderationEnabled: boolean;
  autoModEnabled: boolean;
  levelingEnabled: boolean;
  welcomeEnabled: boolean;
  loggingEnabled: boolean;
  musicEnabled: boolean;
  reactionRolesEnabled: boolean;
  highlightsEnabled: boolean;

  setupStep?: number;
  setupCompletedAt?: string | null;

  logChannelId?: string;
  modLogChannelId?: string;
  welcomeChannelId?: string;
  leaveChannelId?: string;
  levelUpChannelId?: string;
  highlightsChannelId?: string | null;

  muteRoleId?: string;
  autoRoleId?: string;
  memberRoleId?: string;

  permissionAlertsEnabled?: boolean;
  permissionAlertRoleId?: string;
  appealsEnabled?: boolean;
  appealChannelId?: string | null;
  banNetworkEnabled?: boolean;
  banNetworkContribute?: boolean;
  banNetworkAction?: string;
  banNetworkThreshold?: number;
  banNetworkChannelId?: string | null;

  xpPerMessage: number;
  xpCooldown: number;
  xpMultiplier: number;
  keepPreviousRoles: boolean;
  levelUpMessage: string;
  levelUpEmbed: boolean;
  xpDecayEnabled: boolean;
  xpDecayDays: number;
  xpDecayPercent: number;
  voiceXpEnabled: boolean;
  voiceXpPerMinute: number;
  prestigeEnabled: boolean;
  prestigeLevel: number;

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

  extended: Record<string, unknown>;
}

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
  minAccountAgeEnabled: boolean;
  minAccountAgeHours: number;
  minAccountAgeAction: string;
  quarantineRoleId: string | null;
  newAccountFlagEnabled: boolean;
  newAccountFlagHours: number;
  antiPhishingEnabled: boolean;
  antiPhishingAction: string;
  aiModEnabled: boolean;
  aiModAction: string;
  exemptRoles: string[];
  exemptChannels: string[];
}

export type AutoModAction = 'delete' | 'warn' | 'mute' | 'kick' | 'ban';

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

export interface ReactionRole {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;

  type: 'toggle' | 'add' | 'remove';
}

export interface CustomCommand {
  id: string;
  guildId: string;
  name: string;
  response: string;
  embed: boolean;
  enabled: boolean;
  uses: number;
}
