/**
 * REST routes for the Ticket System addon. All ticket and panel data is stored
 * in the generic `AddonData` table keyed by the addon's database CUID, which is
 * resolved by name at runtime and cached in-process.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';
import { pub } from '../redis.js';

// ─── Local type definitions ────────────────────────────────────────────────────
// These mirror the types in addons/tickets/src/types.ts. Keep them in sync when
// the addon's data schema changes.

interface PanelButton { id: string; label: string; emoji: string; color: string; categoryTag?: string; staffRoles?: string[]; }
interface PanelField { id: string; label: string; placeholder?: string; required: boolean; style: 'short' | 'paragraph'; maxLength?: number; }
interface TicketPanel { id: string; name: string; description: string; emoji: string; channelId?: string; messageId?: string; categoryId?: string; logChannelId?: string; staffRoles: string[]; maxTicketsPerUser: number; namingPattern: string; closeAction: string; autoCloseHours: number; requireReason: boolean; welcomeMessage: string; buttonLabel: string; buttonColor: string; buttons?: PanelButton[]; fields?: PanelField[]; ticketMode?: 'channel' | 'thread'; embedColor?: string; embedAuthorName?: string; embedAuthorIconUrl?: string; embedThumbnailUrl?: string; embedImageUrl?: string; embedFooterText?: string; embedFooterIconUrl?: string; enabled: boolean; createdAt: string; }
interface TicketNote { id: string; authorId: string; authorTag: string; content: string; createdAt: string; }
interface Ticket { id: string; number: number; panelId: string; guildId: string; channelId: string; userId: string; username: string; status: string; priority: string; categoryTag?: string; claimedBy?: string; claimedByTag?: string; transferredTo?: string; transferredToTag?: string; reason?: string; tags: string[]; rating?: number; ratingFeedback?: string; closedBy?: string; closedByTag?: string; closedAt?: string; firstResponseAt?: string; notes: TicketNote[]; formResponses?: Record<string, string>; createdAt: string; lastActivity: string; }
interface SlaLevel { hours: number; pingRoleId?: string; message?: string; }
interface GuildTicketConfig { blacklistedUsers: string[]; transcriptChannelId?: string; slaHours?: number; webhookUrl?: string; staffNotifyChannelId?: string; staffNotifyRoleId?: string; ratingWindowMinutes?: number; autoAssign?: boolean; roundRobinIndex?: number; slaLevels?: SlaLevel[]; }
interface CannedResponse { id: string; name: string; content: string; createdBy: string; createdByTag: string; createdAt: string; }

// ─── AddonData helpers ────────────────────────────────────────────────────────
// AddonData rows are keyed by the Addon.id CUID (not the addon name). We resolve
// the CUID once and cache it for the lifetime of the process to avoid per-request
// database lookups.

const ADDON_NAME = 'tickets';
let _addonDbId: string | null = null;

/**
 * Returns the database CUID for the tickets addon, resolving it from the
 * database on first call and caching it thereafter.
 * @throws If the addon has not been registered by the bot.
 */
async function getAddonDbId(): Promise<string> {
  if (_addonDbId) return _addonDbId;
  const addon = await prisma.addon.findUnique({ where: { name: ADDON_NAME }, select: { id: true } });
  if (!addon) throw new Error(`Addon '${ADDON_NAME}' is not registered. Start the bot first so it registers the addon.`);
  _addonDbId = addon.id;
  return addon.id;
}

/**
 * Reads a typed value from `AddonData` for the given guild and key.
 * Returns `null` if no row exists.
 */
async function readData<T>(guildId: string, key: string): Promise<T | null> {
  const addonId = await getAddonDbId();
  const row = await prisma.addonData.findUnique({
    where: { guildId_addonId_key: { guildId, addonId, key } },
  });
  return row ? (row.value as unknown as T) : null;
}

/**
 * Upserts a typed value into `AddonData` for the given guild and key.
 */
async function writeData<T>(guildId: string, key: string, value: T): Promise<void> {
  const addonId = await getAddonDbId();
  await prisma.addonData.upsert({
    where: { guildId_addonId_key: { guildId, addonId, key } },
    update: { value: value as object },
    create: { guildId, addonId, key, value: value as object },
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Registers all ticket addon routes.
 *
 * Panel management:  GET/POST/PATCH/DELETE /addons/tickets/:guildId/panels
 * Ticket listing:    GET /addons/tickets/:guildId/tickets (with filtering/pagination)
 * Ticket detail:     GET /addons/tickets/:guildId/tickets/:ticketId
 * Ticket actions:    POST/DELETE claim, unclaim, transfer, reopen, bulk-close, reply, notes, tags
 * Statistics:        GET /addons/tickets/:guildId/stats
 * Time-series:       GET /addons/tickets/:guildId/stats/timeseries
 * Config:            GET/PATCH /addons/tickets/:guildId/config
 * Canned responses:  GET/POST/PATCH/DELETE /addons/tickets/:guildId/canned-responses
 */
export async function ticketAddonRoutes(server: FastifyInstance): Promise<void> {

  // ── Panels (read) ─────────────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    return reply.send({ success: true, data: panels });
  });

  // ── Panels (create) ───────────────────────────────────────────────────────

  server.post('/addons/tickets/:guildId/panels', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as Partial<TicketPanel>;

    if (!body.name?.trim()) return reply.code(400).send({ success: false, error: 'Panel name is required' });
    if (!body.description?.trim()) return reply.code(400).send({ success: false, error: 'Panel description is required' });

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    if (panels.some((p) => p.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A panel with that name already exists' });
    }

    const panel: TicketPanel = {
      id: randomUUID(),
      name: body.name.trim(),
      description: body.description.trim(),
      emoji: body.emoji ?? '🎫',
      buttonLabel: body.buttonLabel ?? 'Open a Ticket',
      buttonColor: body.buttonColor ?? 'primary',
      buttons: body.buttons ?? [],
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

  // ── Panels (update) ───────────────────────────────────────────────────────

  server.patch('/addons/tickets/:guildId/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };
    const body = request.body as Partial<TicketPanel>;

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const idx = panels.findIndex((p) => p.id === panelId);
    if (idx < 0) return reply.code(404).send({ success: false, error: 'Panel not found' });

    if (body.name && panels.some((p) => p.id !== panelId && p.name.toLowerCase() === body.name!.toLowerCase())) {
      return reply.code(409).send({ success: false, error: 'A panel with that name already exists' });
    }

    // Preserve immutable fields — never allow the client to overwrite id or createdAt.
    const updated: TicketPanel = {
      ...panels[idx],
      ...body,
      id: panels[idx].id,
      createdAt: panels[idx].createdAt,
    };
    panels[idx] = updated;
    await writeData(guildId, 'panels', panels);

    // Notify the bot to re-render the Discord panel message with the new configuration.
    pub.publish('ticket:panel:updated', JSON.stringify({ guildId, panelId })).catch(() => null);

    return reply.send({ success: true, data: updated });
  });

  // ── Panels (delete) ───────────────────────────────────────────────────────

  server.delete('/addons/tickets/:guildId/panels/:panelId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, panelId } = request.params as { guildId: string; panelId: string };

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const filtered = panels.filter((p) => p.id !== panelId);
    if (filtered.length === panels.length) return reply.code(404).send({ success: false, error: 'Panel not found' });

    await writeData(guildId, 'panels', filtered);
    return reply.send({ success: true });
  });

  // ── Tickets (list) ────────────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/tickets', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { status, priority, panel: panelId, search, page = '1', limit = '25' } = request.query as Record<string, string>;

    let tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];

    if (status)  tickets = tickets.filter((t) => t.status === status);
    if (priority) tickets = tickets.filter((t) => t.priority === priority);
    if (panelId) tickets = tickets.filter((t) => t.panelId === panelId);
    if (search) {
      const q = search.toLowerCase();
      tickets = tickets.filter(
        (t) =>
          t.username.toLowerCase().includes(q) ||
          String(t.number).includes(q) ||
          t.tags.some((tag) => tag.includes(q)) ||
          (t.categoryTag ?? '').toLowerCase().includes(q),
      );
    }

    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const total    = tickets.length;
    const data     = tickets.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return reply.send({ success: true, data, meta: { total, page: pageNum, limit: limitNum } });
  });

  // ── Tickets (single) ──────────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/tickets/:ticketId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
    const ticket  = tickets.find((t) => t.id === ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    // Transcript messages are stored globally (guildId = null) keyed by channel ID
    // because they belong to the channel rather than to the guild.
    const addonId = await getAddonDbId();
    const msgsRow = await prisma.addonData.findFirst({
      where: { guildId: null, addonId, key: `msgs:${ticket.channelId}` },
    });
    const messages = msgsRow ? (msgsRow.value as unknown as unknown[]) : [];

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const panel  = panels.find((p) => p.id === ticket.panelId) ?? null;

    return reply.send({ success: true, data: { ticket, messages, panel } });
  });

  // ── Tickets (transcript export) ───────────────────────────────────────────

  server.get('/addons/tickets/:guildId/tickets/:ticketId/transcript', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
    const ticket  = tickets.find((t) => t.id === ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    const addonId = await getAddonDbId();
    const msgsRow = await prisma.addonData.findFirst({
      where: { guildId: null, addonId, key: `msgs:${ticket.channelId}` },
    });
    const messages = (msgsRow ? (msgsRow.value as unknown as { authorTag: string; content: string; attachments: string[]; timestamp: string }[]) : []);

    const panels = (await readData<TicketPanel[]>(guildId, 'panels')) ?? [];
    const panel  = panels.find((p) => p.id === ticket.panelId);

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const messagesHtml = messages.length === 0
      ? '<p class="empty">No messages recorded.</p>'
      : messages.map((m) => {
          const time = new Date(m.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
          const avatar = esc(m.authorTag[0]?.toUpperCase() ?? '?');
          const attachmentsHtml = (m.attachments ?? []).map((url) => {
            const isImg = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
            return isImg
              ? `<a href="${esc(url)}" target="_blank"><img src="${esc(url)}" class="attachment-img" /></a>`
              : `<a href="${esc(url)}" class="attachment-link" target="_blank">📎 ${esc(url.split('/').pop() ?? url)}</a>`;
          }).join('');
          return `
    <div class="message">
      <div class="avatar">${avatar}</div>
      <div class="body">
        <div class="meta"><span class="author">${esc(m.authorTag)}</span><span class="time">${esc(time)}</span></div>
        ${m.content ? `<p class="content">${esc(m.content).replace(/\n/g, '<br>')}</p>` : ''}
        ${attachmentsHtml}
      </div>
    </div>`;
        }).join('\n');

    const notesHtml = ticket.notes.length === 0 ? '' : `
  <section class="notes-section">
    <h2>🔒 Staff Notes</h2>
    ${ticket.notes.map((n) => `
    <div class="note">
      <div class="meta"><span class="author">${esc(n.authorTag)}</span><span class="time">${esc(new Date(n.createdAt).toLocaleString())}</span></div>
      <p>${esc(n.content).replace(/\n/g, '<br>')}</p>
    </div>`).join('')}
  </section>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ticket #${ticket.number} Transcript</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e1f22; color: #dcddde; line-height: 1.5; }
    .header { background: #2b2d31; border-bottom: 1px solid #ffffff10; padding: 20px 32px; display: flex; align-items: center; gap: 16px; }
    .header h1 { font-size: 1.25rem; font-weight: 700; color: #fff; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
    .badge-open { background: #3ba55c30; color: #3ba55c; }
    .badge-closed { background: #72767d30; color: #b9bbbe; }
    .badge-claimed { background: #5865f230; color: #7289da; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; background: #2b2d31; padding: 16px 32px; border-bottom: 1px solid #ffffff10; }
    .meta-cell p { font-size: 0.7rem; color: #72767d; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .05em; }
    .meta-cell span { font-size: 0.85rem; color: #dcddde; }
    .transcript { padding: 24px 32px; max-width: 860px; }
    .transcript h2 { font-size: 0.8rem; font-weight: 600; color: #72767d; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #ffffff10; }
    .message { display: flex; gap: 12px; padding: 6px 0; }
    .message:hover { background: #ffffff04; border-radius: 4px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: #5865f2; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: #fff; flex-shrink: 0; margin-top: 2px; }
    .body { flex: 1; min-width: 0; }
    .meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
    .author { font-weight: 600; color: #fff; font-size: 0.9rem; }
    .time { font-size: 0.7rem; color: #72767d; }
    .content { font-size: 0.9rem; white-space: pre-wrap; word-break: break-word; }
    .attachment-img { max-height: 200px; border-radius: 4px; margin-top: 6px; display: block; }
    .attachment-link { display: block; margin-top: 4px; color: #5865f2; font-size: 0.85rem; text-decoration: none; }
    .attachment-link:hover { text-decoration: underline; }
    .empty { color: #72767d; font-style: italic; font-size: 0.875rem; }
    .notes-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid #ffffff10; }
    .notes-section h2 { font-size: 0.8rem; font-weight: 600; color: #72767d; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 12px; }
    .note { background: #2b2d31; border-radius: 6px; padding: 12px; margin-bottom: 8px; }
    .note .meta { margin-bottom: 4px; }
    .note p { font-size: 0.875rem; }
    .footer { text-align: center; padding: 24px; color: #72767d; font-size: 0.75rem; border-top: 1px solid #ffffff10; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${panel ? `${esc(panel.emoji)} ` : ''}Ticket #${ticket.number}</h1>
      <span class="badge badge-${ticket.status}">${ticket.status}</span>
      ${panel ? `<span style="margin-left:8px;font-size:.8rem;color:#72767d;">${esc(panel.name)}</span>` : ''}
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-cell"><p>Opened by</p><span>${esc(ticket.username)}</span></div>
    <div class="meta-cell"><p>Created</p><span>${esc(new Date(ticket.createdAt).toLocaleString())}</span></div>
    ${ticket.closedAt ? `<div class="meta-cell"><p>Closed</p><span>${esc(new Date(ticket.closedAt).toLocaleString())}</span></div>` : ''}
    ${ticket.closedByTag ? `<div class="meta-cell"><p>Closed by</p><span>${esc(ticket.closedByTag)}</span></div>` : ''}
    ${ticket.claimedByTag ? `<div class="meta-cell"><p>Claimed by</p><span>${esc(ticket.claimedByTag)}</span></div>` : ''}
    <div class="meta-cell"><p>Priority</p><span>${esc(ticket.priority)}</span></div>
    ${ticket.rating !== undefined ? `<div class="meta-cell"><p>Rating</p><span>${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)</span></div>` : ''}
    ${ticket.ratingFeedback ? `<div class="meta-cell" style="grid-column:1/-1"><p>Rating Feedback</p><span>${esc(ticket.ratingFeedback)}</span></div>` : ''}
    ${ticket.reason ? `<div class="meta-cell" style="grid-column:1/-1"><p>Reason</p><span>${esc(ticket.reason)}</span></div>` : ''}
  </div>
  <div class="transcript">
    <h2>Messages (${messages.length})</h2>
    ${messagesHtml}
    ${notesHtml}
  </div>
  <div class="footer">Generated by ArkenBot · ${new Date().toUTCString()}</div>
</body>
</html>`;

    const filename = `ticket-${ticket.number}-${guildId}.html`;
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(html);
  });

  // ── Tickets (delete) ──────────────────────────────────────────────────────

  server.delete('/addons/tickets/:guildId/tickets/:ticketId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
    const filtered = tickets.filter((t) => t.id !== ticketId);
    if (filtered.length === tickets.length) return reply.code(404).send({ success: false, error: 'Ticket not found' });

    await writeData(guildId, 'tickets', filtered);
    return reply.send({ success: true });
  });

  // ── Tickets (reopen) ──────────────────────────────────────────────────────

  server.post('/addons/tickets/:guildId/tickets/:ticketId/reopen', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
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
    await writeData(guildId, 'tickets', tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  // ── Tickets (bulk-close idle) ─────────────────────────────────────────────

  server.post('/addons/tickets/:guildId/tickets/bulk-close', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { idleHours = 72 } = (request.body as { idleHours?: number }) ?? {};

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
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

    await writeData(guildId, 'tickets', updated);
    return reply.send({ success: true, data: { closedCount } });
  });

  // ── Ticket actions ────────────────────────────────────────────────────────

  /** Loads the ticket array and locates a specific ticket by ID. */
  async function findTicket(guildId: string, ticketId: string) {
    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];
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
    await writeData(guildId, 'tickets', tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.post('/addons/tickets/:guildId/tickets/:ticketId/unclaim', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });
    tickets[idx] = { ...ticket, claimedBy: undefined, claimedByTag: undefined, status: 'open', lastActivity: new Date().toISOString() };
    await writeData(guildId, 'tickets', tickets);
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
    await writeData(guildId, 'tickets', tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.patch('/addons/tickets/:guildId/tickets/:ticketId/priority', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { priority } = (request.body as { priority: string });
    const valid = ['low', 'medium', 'high', 'urgent'];
    if (!valid.includes(priority)) return reply.code(400).send({ success: false, error: 'Invalid priority' });
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    tickets[idx] = { ...ticket, priority, lastActivity: new Date().toISOString() };
    await writeData(guildId, 'tickets', tickets);
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
      await writeData(guildId, 'tickets', tickets);
    }
    return reply.send({ success: true, data: tickets[idx] });
  });

  server.delete('/addons/tickets/:guildId/tickets/:ticketId/tags/:tag', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId, tag } = request.params as { guildId: string; ticketId: string; tag: string };
    const { tickets, idx, ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    tickets[idx] = { ...ticket, tags: ticket.tags.filter((t) => t !== tag), lastActivity: new Date().toISOString() };
    await writeData(guildId, 'tickets', tickets);
    return reply.send({ success: true, data: tickets[idx] });
  });

  // ── Portal reply to Discord channel ───────────────────────────────────────

  server.post('/addons/tickets/:guildId/tickets/:ticketId/reply', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, ticketId } = request.params as { guildId: string; ticketId: string };
    const { content, authorTag = 'Staff Portal' } = (request.body as { content: string; authorTag?: string });
    if (!content?.trim()) return reply.code(400).send({ success: false, error: 'Message content is required' });
    const { ticket } = await findTicket(guildId, ticketId);
    if (!ticket) return reply.code(404).send({ success: false, error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ success: false, error: 'Ticket is closed' });
    // Publish to Redis so the bot sends the message in the Discord channel and
    // updates the transcript and waiting-on status accordingly.
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
    await writeData(guildId, 'tickets', tickets);
    // Notify the bot to post the note to the private staff thread in the ticket channel.
    pub.publish('ticket:note:added', JSON.stringify({ guildId, channelId: ticket.channelId, note })).catch(() => null);
    return reply.send({ success: true, data: tickets[idx] });
  });

  // ── Stats (summary) ───────────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/stats', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };

    const [tickets, panels, config] = await Promise.all([
      readData<Ticket[]>(guildId, 'tickets').then((r) => r ?? []),
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

    // Rating distribution bucketed by star value (1–5).
    const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const t of rated) { ratingDistribution[t.rating!] = (ratingDistribution[t.rating!] ?? 0) + 1; }

    const since7d        = Date.now() - 7 * 24 * 3600 * 1000;
    const recentlyClosed = tickets.filter((t) => t.closedAt && new Date(t.closedAt).getTime() > since7d).length;

    // Average time from ticket creation to first staff response, in minutes.
    const responded = tickets.filter((t) => t.firstResponseAt);
    const avgResponseMinutes = responded.length > 0
      ? responded.reduce((s, t) => {
          const diffMs = new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime();
          return s + diffMs / 60000;
        }, 0) / responded.length
      : null;

    // Average time from ticket creation to closure, in minutes.
    const closedWithTime = tickets.filter((t) => t.closedAt);
    const avgCloseMinutes = closedWithTime.length > 0
      ? closedWithTime.reduce((s, t) => {
          const diffMs = new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime();
          return s + diffMs / 60000;
        }, 0) / closedWithTime.length
      : null;

    // SLA breaches: open tickets with no staff response that have exceeded the configured SLA window.
    const slaBreaches = config.slaHours && config.slaHours > 0
      ? tickets.filter((t) => {
          if (t.status === 'closed' || t.firstResponseAt) return false;
          const openMs = Date.now() - new Date(t.createdAt).getTime();
          return openMs >= (config.slaHours ?? 0) * 60 * 60 * 1000;
        }).length
      : 0;

    // Per-panel breakdown with average rating and average close time.
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

    return reply.send({
      success: true,
      data: {
        total: tickets.length,
        open,
        claimed,
        closed,
        waiting,
        avgRating,
        avgResponseMinutes,
        avgCloseMinutes,
        ratingDistribution,
        slaBreaches,
        recentlyClosed,
        panels: panels.length,
        blacklistedUsers: config.blacklistedUsers.length,
        byPanel,
      },
    });
  });

  // ── Stats (time-series) ───────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/stats/timeseries', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { days = '30' } = request.query as Record<string, string>;
    const daysNum = Math.min(365, Math.max(7, parseInt(days, 10)));

    const tickets = (await readData<Ticket[]>(guildId, 'tickets')) ?? [];

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

  // ── Config ────────────────────────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const config = (await readData<GuildTicketConfig>(guildId, 'config')) ?? { blacklistedUsers: [] };
    return reply.send({ success: true, data: config });
  });

  server.patch('/addons/tickets/:guildId/config', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const body = request.body as Partial<GuildTicketConfig>;
    const config = (await readData<GuildTicketConfig>(guildId, 'config')) ?? { blacklistedUsers: [] };
    const updated = { ...config, ...body };
    await writeData(guildId, 'config', updated);
    return reply.send({ success: true, data: updated });
  });

  // ── Canned Responses (list) ───────────────────────────────────────────────

  server.get('/addons/tickets/:guildId/canned-responses', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    return reply.send({ success: true, data: responses });
  });

  // ── Canned Responses (create) ─────────────────────────────────────────────

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

  // ── Canned Responses (update) ─────────────────────────────────────────────

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

  // ── Canned Responses (delete) ─────────────────────────────────────────────

  server.delete('/addons/tickets/:guildId/canned-responses/:responseId', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, responseId } = request.params as { guildId: string; responseId: string };

    const responses = (await readData<CannedResponse[]>(guildId, 'canned-responses')) ?? [];
    const filtered = responses.filter((r) => r.id !== responseId);
    if (filtered.length === responses.length) return reply.code(404).send({ success: false, error: 'Canned response not found' });

    await writeData(guildId, 'canned-responses', filtered);
    return reply.send({ success: true });
  });
}
