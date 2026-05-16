/** Moderation case, warning, and action types. */

/** The set of actions a moderator can take against a guild member. */
export type ModerationActionType =
  | 'ban'
  | 'unban'
  | 'kick'
  | 'mute'
  | 'unmute'
  | 'warn'
  | 'tempban';

/** A persisted moderation case record. */
export interface ModerationCase {
  id: string;
  caseNumber: number;
  guildId: string;
  type: ModerationActionType;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason: string;
  /** Duration in seconds, applicable to mutes and tempbans. */
  duration?: number;
  expiresAt?: Date;
  /** Whether the action is still in effect (e.g. active mute). */
  active: boolean;
  messageUrl?: string;
  createdAt: Date;
}

/** A standalone warning record separate from the full moderation case log. */
export interface Warning {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  active: boolean;
  createdAt: Date;
}

/** Input payload for creating a new moderation action. */
export interface ModerationAction {
  type: ModerationActionType;
  guildId: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason?: string;
  /** Duration in seconds, applicable to mutes and tempbans. */
  duration?: number;
}
