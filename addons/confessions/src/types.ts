/** Per-guild configuration for the Confessions addon. Stored under key 'config'. */
export interface ConfessionConfig {
  /** Public channel where approved confessions are posted. Unset = disabled. */
  channelId?: string;
  /** If set, submissions go here for staff approval before being posted. */
  reviewChannelId?: string;
  /** Open a reply thread under each posted confession. */
  allowReplies: boolean;
  /** User IDs barred from submitting. */
  blocked: string[];
  /** Seconds a user must wait between submissions. */
  cooldownSec: number;
  /** Running counter → each confession gets a stable public number. */
  counter: number;
}

export type ConfessionStatus = 'pending' | 'posted' | 'denied';

/**
 * A confession record. `userId` is retained for STAFF ACCOUNTABILITY ONLY
 * (abuse tracing via /confess-setup whois) and is NEVER shown publicly.
 */
export interface ConfessionRecord {
  id: string;
  number: number;
  userId: string;
  content: string;
  status: ConfessionStatus;
  createdAt: string;
  publicMessageId?: string;
  reviewMessageId?: string;
}

export const DEFAULT_CONFIG: ConfessionConfig = {
  allowReplies: false,
  blocked: [],
  cooldownSec: 30,
  counter: 0,
};
