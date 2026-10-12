
export interface ConfessionConfig {

  channelId?: string;

  reviewChannelId?: string;

  allowReplies: boolean;

  blocked: string[];

  cooldownSec: number;

  counter: number;
}

export type ConfessionStatus = 'pending' | 'posted' | 'denied';

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
