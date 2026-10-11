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
  /**
   * Custom form questions for THIS button. When present and non-empty they
   * override the panel-level `fields`, so each ticket type can ask its own
   * questions from a single panel. When absent/empty, the panel `fields` apply.
   */
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
  /** On breach, raise the ticket to this priority (auto-escalation). */
  escalatePriority?: TicketPriority;
  /** On breach, ping (and, with auto-assign, prefer) this senior role. */
  escalateRoleId?: string;
}

/** Support/business hours — pauses SLA and sends an away reply outside hours. */
export interface BusinessHours {
  enabled: boolean;
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
  /** Local open/close times, "HH:MM" 24h. */
  openTime: string;
  closeTime: string;
  /** Active weekdays, 0=Sunday … 6=Saturday. */
  days: number[];
  /** Posted (once) when a ticket opens outside hours. */
  awayMessage?: string;
  /** When true, SLA timers don't advance outside business hours. */
  pauseSla?: boolean;
}

/** Cached AI triage output stored on the ticket. */
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
  /**
   * How the panel's ticket options are presented to users:
   *  - 'buttons'  (default) → one clickable button per option
   *  - 'dropdown' → a single string-select menu listing every option
   * Dropdown only applies when there are 2+ buttons; a single-option panel
   * always renders as a button.
   */
  panelStyle?: 'buttons' | 'dropdown';
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
  /** ID of the panel button used to open this ticket (for per-button fields) */
  buttonId?: string;
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

  // ─── Enhancements ──────────────────────────────────────────────────────
  /** Pre-close inactivity nudge sent at (ISO) — nudge the opener only once. */
  nudgedAt?: string;
  /** Snooze: fire a staff reminder ping at this time (ISO). */
  reminderAt?: string;
  reminderBy?: string;
  reminderNote?: string;
  /** Close request awaiting the opener's confirmation. */
  closeRequestedBy?: string;
  closeRequestedByTag?: string;
  closeRequestedAt?: string;
  /** Cached AI triage result. */
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

  // ─── Enhancements ──────────────────────────────────────────────────────
  // Tier 2 — AI
  /** Run AI triage automatically when a ticket opens (staff-only summary). */
  autoTriage?: boolean;
  /** Let auto-triage set the ticket's initial priority from AI urgency. */
  autoTriageSetPriority?: boolean;
  /** Let auto-triage apply a suggested tag. */
  autoTriageTag?: boolean;
  // Tier 1 — pre-close nudge + business hours
  /** Warn the opener this many hours before auto-close (0 = off). */
  nudgeBeforeCloseHours?: number;
  businessHours?: BusinessHours;
  // Tier 3 — show the opener's prior tickets to staff on open
  showUserHistory?: boolean;
  // Tier 4 — quality loop + collaborative close
  /** Alert when a rating is at or below this (1–5; 0 = off). */
  lowRatingThreshold?: number;
  lowRatingAlertRoleId?: string;
  lowRatingAlertChannelId?: string;
  // Tier 5 — abuse controls + digest
  /** Minimum minutes between a user's ticket opens (0 = off). */
  openCooldownMinutes?: number;
  /** Minimum Discord account age in days to open a ticket (0 = off). */
  minAccountAgeDays?: number;
  /** Members must have this role to open a ticket (blank = anyone). */
  requiredOpenRoleId?: string;
  /** Post a weekly stats digest to this channel (blank = off). */
  weeklyDigestChannelId?: string;
}
