import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

const DISCORD_API = 'https://discord.com/api/v10';
const MONDAY_API = 'https://api.monday.com/v2';

// ── User name cache — keyed by `${tokenSuffix}:${userId}`, TTL 1 hour ────────
const userNameCache = new Map<string, { name: string; expiresAt: number }>();

async function resolveMondayUserName(userId: number | string, apiToken: string): Promise<string | null> {
  const cacheKey = `${apiToken.slice(-8)}:${userId}`;
  const cached = userNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.name;

  try {
    const res = await fetch(MONDAY_API, {
      method: 'POST',
      headers: { Authorization: apiToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ users(ids: [${userId}]) { id name } }` }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const name: string | undefined = json?.data?.users?.[0]?.name;
    if (name) {
      userNameCache.set(cacheKey, { name, expiresAt: Date.now() + 3_600_000 });
      return name;
    }
  } catch {
    // Silently fall back to profile link
  }
  return null;
}

// ── Event metadata ──────────────────────────────────────────────────────────
const EVENT_META: Record<string, { label: string; emoji: string; color: number }> = {
  create_item:          { label: 'New Item Created',    emoji: '📝', color: 0x3dba6f },
  delete_item:          { label: 'Item Deleted',         emoji: '🗑️', color: 0xe53535 },
  update_name:          { label: 'Item Renamed',         emoji: '✏️', color: 0x5865f2 },
  change_column_value:  { label: 'Column Updated',       emoji: '🔄', color: 0xf59e0b },
  create_subitem:       { label: 'Subitem Created',      emoji: '➕', color: 0x0ea5e9 },
  move_item_to_group:   { label: 'Item Moved',           emoji: '📦', color: 0x8b5cf6 },
  create_update:        { label: 'Comment Added',        emoji: '💬', color: 0x6b7280 },
  archive_item:         { label: 'Item Archived',        emoji: '📁', color: 0xd97706 },
  restore_item:         { label: 'Item Restored',        emoji: '♻️', color: 0x10b981 },
  create_group:         { label: 'Group Created',        emoji: '📂', color: 0x3b82f6 },
  delete_group:         { label: 'Group Deleted',        emoji: '🗑️', color: 0xef4444 },
  duplicate_item:       { label: 'Item Duplicated',      emoji: '📋', color: 0x7c3aed },
};

// ── Embed builder ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEmbed(event: Record<string, any>, boardName?: string | null, resolvedUserName?: string | null) {
  const meta = EVENT_META[event.type] ?? { label: event.type, emoji: '🔔', color: 0x5865f2 };

  const boardLabel = boardName || (event.boardId ? `Board ${event.boardId}` : 'Unknown Board');
  const boardUrl = event.boardId ? `https://app.monday.com/boards/${event.boardId}` : null;
  const itemUrl = event.boardId && event.itemId
    ? `https://app.monday.com/boards/${event.boardId}/pulses/${event.itemId}`
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  const addField = (name: string, value: string, inline = true) => {
    if (value) fields.push({ name, value: value.slice(0, 1024), inline });
  };

  // Show resolved display name, or fall back to a profile link
  const fmtUser = (id?: number | string) => {
    if (!id) return '—';
    if (resolvedUserName) return `**${resolvedUserName}**`;
    return `[View profile](https://app.monday.com/users/${id})`;
  };

  switch (event.type) {
    case 'create_item':
      addField('Item', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      if (event.groupName || event.groupId) addField('Group', event.groupName ?? `\`${event.groupId}\``);
      addField('Created By', fmtUser(event.userId));
      break;

    case 'delete_item':
      addField('Item', event.itemName ?? '—');
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      if (event.groupName || event.groupId) addField('Group', event.groupName ?? `\`${event.groupId}\``);
      addField('Deleted By', fmtUser(event.userId));
      break;

    case 'update_name':
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Item ID', event.itemId ? `\`${event.itemId}\`` : '—');
      addField('Old Name', event.previousItemName ?? '—');
      addField('New Name', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Changed By', fmtUser(event.userId));
      break;

    case 'change_column_value': {
      const colTitle = event.columnTitle ?? event.columnId ?? 'Column';
      // Extract human-readable values from Monday.com's value objects
      const prevText = extractColumnText(event.previousValue);
      const newText = extractColumnText(event.value);
      addField('Item', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Column', `**${colTitle}**${event.columnType ? ` *(${event.columnType})*` : ''}`, false);
      if (prevText) addField('Before', prevText);
      if (newText) addField('After', newText);
      addField('Updated By', fmtUser(event.userId));
      break;
    }

    case 'create_subitem': {
      const parentUrl = event.boardId && event.parentItemId
        ? `https://app.monday.com/boards/${event.boardId}/pulses/${event.parentItemId}`
        : null;
      addField('Subitem', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Parent Item', parentUrl ? `[${event.parentItemName}](${parentUrl})` : (event.parentItemName ?? event.parentItemId ? `\`${event.parentItemId}\`` : '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Created By', fmtUser(event.userId));
      break;
    }

    case 'move_item_to_group': {
      const itemDisplay = event.itemName ?? (event.itemId ? `Item ${event.itemId}` : null);
      const toLabel = event.destGroup?.title ?? event.destGroupId ?? '—';
      addField('Item', itemDisplay ? (itemUrl ? `[${itemDisplay}](${itemUrl})` : itemDisplay) : '—');
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('From', event.sourceGroupId ? `\`${event.sourceGroupId}\`` : '—');
      addField('To', `**${toLabel}**`);
      addField('Moved By', fmtUser(event.userId));
      break;
    }

    case 'create_update':
      addField('Item', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Comment By', fmtUser(event.userId));
      if (event.body) {
        // Strip HTML tags from comment body
        const cleanBody = String(event.body).replace(/<[^>]+>/g, '').trim().slice(0, 512);
        if (cleanBody) addField('Comment', cleanBody, false);
      }
      break;

    case 'archive_item':
      addField('Item', event.itemName ?? (event.itemId ? `\`${event.itemId}\`` : '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      if (event.groupId) addField('Group', `\`${event.groupId}\``);
      addField('Archived By', fmtUser(event.userId));
      break;

    case 'restore_item':
      addField('Item', itemUrl ? `[${event.itemName}](${itemUrl})` : (event.itemName ?? '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Restored By', fmtUser(event.userId));
      break;

    case 'create_group':
      addField('Group', event.groupName ?? event.groupId ?? '—');
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Created By', fmtUser(event.userId));
      break;

    case 'delete_group':
      addField('Group', event.groupName ?? event.groupId ?? '—');
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      addField('Deleted By', fmtUser(event.userId));
      break;

    case 'duplicate_item':
      addField('Original', event.itemName ?? (event.itemId ? `\`${event.itemId}\`` : '—'));
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      if (event.groupId) addField('Group', `\`${event.groupId}\``);
      addField('Duplicated By', fmtUser(event.userId));
      break;

    default:
      addField('Board', boardUrl ? `[${boardLabel}](${boardUrl})` : boardLabel);
      if (event.itemName) addField('Item', event.itemName);
      addField('Triggered By', fmtUser(event.userId));
      break;
  }

  return {
    title: `${meta.emoji} ${meta.label}`,
    color: meta.color,
    fields,
    footer: {
      text: `monday.com · Board ID ${event.boardId ?? '—'}`,
      icon_url: 'https://cdn.monday.com/images/logos/monday_logo_icon.png',
    },
    timestamp: event.triggerTime ?? new Date().toISOString(),
  };
}

// ── Extract human-readable text from Monday.com column value objects ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractColumnText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val !== 'object') return String(val);
  // Status / label (color columns)
  if (val.label?.text) return val.label.text;
  // Person / team
  if (val.personsAndTeams) {
    const names = val.personsAndTeams.map((p: { name?: string; id?: number }) => p.name ?? `User ${p.id}`);
    return names.join(', ');
  }
  // Plain text columns store value as { value: "..." }
  if (typeof val.value === 'string') return val.value;
  // Date
  if (val.date) return val.date;
  // Long text
  if (val.text) return val.text;
  // Numbers
  if (val.number !== undefined) return String(val.number);
  // Fallback: stringify top-level scalars
  const simple = Object.values(val).filter((v) => typeof v === 'string' || typeof v === 'number');
  return simple.length ? simple.join(', ') : JSON.stringify(val).slice(0, 200);
}

// ── Send Discord embed ────────────────────────────────────────────────────────
async function sendDiscordEmbed(channelId: string, embed: object): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return;
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds: [embed] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════
export async function mondayRoutes(server: FastifyInstance): Promise<void> {

  // ── GET /guilds/:guildId/monday-alerts ────────────────────────────────────
  server.get('/guilds/:guildId/monday-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const alerts = await prisma.mondayAlert.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
    // Never expose the raw API token — return a boolean indicating whether it's set
    const safeAlerts = alerts.map(({ mondayApiToken, ...a }) => ({
      ...a,
      hasApiToken: !!mondayApiToken,
    }));
    return reply.send({ success: true, data: safeAlerts });
  });

  // ── POST /guilds/:guildId/monday-alerts ───────────────────────────────────
  server.post('/guilds/:guildId/monday-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { discordChannelId, boardName, events } = request.body as Record<string, unknown>;

    if (!discordChannelId) {
      return reply.code(400).send({ success: false, error: 'discordChannelId is required' });
    }

    const { mondayApiToken } = request.body as Record<string, unknown>;
    const alert = await prisma.mondayAlert.create({
      data: {
        guildId,
        discordChannelId: discordChannelId as string,
        boardName: typeof boardName === 'string' ? boardName.trim() || null : null,
        events: Array.isArray(events) ? (events as string[]) : [],
        mondayApiToken: typeof mondayApiToken === 'string' ? mondayApiToken.trim() || null : null,
      },
    });
    return reply.code(201).send({ success: true, data: alert });
  });

  // ── PATCH /guilds/:guildId/monday-alerts/:id ──────────────────────────────
  server.patch('/guilds/:guildId/monday-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.mondayAlert.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });

    const data: Record<string, unknown> = {};
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    if (typeof body.discordChannelId === 'string') data.discordChannelId = body.discordChannelId;
    if (typeof body.boardName === 'string') data.boardName = body.boardName.trim() || null;
    if (Array.isArray(body.events)) data.events = body.events as string[];

    if (typeof body.mondayApiToken === 'string') {
      data.mondayApiToken = body.mondayApiToken.trim() || null;
      // Clear cache entries for this alert so the new token takes effect immediately
      for (const key of userNameCache.keys()) {
        if (key.includes(':')) userNameCache.delete(key);
      }
    }

    if (Object.keys(data).length === 0) return reply.send({ success: true });

    await prisma.mondayAlert.update({ where: { id }, data });
    return reply.send({ success: true });
  });

  // ── DELETE /guilds/:guildId/monday-alerts/:id ─────────────────────────────
  server.delete('/guilds/:guildId/monday-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.mondayAlert.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });

  // ── POST /monday/webhook/:token ───────────────────────────────────────────
  // Public endpoint — Monday.com POSTs here when board events fire.
  server.post('/monday/webhook/:token', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as Record<string, any>;

    // Monday.com challenge handshake — must be echoed back on webhook creation
    if (body?.challenge) {
      return reply.send({ challenge: body.challenge });
    }

    // Debug: log the full payload so we can see Monday.com's actual event type strings
    request.log.info({ mondayPayload: JSON.stringify(body).slice(0, 2000) }, 'monday webhook payload');

    const event = body?.event;
    if (!event?.type) return reply.send({ ok: true });

    const alert = await prisma.mondayAlert.findUnique({ where: { webhookToken: token } });
    if (!alert || !alert.enabled) return reply.send({ ok: true });

    // Normalise Monday.com's various event type names to our canonical names
    const TYPE_MAP: Record<string, string> = {
      create_pulse:         'create_item',
      delete_pulse:         'delete_item',
      archive_pulse:        'archive_item',
      restore_pulse:        'restore_item',
      move_pulse_to_group:  'move_item_to_group',
      move_pulse_into_group:'move_item_to_group', // actual event name Monday.com sends
      update_column_value:  'change_column_value', // Monday.com uses both names
    };
    const normalizedType = TYPE_MAP[event.type] ?? event.type;

    // For update_name the new/old names live in event.value.name / event.previousValue.name
    const isNameChange = normalizedType === 'update_name';

    const normalizedEvent = {
      ...event,
      type: normalizedType,
      itemId:           event.itemId          ?? event.pulseId,
      itemName:         event.itemName        ?? event.pulseName ?? (isNameChange ? event.value?.name : undefined),
      previousItemName: event.previousItemName ?? event.previousPulseName ?? (isNameChange ? event.previousValue?.name : undefined),
      groupName:        event.groupName,
      destGroup:        event.destGroup, // { id, title, color } for move events
    };

    // Event filter: if the alert has a specific list, skip events not in it
    if (alert.events.length > 0 && !alert.events.includes(normalizedEvent.type)) {
      request.log.info({ type: normalizedEvent.type, filter: alert.events }, 'monday event filtered out');
      return reply.send({ ok: true });
    }

    // Resolve user display name if API token is configured
    const resolvedUserName = alert.mondayApiToken && normalizedEvent.userId
      ? await resolveMondayUserName(normalizedEvent.userId, alert.mondayApiToken)
      : null;

    const embed = buildEmbed(normalizedEvent, alert.boardName, resolvedUserName);

    // Fire-and-forget — don't let Discord latency slow the webhook response
    sendDiscordEmbed(alert.discordChannelId, embed).catch((err) => {
      request.log.error({ err }, 'monday discord send failed');
    });

    return reply.send({ ok: true });
  });
}
