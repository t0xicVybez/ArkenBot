export type ButtonColor = 'primary' | 'secondary' | 'success' | 'danger';
export type TicketStatus = 'open' | 'claimed' | 'closed' | 'waiting';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CloseAction = 'delete' | 'archive';

export interface PanelButton {
  id: string;
  label: string;
  emoji: string;
  color: ButtonColor;
  /** Optional tag applied to tickets opened via this button */
  categoryTag?: string;
  staffRoles?: string[];
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
}

export interface TicketPanel {
  id: string;
  name: string;
  /** Embed description / panel body text */
  description: string;
  emoji: string;
  channelId?: string;
  messageId?: string;
  categoryId?: string;
  logChannelId?: string;
  staffRoles: string[];
  maxTicketsPerUser: number;
  namingPattern: string; // supports {number}, {username}
  closeAction: CloseAction;
  autoCloseHours: number; // 0 = disabled
  requireReason: boolean;
  welcomeMessage: string;
  /** If set, overrides legacy single-button fields */
  buttons?: PanelButton[];
  /** Legacy single-button — used if buttons array is absent or empty */
  buttonLabel: string;
  buttonColor: ButtonColor;
  // ─── Embed customisation ─────────────────────────────────────────
  embedColor?: string;           // hex e.g. "#5865F2"
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
  /** Short name shown in autocomplete */
  name: string;
  /** Full response text posted into the ticket */
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
  /** Staff member this ticket was transferred to */
  transferredTo?: string;
  transferredToTag?: string;
  reason?: string;
  /** Category tag from the panel button that was clicked */
  categoryTag?: string;
  tags: string[];
  rating?: number;
  ratingFeedback?: string;

  closedBy?: string;
  closedByTag?: string;
  closedAt?: string;
  /** ISO timestamp of first staff reply (for response time tracking) */
  firstResponseAt?: string;
  notes: TicketNote[];
  controlsMessageId?: string;
  /** ID of the private staff-notes thread in the ticket channel */
  notesThreadId?: string;
  createdAt: string;
  lastActivity: string;
  formResponses?: Record<string, string>;
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
  /** SLA threshold in hours — tickets open longer than this are flagged (0 = disabled) */
  slaHours?: number;
  /** Webhook URL to POST to on ticket open/close */
  webhookUrl?: string;
  staffNotifyChannelId?: string;
  staffNotifyRoleId?: string;
  ratingWindowMinutes?: number;
  slaLevels?: SlaLevel[];
  autoAssign?: boolean;
  roundRobinIndex?: number;
}
