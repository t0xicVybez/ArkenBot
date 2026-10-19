/**
 * Type definitions for the tickets addon.
 */
export type ButtonColor = 'primary' | 'secondary' | 'success' | 'danger';
export type TicketStatus = 'open' | 'claimed' | 'closed' | 'waiting';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CloseAction = 'delete' | 'archive';

export interface PanelButton {
  id: string;
  label: string;
  emoji: string;
  color: ButtonColor;

  categoryTag?: string;
  staffRoles?: string[];

  fields?: PanelField[];
}

export interface PanelField {
  id: string;
  label: string;
  placeholder?: string;
  required: boolean;
  style: 'short' | 'paragraph';
  maxLength?: number;
}

export interface SlaLevel {
  hours: number;
  pingRoleId?: string;
  message?: string;

  escalatePriority?: TicketPriority;

  escalateRoleId?: string;
}

export interface BusinessHours {
  enabled: boolean;

  timezone: string;

  openTime: string;
  closeTime: string;

  days: number[];

  awayMessage?: string;

  pauseSla?: boolean;
}

export interface AiTriage {
  summary: string;
  urgency: string;
  reply?: string;
  tag?: string;
  at: string;
}

export interface TicketPanel {
  id: string;
  name: string;

  description: string;
  emoji: string;
  channelId?: string;
  messageId?: string;
  categoryId?: string;
  logChannelId?: string;
  staffRoles: string[];
  maxTicketsPerUser: number;
  namingPattern: string;
  closeAction: CloseAction;
  autoCloseHours: number;
  requireReason: boolean;
  welcomeMessage: string;

  buttons?: PanelButton[];

  buttonLabel: string;
  buttonColor: ButtonColor;

  panelStyle?: 'buttons' | 'dropdown';

  embedColor?: string;
  embedAuthorName?: string;
  embedAuthorIconUrl?: string;
  embedThumbnailUrl?: string;
  embedImageUrl?: string;
  embedFooterText?: string;
  embedFooterIconUrl?: string;
  enabled: boolean;
  createdAt: string;
  ticketMode: 'channel' | 'thread';
  fields?: PanelField[];
}

export interface TicketNote {
  id: string;
  authorId: string;
  authorTag: string;
  content: string;
  createdAt: string;
}

export interface CannedResponse {
  id: string;

  name: string;

  content: string;
  createdBy: string;
  createdByTag: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  panelId: string;
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  status: TicketStatus;
  priority: TicketPriority;
  claimedBy?: string;
  claimedByTag?: string;

  transferredTo?: string;
  transferredToTag?: string;
  reason?: string;

  categoryTag?: string;

  buttonId?: string;
  tags: string[];
  rating?: number;
  ratingFeedback?: string;
  ratingResolved?: boolean;

  closedBy?: string;
  closedByTag?: string;
  closedAt?: string;

  firstResponseAt?: string;
  notes: TicketNote[];
  controlsMessageId?: string;

  notesThreadId?: string;
  createdAt: string;
  lastActivity: string;
  formResponses?: Record<string, string>;

  nudgedAt?: string;

  reminderAt?: string;
  reminderBy?: string;
  reminderNote?: string;

  closeRequestedBy?: string;
  closeRequestedByTag?: string;
  closeRequestedAt?: string;

  aiTriage?: AiTriage;
}

export interface TicketMessage {
  authorId: string;
  authorTag: string;
  content: string;
  attachments: string[];
  timestamp: string;
}

export interface GuildTicketConfig {
  blacklistedUsers: string[];
  transcriptChannelId?: string;

  slaHours?: number;

  webhookUrl?: string;
  staffNotifyChannelId?: string;
  staffNotifyRoleId?: string;
  ratingWindowMinutes?: number;
  slaLevels?: SlaLevel[];
  autoAssign?: boolean;
  roundRobinIndex?: number;

  autoTriage?: boolean;

  autoTriageSetPriority?: boolean;

  autoTriageTag?: boolean;

  nudgeBeforeCloseHours?: number;
  businessHours?: BusinessHours;

  showUserHistory?: boolean;

  lowRatingThreshold?: number;
  lowRatingAlertRoleId?: string;
  lowRatingAlertChannelId?: string;

  openCooldownMinutes?: number;

  minAccountAgeDays?: number;

  requiredOpenRoleId?: string;

  weeklyDigestChannelId?: string;
}
