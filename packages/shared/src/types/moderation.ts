/**
 * Shared moderation types — cases, warnings and the set of moderation action kinds.
 */
export type ModerationActionType =
  | 'ban'
  | 'unban'
  | 'kick'
  | 'mute'
  | 'unmute'
  | 'warn'
  | 'tempban';

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

  duration?: number;
  expiresAt?: Date;

  active: boolean;
  messageUrl?: string;
  createdAt: Date;
}

export interface Warning {
  id: string;
  guildId: string;
  userId: string;
  moderatorId: string;
  reason: string;
  active: boolean;
  createdAt: Date;
}

export interface ModerationAction {
  type: ModerationActionType;
  guildId: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  reason?: string;

  duration?: number;
}
