
import type { FastifyInstance } from 'fastify';
import { randomUUID, randomBytes } from 'crypto';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub, redis } from '../redis.js';
import { buildTicketTranscriptHtml, buildTicketTranscriptText, buildTicketTranscriptJson, isSnowflake } from '@arkenbot/shared';

const RELEASE_LOCK = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

const TICKET_COLUMN_KEYS = new Set(['id', 'guildId', 'number', 'panelId', 'channelId', 'userId', 'username', 'status', 'priority', 'categoryTag', 'buttonId', 'claimedBy', 'claimedByTag', 'closedBy', 'closedByTag', 'closedAt', 'rating', 'ratingFeedback', 'firstResponseAt', 'lastActivity', 'createdAt']);

function ticketToRow(t: Ticket): Record<string, unknown> {
  const raw = t as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!TICKET_COLUMN_KEYS.has(k)) data[k] = v;
  return {
    id: t.id, guildId: t.guildId, number: t.number, panelId: t.panelId, channelId: t.channelId,
    userId: t.userId, username: t.username, status: t.status, priority: t.priority,
    categoryTag: t.categoryTag ?? null, buttonId: (raw.buttonId as string | undefined) ?? null,
    claimedBy: t.claimedBy ?? null, claimedByTag: t.claimedByTag ?? null,
    closedBy: t.closedBy ?? null, closedByTag: t.closedByTag ?? null,
    closedAt: t.closedAt ? new Date(t.closedAt) : null,
    rating: t.rating ?? null, ratingFeedback: t.ratingFeedback ?? null,
    firstResponseAt: t.firstResponseAt ? new Date(t.firstResponseAt) : null,
    lastActivity: new Date(t.lastActivity), createdAt: new Date(t.createdAt), data,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTicket(r: any): Ticket {
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    ...d,
    id: r.id, number: r.number, panelId: r.panelId, guildId: r.guildId, channelId: r.channelId,
    userId: r.userId, username: r.username, status: r.status, priority: r.priority,
    categoryTag: r.categoryTag ?? undefined, buttonId: r.buttonId ?? undefined,
    claimedBy: r.claimedBy ?? undefined, claimedByTag: r.claimedByTag ?? undefined,
    closedBy: r.closedBy ?? undefined, closedByTag: r.closedByTag ?? undefined,
    closedAt: r.closedAt ? r.closedAt.toISOString() : undefined,
    rating: r.rating ?? undefined, ratingFeedback: r.ratingFeedback ?? undefined,
    firstResponseAt: r.firstResponseAt ? r.firstResponseAt.toISOString() : undefined,
    lastActivity: r.lastActivity.toISOString(), createdAt: r.createdAt.toISOString(),
    tags: (d.tags as string[]) ?? [], notes: (d.notes as Ticket['notes']) ?? [],
  } as Ticket;
}

async function readTickets(guildId: string): Promise<Ticket[]> {
  const rows = await prisma.addonTicket.findMany({ where: { guildId } });
  return rows.map(rowToTicket);
}

/**
 * Whether a ticket is currently in SLA breach: still open, never got a
 * first response, and has been open at least as long as the guild's
 * lowest-configured SLA threshold. Mirrors the bot's own escalation job
 * (modules/jobs SLA tier logic) — tiered `slaLevels` win when configured,
 * falling back to the legacy single `slaHours` only when there are no
 * tiers, same precedence as the live escalation. Exported and pure
 * (takes `nowMs` instead of calling Date.now() itself) so it's unit-
 * testable without a database — see tests/api/tickets-stats.test.ts.
 */
export function slaThresholdHours(config: GuildTicketConfig): number | null {
  const hours = config.slaLevels?.length ? Math.min(...config.slaLevels.map((l) => l.hours)) : config.slaHours;
  return hours && hours > 0 ? hours : null;
}

export function computeSlaBreach(ticket: Ticket, config: GuildTicketConfig, nowMs: number): boolean {
  if (ticket.status === 'closed' || ticket.firstResponseAt) return false;
  const thresholdHours = slaThresholdHours(config);
  if (thresholdHours === null) return false;
  const openMs = nowMs - new Date(ticket.createdAt).getTime();
  return openMs >= thresholdHours * 60 * 60 * 1000;
}

/**
 * Retrospective version for per-staff adherence: did this ticket's first
 * response (or the still-waiting time, if none yet) land within the SLA
 * threshold? Unlike computeSlaBreach (a live "needs attention now" count,
 * open tickets only), this applies to closed tickets too, since it's
 * measuring past response behavior, not current state.
 */
export function computeSlaMissed(ticket: Ticket, config: GuildTicketConfig, nowMs: number): boolean {
  const thresholdHours = slaThresholdHours(config);
  if (thresholdHours === null) return false;
  const thresholdMs = thresholdHours * 60 * 60 * 1000;
  const responseMs = ticket.firstResponseAt
    ? new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime()
    : nowMs - new Date(ticket.createdAt).getTime();
  return responseMs >= thresholdMs;
}

interface TicketMessageRow { authorId: string; authorTag: string; content: string; attachments: unknown; timestamp: Date; }

/**
 * Reads a ticket's message history from the relational AddonTicketMessage
 * table (the P1.2 migration target). The old `AddonData` key `msgs:<channelId>`
 * this used to read from was deleted when that migration finished on prod —
 * nothing writes it anymore, so reading it here always returned an empty list.
 */
async function readMessages(channelId: string): Promise<{ authorId: string; authorTag: string; content: string; attachments: string[]; timestamp: string }[]> {
  const rows = (await prisma.addonTicketMessage.findMany({
    where: { channelId },
    orderBy: { timestamp: 'asc' },
  })) as TicketMessageRow[];
  return rows.map((r) => ({
    authorId: r.authorId,
    authorTag: r.authorTag,
    content: r.content,
    attachments: (r.attachments as string[] | null) ?? [],
    timestamp: r.timestamp.toISOString(),
  }));
}

async function writeTickets(guildId: string, tickets: Ticket[]): Promise<void> {
  const ids = tickets.map((t) => t.id);
  if (ids.length) await prisma.addonTicket.deleteMany({ where: { guildId, id: { notIn: ids } } });
  else await prisma.addonTicket.deleteMany({ where: { guildId } });
  for (const t of tickets) {
    const row = ticketToRow(t);
    const { id, createdAt, guildId: _g, number, ...mutable } = row;
    void createdAt; void _g; void number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.addonTicket.upsert({ where: { id: id as string }, create: row as any, update: mutable as any });
  }
}

async function withAddonLock<T>(guildId: string, key: string, fn: () => Promise<T>): Promise<T> {
  const addonId = await getAddonDbId();
  const lockKey = `addonlock:${addonId}:${guildId}:${key}`;
  const token = randomUUID();
  const deadline = Date.now() + 3000;
  let acquired = false;
  for (;;) {
    const ok = await redis.set(lockKey, token, 'PX', 5000, 'NX').catch(() => null);
    if (ok === 'OK') { acquired = true; break; }
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, 40 + Math.floor(Math.random() * 40)));
  }
  try {
    return await fn();
  } finally {
    if (acquired) await redis.eval(RELEASE_LOCK, 1, lockKey, token).catch(() => undefined);
  }
}

interface PanelButton { id: string; label: string; emoji: string; color: string; categoryTag?: string; staffRoles?: string[]; fields?: PanelField[]; }
interface PanelField { id: string; label: string; placeholder?: string; required: boolean; style: 'short' | 'paragraph'; maxLength?: number; }
interface TicketPanel { id: string; name: string; description: string; emoji: string; channelId?: string; messageId?: string; categoryId?: string; logChannelId?: string; staffRoles: string[]; maxTicketsPerUser: number; namingPattern: string; closeAction: string; autoCloseHours: number; reopenWindowHours?: number; requireReason: boolean; welcomeMessage: string; buttonLabel: string; buttonColor: string; buttons?: PanelButton[]; panelStyle?: 'buttons' | 'dropdown'; fields?: PanelField[]; ticketMode?: 'channel' | 'thread'; embedColor?: string; embedAuthorName?: string; embedAuthorIconUrl?: string; embedThumbnailUrl?: string; embedImageUrl?: string; embedFooterText?: string; embedFooterIconUrl?: string; enabled: boolean; createdAt: string; }
interface TicketNote { id: string; authorId: string; authorTag: string; content: string; createdAt: string; }
interface Ticket { id: string; number: number; panelId: string; guildId: string; channelId: string; userId: string; username: string; status: string; priority: string; categoryTag?: string; claimedBy?: string; claimedByTag?: string; transferredTo?: string; transferredToTag?: string; reason?: string; tags: string[]; rating?: number; ratingFeedback?: string; ratingResolved?: boolean; closedBy?: string; closedByTag?: string; closedAt?: string; firstResponseAt?: string; notes: TicketNote[]; formResponses?: Record<string, string>; createdAt: string; lastActivity: string; nudgedAt?: string; reminderAt?: string; reminderBy?: string; reminderNote?: string; closeRequestedBy?: string; closeRequestedByTag?: string; closeRequestedAt?: string; aiTriage?: { summary: string; urgency: string; reply?: string; tag?: string; at: string }; }
interface SlaLevel { hours: number; pingRoleId?: string; message?: string; escalatePriority?: string; escalateRoleId?: string; }
interface BusinessHours { enabled: boolean; timezone: string; openTime: string; closeTime: string; days: number[]; awayMessage?: string; pauseSla?: boolean; }
interface GuildTicketConfig { blacklistedUsers: string[]; transcriptChannelId?: string; slaHours?: number; webhookUrl?: string; webhookSecret?: string; staffNotifyChannelId?: string; staffNotifyRoleId?: string; ratingWindowMinutes?: number; autoAssign?: boolean; roundRobinIndex?: number; slaLevels?: SlaLevel[]; autoTriage?: boolean; autoTriageSetPriority?: boolean; autoTriageTag?: boolean; nudgeBeforeCloseHours?: number; businessHours?: BusinessHours; showUserHistory?: boolean; lowRatingThreshold?: number; lowRatingAlertRoleId?: string; lowRatingAlertChannelId?: string; openCooldownMinutes?: number; minAccountAgeDays?: number; requiredOpenRoleId?: string; weeklyDigestChannelId?: string; }
interface CannedResponse { id: string; name: string; content: string; createdBy: string; createdByTag: string; createdAt: string; usageCount?: number; lastUsedAt?: string; }

const ADDON_NAME = 'tickets';
let _addonDbId: string | null = null;

async function getAddonDbId(): Promise<string> {
  if (_addonDbId) return _addonDbId;
  const addon = await prisma.addon.findUnique({ where: { name: ADDON_NAME }, select: { id: true } });
  if (!addon) throw new Error(`Addon '${ADDON_NAME}' is not registered. Start the bot first so it registers the addon.`);
  _addonDbId = addon.id;
  return addon.id;
}

async function readData<T>(guildId: string, key: string): Promise<T | null> {
  const addonId = await getAddonDbId();
  const row = await prisma.addonData.findUnique({
    where: { guildId_addonId_key: { guildId, addonId, key } },
  });
  return row ? (row.value as unknown as T) : null;
}

async function writeData<T>(guildId: string, key: string, value: T): Promise<void> {
  const addonId = await getAddonDbId();
  await prisma.addonData.upsert({
    where: { guildId_addonId_key: { guildId, addonId, key } },
    update: { value: value as object },
    create: { guildId, addonId, key, value: value as object },
  });
}

/**
 * Data API for the tickets addon — the dashboard reads/writes tickets, messages, panels, config and canned responses here (tickets/messages live in their own relational tables).
 *
 * Routes:
 *   GET    /addons/tickets/:guildId/panels
 *   POST   /addons/tickets/:guildId/panels
 *   PATCH  /addons/tickets/:guildId/panels/:panelId
 *   DELETE /addons/tickets/:guildId/panels/:panelId
 *   GET    /addons/tickets/:guildId/panels/:panelId/staff
 *   GET    /addons/tickets/:guildId/tickets
 *   GET    /addons/tickets/:guildId/tickets/:ticketId
 *   GET    /addons/tickets/:guildId/tickets/:ticketId/transcript
 *   DELETE /addons/tickets/:guildId/tickets/:ticketId
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/reopen
 *   POST   /addons/tickets/:guildId/tickets/bulk-close
 *   POST   /addons/tickets/:guildId/tickets/bulk-action
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/claim
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/unclaim
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/transfer
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/merge
 *   PATCH  /addons/tickets/:guildId/tickets/:ticketId/priority
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/tags
 *   DELETE /addons/tickets/:guildId/tickets/:ticketId/tags/:tag
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/reply
 *   POST   /addons/tickets/:guildId/tickets/:ticketId/notes
 *   GET    /addons/tickets/:guildId/stats
 *   GET    /addons/tickets/:guildId/stats/timeseries
 *   GET    /addons/tickets/:guildId/config
 *   GET    /addons/tickets/:guildId/tickets/export
 *   PATCH  /addons/tickets/:guildId/config
 *   GET    /addons/tickets/:guildId/canned-responses
 *   POST   /addons/tickets/:guildId/canned-responses
 *   PATCH  /addons/tickets/:guildId/canned-responses/:responseId
 *   DELETE /addons/tickets/:guildId/canned-responses/:responseId
 */
export async function ticketAddonRoutes(server: FastifyInstance): Promise<void> {

  server.get('/addons/tickets/:guildId/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    return reply.send({ success: true, data: panels });
  });

  // Members holding this panel's staff roles (panel-level + any per-button
  // overrides), for the dashboard's transfer picker — replaces having staff
  // type a raw user ID + tag by hand.
  server.get('/addons/tickets/:guildId/panels/:panelId/staff', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    if (!isSnowflake(guildId)) return reply.code(400).send({ success: false, error: 'Invalid guild ID' });
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return reply.code(404).send({ success: false, error: 'Panel not found' });

    const roleIds = new Set<string>(panel.staffRoles ?? []);
    for (const b of panel.buttons ?? []) for (const r of b.staffRoles ?? []) roleIds.add(r);
    if (roleIds.size === 0) return reply.send({ success: true, data: [] });

    try {
      const { default: axiosInstance } = await import('axios');
      const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}` };
      type DiscordMember = { user: { id: string; username: string; discriminator: string; global_name?: string; avatar?: string | null }; roles: string[] };
      const staff: { id: string; username: string; tag: string; avatar: string | null }[] = [];
      const seen = new Set<string>();
      let after = '0';
      // Discord has no "members by role" filter — page through the member
      // list (1000/page) and filter locally. Capped at 5 pages (5000
      // members scanned) so one huge guild can't make this route hang.
      for (let page = 0; page < 5; page++) {
        const res = await axiosInstance.get<DiscordMember[]>(`https://discord.com/api/v10/guilds/${guildId}/members`, {
          headers,
          params: { limit: 1000, after },
        });
        const members = res.data;
        if (members.length === 0) break;
        for (const m of members) {
          if (!seen.has(m.user.id) && m.roles.some((r) => roleIds.has(r))) {
            seen.add(m.user.id);
            const tag = m.user.discriminator && m.user.discriminator !== '0'
              ? `${m.user.username}#${m.user.discriminator}`
              : (m.user.global_name ?? m.user.username);
            staff.push({ id: m.user.id, username: m.user.username, tag, avatar: m.user.avatar ?? null });
          }
        }
        if (members.length < 1000) break;
        after = members[members.length - 1].user.id;
      }
      staff.sort((a, b) => a.tag.localeCompare(b.tag));
      return reply.send({ success: true, data: staff });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to fetch staff members' });
    }
  });

  server.post('/addons/tickets/:guildId/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as Partial<TicketPanel>;

    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: 'Panel name is required' });
    if (!body.description?.trim()) return reply.code(400).send({ success: false, error: 'Panel description is required' });

    return withAddonLock(guildId, 'panels', async () => {
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    if (panels.some((p) => p.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A panel with that name already exists' });
    }

    const panel: TicketPanel = {
      id: randomUUID(),
      name: body.name!.trim(),
      description: body.description!.trim(),
      emoji: body.emoji ?? '🎫',
      buttonLabel: body.buttonLabel ?? 'Open a Ticket',
      buttonColor: body.buttonColor ?? 'primary',
      buttons: body.buttons ?? [],
      panelStyle: body.panelStyle ?? 'buttons',
      categoryId: body.categoryId,
      logChannelId: body.logChannelId,
      staffRoles: body.staffRoles ?? [],
      maxTicketsPerUser: body.maxTicketsPerUser ?? 1,
      namingPattern: body.namingPattern ?? 'ticket-{number}',
      closeAction: body.closeAction ?? 'delete',
      autoCloseHours: body.autoCloseHours ?? 48,
      requireReason: body.requireReason ?? false,
      welcomeMessage: body.welcomeMessage ?? 'Welcome {user}! A staff member will be with you shortly.',
      embedColor: body.embedColor,
      embedAuthorName: body.embedAuthorName,
      embedAuthorIconUrl: body.embedAuthorIconUrl,
      embedThumbnailUrl: body.embedThumbnailUrl,
      embedImageUrl: body.embedImageUrl,
      embedFooterText: body.embedFooterText,
      embedFooterIconUrl: body.embedFooterIconUrl,
      enabled: body.enabled ?? true,
      createdAt: new Date().toISOString(),
    };

    panels.push(panel);
    await writeData(guildId, 'panels', panels);
    return reply.code(201).send({ success: true, data: panel });
    });
  });

  server.patch('/addons/tickets/:guildId/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const body = request.body as Partial<TicketPanel>;

    return withAddonLock(guildId, 'panels', async () => {
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const idx = panels.findIndex((p) => p.id === panelId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Panel not found' });

    if (body.name && panels.some((p) => p.id !== panelId && p.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A panel with that name already exists' });
    }

    const updated: TicketPanel = {
      ...panels[idx],
      ...body,
      id: panels[idx].id,
      createdAt: panels[idx].createdAt,
    };
    panels[idx] = updated;
    await writeData(guildId, 'panels', panels);

    pub.publish('ticket:panel:updated', JSON.stringify({ guildId, panelId })).catch(() => null);

    return reply.send({ success: true, data: updated });
    });
  });

  server.delete('/addons/tickets/:guildId/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };

    return withAddonLock(guildId, 'panels', async () => {
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const filtered = panels.filter((p) => p.id !== panelId);
    if (filtered.length === panels.length) return reply.code(404).send({ success: false, error: 'Panel not found' });

    await writeData(guildId, 'panels', filtered);
    return reply.send({ success: true });
    });
  });

  server.get('/addons/tickets/:guildId/tickets', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { status, priority, panel: panelId, search, page = '1', limit = '25' } = request.query as Record<string, string>;

    let tickets = await readTickets(guildId);

    if (status)  tickets = tickets.filter((t) => t.status === status);
    if (priority) tickets = tickets.filter((t) => t.priority === priority);
    if (panelId) tickets = tickets.filter((t) => t.panelId === panelId);
    if (search) {
      const q = search.toLowerCase();
      const fieldMatch = (t: Ticket) =>
        t.username.toLowerCase().includes(q) ||
        String(t.number).includes(q) ||
        t.tags.some((tag) => tag.includes(q)) ||
        (t.categoryTag ?? '').toLowerCase().includes(q);

      // Also search message content, not just ticket-level fields — a
      // guild-scoped IN-list query (channelIds already filtered to this
      // guild's tickets above), no index on content so this is a scan,
      // acceptable at ticket-feature data volumes.
      const channelIds = tickets.map((t) => t.channelId);
      const contentMatches = channelIds.length
        ? await prisma.addonTicketMessage.findMany({
            where: { channelId: { in: channelIds }, content: { contains: search, mode: 'insensitive' } },
            select: { channelId: true },
            distinct: ['channelId'],
          })
        : [];
      const contentMatchChannels = new Set(contentMatches.map((m) => m.channelId));

      tickets = tickets.filter((t) => fieldMatch(t) || contentMatchChannels.has(t.channelId));
    }

    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total    = tickets.length;
    const data     = tickets.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return reply.send({ success: true, data, meta: { total, page: pageNum, limit: limitNum } });
  });

  server.get('/addons/tickets/:guildId/tickets/:ticketId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = await readTickets(guildId);
    const ticket  = tickets.find((t) => t.id === ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    const messages = await readMessages(ticket.channelId);

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const panel  = panels.find((p) => p.id === ticket.panelId) ?? null;

    return reply.send({ success: true, data: { ticket, messages, panel } });
  });

  server.get('/addons/tickets/:guildId/tickets/:ticketId/transcript', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { format } = request.query as { format?: string };

    const tickets = await readTickets(guildId);
    const ticket  = tickets.find((t) => t.id === ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    const messages = await readMessages(ticket.channelId);

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const panel  = panels.find((p) => p.id === ticket.panelId);
    if (!panel) return reply.code(404).send({ success: false, error: 'Panel not found' });

    const base = `ticket-${ticket.number}-${guildId}`;

    if (format === 'json') {
      const json = buildTicketTranscriptJson(ticket, panel, messages, true);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${base}.json"`);
      return reply.send(json);
    }

    if (format === 'txt') {
      const text = buildTicketTranscriptText(ticket, panel, messages, true);
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${base}.txt"`);
      return reply.send(text);
    }

    const html = buildTicketTranscriptHtml(ticket, panel, messages, { includeNotes: true });
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${base}.html"`);
    return reply.send(html);
  });

  server.delete('/addons/tickets/:guildId/tickets/:ticketId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = await readTickets(guildId);
    const filtered = tickets.filter((t) => t.id !== ticketId);
    if (filtered.length === tickets.length) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    await writeTickets(guildId, filtered);
    return reply.send({ success: true });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/reopen', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = await readTickets(guildId);
    const idx = tickets.findIndex((t) => t.id === ticketId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    const ticket = tickets[idx];
    if (ticket.status !== 'closed') return reply.code(400).send({ success: false, error: 'Ticket is not closed' });

    tickets[idx] = {
      ...ticket,
      status: 'open',
      closedAt: undefined,
      closedBy: undefined,
      closedByTag: undefined,
      lastActivity: new Date().toISOString(),
    };
    await writeTickets(guildId, tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/bulk-close', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { idleHours = 72 } = (request.body as { idleHours?: number }) ?? {};

    const tickets = await readTickets(guildId);
    const thresholdMs = idleHours * 60 * 60 * 1000;
    const now = Date.now();
    let closedCount = 0;

    const updated = tickets.map((t) => {
      if (t.status === 'closed') return t;
      const idleMs = now - new Date(t.lastActivity).getTime();
      if (idleMs >= thresholdMs) {
        closedCount++;
        return {
          ...t,
          status: 'closed' as const,
          closedAt: new Date().toISOString(),
          closedBy: 'portal',
          closedByTag: 'Staff Portal',
          lastActivity: new Date().toISOString(),
        };
      }
      return t;
    });

    await writeTickets(guildId, updated);
    return reply.send({ success: true, data: { closedCount } });
  });

  const BULK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

  // One endpoint for every selection-based bulk action (vs. bulk-close's
  // idle-time selection above) so the ticket list's multi-select toolbar
  // has a single place to grow into as more bulk actions get added.
  server.post('/addons/tickets/:guildId/tickets/bulk-action', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as { ticketIds?: string[]; action?: 'close' | 'tag' | 'priority'; tag?: string; priority?: string };

    const ids = new Set((body.ticketIds ?? []).filter((id) => typeof id === 'string'));
    if (ids.size === 0) return reply.code(400).send({ success: false, error: 'No tickets selected' });
    if (body.action === 'tag' && !body.tag?.trim()) return reply.code(400).send({ success: false, error: 'A tag is required' });
    if (body.action === 'priority' && !BULK_PRIORITIES.has(body.priority ?? '')) return reply.code(400).send({ success: false, error: 'Invalid priority' });

    const tickets = await readTickets(guildId);
    let affected = 0;
    const tag = body.tag?.trim().toLowerCase().slice(0, 32);

    const updated = tickets.map((t) => {
      if (!ids.has(t.id)) return t;

      if (body.action === 'close') {
        if (t.status === 'closed') return t;
        affected++;
        return {
          ...t,
          status: 'closed' as const,
          closedAt: new Date().toISOString(),
          closedBy: 'portal',
          closedByTag: 'Staff Portal',
          lastActivity: new Date().toISOString(),
        };
      }

      if (body.action === 'tag' && tag) {
        if (t.tags.includes(tag)) return t;
        affected++;
        return { ...t, tags: [...t.tags, tag] };
      }

      if (body.action === 'priority' && body.priority) {
        if (t.priority === body.priority) return t;
        affected++;
        return { ...t, priority: body.priority as Ticket['priority'] };
      }

      return t;
    });

    await writeTickets(guildId, updated);
    return reply.send({ success: true, data: { affected } });
  });

  async function findTicket(guildId: string, ticketId: string) {
    const tickets = await readTickets(guildId);
    const idx = tickets.findIndex((t) => t.id === ticketId);
    return { tickets, idx, ticket: tickets[idx] as Ticket | undefined };
  }

  server.post('/addons/tickets/:guildId/tickets/:ticketId/claim', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { userId = 'portal', userTag = 'Staff Portal' } = (request.body as { userId?: string; userTag?: string }) ?? {};
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });
    tickets[idx] = { ...ticket, claimedBy: userId, claimedByTag: userTag, status: 'claimed', lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/unclaim', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });
    tickets[idx] = { ...ticket, claimedBy: undefined, claimedByTag: undefined, status: 'open', lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/transfer', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { userId, userTag } = (request.body as { userId: string; userTag: string });
    if (!userId || !userTag) return reply.code(400).send({ success: false, error: 'userId and userTag are required' });
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });
    tickets[idx] = { ...ticket, transferredTo: userId, transferredToTag: userTag, claimedBy: userId, claimedByTag: userTag, status: 'claimed', lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  // Merges a duplicate ticket's history into this one (the survivor), then
  // tells the bot to close the duplicate the normal way (close embed,
  // transcript DM, channel archive/delete) — the API only does the data
  // side (message/tag/note merge), since it has no Discord connection of
  // its own to post into channels or manage them.
  server.post('/addons/tickets/:guildId/tickets/:ticketId/merge', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { sourceTicketNumber } = (request.body as { sourceTicketNumber?: number }) ?? {};
    if (!sourceTicketNumber || !Number.isInteger(sourceTicketNumber)) {
      return reply.code(400).send({ success: false, error: 'sourceTicketNumber is required' });
    }

    const { tickets, idx: targetIdx, ticket: target } = await findTicket(guildId, ticketId);
    if (!target) return reply.code(404).send({ success: false, error: 'Target ticket not found' });
    if (target.status === 'closed') return reply.code(400).send({ success: false, error: 'Target ticket is closed' });

    const sourceIdx = tickets.findIndex((t) => t.number === sourceTicketNumber);
    const source = tickets[sourceIdx];
    if (!source) return reply.code(404).send({ success: false, error: `No ticket #${sourceTicketNumber} in this server` });
    if (source.id === target.id) return reply.code(400).send({ success: false, error: 'Cannot merge a ticket into itself' });
    if (source.status === 'closed') return reply.code(400).send({ success: false, error: `Ticket #${sourceTicketNumber} is already closed` });

    // Move the source's message history into the target's channel, with a
    // marker so it's clear in the transcript where the merge happened.
    const moved = await prisma.addonTicketMessage.updateMany({ where: { channelId: source.channelId }, data: { channelId: target.channelId } });
    await prisma.addonTicketMessage.create({
      data: {
        channelId: target.channelId,
        authorId: 'system',
        authorTag: 'System',
        content: `— Ticket #${source.number} was merged into this ticket —`,
        attachments: [],
        timestamp: new Date(),
      },
    });

    const mergedTags = [...new Set([...target.tags, ...source.tags])];
    const mergedNotes = [...target.notes, ...source.notes];
    tickets[targetIdx] = { ...target, tags: mergedTags, notes: mergedNotes, lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);

    pub.publish('ticket:merge', JSON.stringify({
      guildId, sourceChannelId: source.channelId, targetChannelId: target.channelId, targetNumber: target.number,
    })).catch(() => null);

    return reply.send({ success: true, data: { mergedMessageCount: moved.count, targetTicket: tickets[targetIdx] } });
  });

  server.patch('/addons/tickets/:guildId/tickets/:ticketId/priority', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { priority } = (request.body as { priority: string });
    const valid = ['low', 'medium', 'high', 'urgent'];
    if (!valid.includes(priority)) return reply.code(400).send({ success: false, error: 'Invalid priority' });
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    tickets[idx] = { ...ticket, priority, lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);
    pub.publish('ticket:priority:updated', JSON.stringify({ guildId, channelId: ticket.channelId, ticketId, priority })).catch(() => null);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/tags', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { tag } = (request.body as { tag: string });
    if (!tag?.trim()) return reply.code(400).send({ success: false, error: 'Tag is required' });
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    const trimmed = tag.trim().toLowerCase();
    if (!ticket.tags.includes(trimmed)) {
      tickets[idx] = { ...ticket, tags: [...ticket.tags, trimmed], lastActivity: new Date().toISOString() };
      await writeTickets(guildId, tickets);
    }
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.delete('/addons/tickets/:guildId/tickets/:ticketId/tags/:tag', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId, tag } = request.params as { guildId: string; ticketId: string; tag: string };
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    tickets[idx] = { ...ticket, tags: ticket.tags.filter((t) => t !== tag), lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/reply', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { content, authorTag = 'Staff Portal' } = (request.body as { content: string; authorTag?: string });
    if (!content?.trim()) return reply.code(400).send({ success: false, error: 'Message content is required' });
    const { ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });

    pub.publish('ticket:reply', JSON.stringify({ guildId, channelId: ticket.channelId, content: content.trim(), authorTag })).catch(() => null);
    return reply.send({ success: true });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/notes', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { content, authorTag = 'Staff Portal' } = (request.body as { content: string; authorTag?: string });
    if (!content?.trim()) return reply.code(400).send({ success: false, error: 'Note content is required' });
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    const note: TicketNote = { id: randomUUID(), authorId: 'portal', authorTag, content: content.trim(), createdAt: new Date().toISOString() };
    tickets[idx] = { ...ticket, notes: [...ticket.notes, note], lastActivity: new Date().toISOString() };
    await writeTickets(guildId, tickets);

    pub.publish('ticket:note:added', JSON.stringify({ guildId, channelId: ticket.channelId, note })).catch(() => null);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.get('/addons/tickets/:guildId/stats', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const [tickets, panels, config] = await Promise.all([
      readTickets(guildId),
      readData<TicketPanel[]>(guildId, 'panels').then((r) => r ?? []),
      readData<GuildTicketConfig>(guildId, 'config').then((r) => r ?? { blacklistedUsers: [] }),
    ]);

    const open    = tickets.filter((t) => t.status === 'open').length;
    const claimed = tickets.filter((t) => t.status === 'claimed').length;
    const closed  = tickets.filter((t) => t.status === 'closed').length;
    const waiting = tickets.filter((t) => t.status === 'waiting').length;

    const rated     = tickets.filter((t) => t.rating !== undefined);
    const avgRating = rated.length > 0
      ? rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length
      : null;

    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const t of rated) { ratingDistribution[t.rating!] = (ratingDistribution[t.rating!] ?? 0) + 1; }

    const withResolvedAnswer = tickets.filter((t) => t.ratingResolved !== undefined);
    const resolvedRate = withResolvedAnswer.length > 0
      ? withResolvedAnswer.filter((t) => t.ratingResolved).length / withResolvedAnswer.length
      : null;

    const since7d        = Date.now() - 7 * 24 * 3600 * 1000;
    const recentlyClosed = tickets.filter((t) => t.closedAt && new Date(t.closedAt).getTime() > since7d).length;

    const responded = tickets.filter((t) => t.firstResponseAt);
    const avgResponseMinutes = responded.length > 0
      ? responded.reduce((s, t) => {
          const diffMs = new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime();
          return s + diffMs / 60000;
        }, 0) / responded.length
      : null;

    const closedWithTime = tickets.filter((t) => t.closedAt);
    const avgCloseMinutes = closedWithTime.length > 0
      ? closedWithTime.reduce((s, t) => {
          const diffMs = new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime();
          return s + diffMs / 60000;
        }, 0) / closedWithTime.length
      : null;

    const now = Date.now();
    const slaBreaches = tickets.filter((t) => computeSlaBreach(t, config, now)).length;

    const byPanel = panels.map((p) => {
      const pTickets = tickets.filter((t) => t.panelId === p.id);
      const pRated = pTickets.filter((t) => t.rating !== undefined);
      const pClosed = pTickets.filter((t) => t.closedAt);
      return {
        panelId:         p.id,
        panelName:       p.name,
        emoji:           p.emoji,
        total:           pTickets.length,
        open:            pTickets.filter((t) => t.status !== 'closed').length,
        avgRating:       pRated.length > 0 ? pRated.reduce((s, t) => s + (t.rating ?? 0), 0) / pRated.length : null,
        avgCloseMinutes: pClosed.length > 0
          ? pClosed.reduce((s, t) => s + (new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime()) / 60000, 0) / pClosed.length
          : null,
      };
    });

    const slaTracked = slaThresholdHours(config) !== null;
    const staffAgg = new Map<string, { id: string; tag: string; handled: number; closed: number; ratingSum: number; ratingCount: number; closeSum: number; closeCount: number; slaMissed: number }>();
    for (const tk of tickets) {
      const id = tk.claimedBy ?? tk.closedBy;
      if (!id) continue;
      const tag = tk.claimedByTag ?? tk.closedByTag ?? id;
      const a = staffAgg.get(id) ?? { id, tag, handled: 0, closed: 0, ratingSum: 0, ratingCount: 0, closeSum: 0, closeCount: 0, slaMissed: 0 };
      a.tag = tag;
      a.handled++;
      if (tk.closedAt) { a.closed++; a.closeSum += (new Date(tk.closedAt).getTime() - new Date(tk.createdAt).getTime()) / 60000; a.closeCount++; }
      if (typeof tk.rating === 'number') { a.ratingSum += tk.rating; a.ratingCount++; }
      if (slaTracked && computeSlaMissed(tk, config, now)) a.slaMissed++;
      staffAgg.set(id, a);
    }
    const byStaff = [...staffAgg.values()]
      .map((a) => ({
        staffId: a.id,
        tag: a.tag,
        handled: a.handled,
        closed: a.closed,
        avgRating: a.ratingCount ? a.ratingSum / a.ratingCount : null,
        avgCloseMinutes: a.closeCount ? a.closeSum / a.closeCount : null,
        slaMissRate: slaTracked ? a.slaMissed / a.handled : null,
      }))
      .sort((x, y) => y.handled - x.handled)
      .slice(0, 25);

    return reply.send({
      success: true,
      data: {
        total: tickets.length,
        open,
        claimed,
        closed,
        waiting,
        avgRating,
        resolvedRate,
        avgResponseMinutes,
        avgCloseMinutes,
        ratingDistribution,
        slaBreaches,
        recentlyClosed,
        panels: panels.length,
        blacklistedUsers: config.blacklistedUsers.length,
        byPanel,
        byStaff,
      },
    });
  });

  server.get('/addons/tickets/:guildId/stats/timeseries', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { days = '30' } = request.query as Record<string, string>;
    const daysNum = Math.min(365, Math.max(7, parseInt(days, 10)));

    const tickets = await readTickets(guildId);

    const now    = new Date();
    const result: { date: string; opened: number; closed: number }[] = [];

    for (let i = daysNum - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({ date: dateStr, opened: 0, closed: 0 });
    }

    const index = new Map(result.map((r, i) => [r.date, i]));

    for (const t of tickets) {
      const openDate   = t.createdAt.slice(0, 10);
      const closeDate  = t.closedAt?.slice(0, 10);
      const openIdx    = index.get(openDate);
      if (openIdx !== undefined) result[openIdx].opened++;
      if (closeDate) {
        const closeIdx = index.get(closeDate);
        if (closeIdx !== undefined) result[closeIdx].closed++;
      }
    }

    return reply.send({ success: true, data: result });
  });

  server.get('/addons/tickets/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = (await readData<GuildTicketConfig>(guildId, 'config')) ?? { blacklistedUsers: [] };
    return reply.send({ success: true, data: config });
  });

  server.get('/addons/tickets/:guildId/tickets/export', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const [tickets, panels] = await Promise.all([
      readTickets(guildId),
      readData<TicketPanel[]>(guildId, 'panels').then((r) => r ?? []),
    ]);
    const panelName = (id: string) => panels.find((p) => p.id === id)?.name ?? '';
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['number', 'status', 'priority', 'panel', 'category', 'opener', 'opener_id', 'claimed_by', 'closed_by', 'rating', 'feedback', 'created_at', 'closed_at'];
    const rows = [...tickets]
      .sort((a, b) => a.number - b.number)
      .map((t) => [t.number, t.status, t.priority, panelName(t.panelId), t.categoryTag ?? '', t.username, t.userId, t.claimedByTag ?? '', t.closedByTag ?? '', t.rating ?? '', t.ratingFeedback ?? '', t.createdAt, t.closedAt ?? ''].map(esc).join(','));
    const csv = [header.join(','), ...rows].join('\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="tickets-${guildId}.csv"`);
    return reply.send(csv);
  });

  server.patch('/addons/tickets/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as Partial<GuildTicketConfig>;
    const config = (await readData<GuildTicketConfig>(guildId, 'config')) ?? { blacklistedUsers: [] };
    const updated = { ...config, ...body };
    // A webhook URL is only useful to a receiver that can verify the
    // payload actually came from us — generate a signing secret the first
    // time a URL is set, rather than requiring a separate step.
    if (updated.webhookUrl && !updated.webhookSecret) {
      updated.webhookSecret = randomBytes(24).toString('hex');
    }
    await writeData(guildId, 'config', updated);
    return reply.send({ success: true, data: updated });
  });

  server.get('/addons/tickets/:guildId/canned-responses', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    return reply.send({ success: true, data: responses });
  });

  server.post('/addons/tickets/:guildId/canned-responses', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as Partial<CannedResponse>;

    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: 'Name is required' });
    if (!body.content?.trim()) return reply.code(400).send({ success: false, error: 'Content is required' });

    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    if (responses.some((r) => r.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A canned response with that name already exists' });
    }

    const response: CannedResponse = {
      id: randomUUID(),
      name: body.name.trim(),
      content: body.content.trim(),
      createdBy: body.createdBy ?? '',
      createdByTag: body.createdByTag ?? '',
      createdAt: new Date().toISOString(),
    };

    responses.push(response);
    await writeData(guildId, 'canned-responses', responses);
    return reply.code(201).send({ success: true, data: response });
  });

  server.patch('/addons/tickets/:guildId/canned-responses/:responseId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, responseId } = request.params as { guildId: string; responseId: string };
    const body = request.body as Partial<CannedResponse>;

    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    const idx = responses.findIndex((r) => r.id === responseId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Canned response not found' });

    responses[idx] = { ...responses[idx], ...body, id: responses[idx].id, createdAt: responses[idx].createdAt };
    await writeData(guildId, 'canned-responses', responses);
    return reply.send({ success: true, data: responses[idx] });
  });

  server.delete('/addons/tickets/:guildId/canned-responses/:responseId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, responseId } = request.params as { guildId: string; responseId: string };

    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    const filtered = responses.filter((r) => r.id !== responseId);
    if (filtered.length === responses.length) return reply.code(404).send({ success: false, error: 'Canned response not found' });

    await writeData(guildId, 'canned-responses', filtered);
    return reply.send({ success: true });
  });
}
