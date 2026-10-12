

export interface SettingsUpdatePayload {
  guildId: string;
  section: SettingsSection;
  data: Record<string, unknown>;
}

export type SettingsSection =
  | 'general'
  | 'moderation'
  | 'automod'
  | 'leveling'
  | 'welcome'
  | 'logging'
  | 'music'
  | 'reactionRoles'
  | 'addon';
