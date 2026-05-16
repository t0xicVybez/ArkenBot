/** Payload and section types used when updating guild settings via the portal. */

/** Payload sent by the portal when saving a section of guild settings. */
export interface SettingsUpdatePayload {
  guildId: string;
  section: SettingsSection;
  data: Record<string, unknown>;
}

/** Identifies which settings section is being updated. */
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
