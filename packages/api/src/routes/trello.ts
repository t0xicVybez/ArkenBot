import type { FastifyInstance } from 'fastify';
import { requireGuildAdmin } from '../middleware/auth.js';
import { prisma } from '../database.js';

const DISCORD_API = 'https://discord.com/api/v10';
const TRELLO_API = 'https://api.trello.com/1';
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.arkenbot.app';

// ── Event metadata ──────────────────────────────────────────────────────────
const EVENT_META: Record<string, { label: string; emoji: string; color: number }> = {
  create_card:     { label: 'Card Created',          emoji: '📝', color: 0x3dba6f },
  move_card:       { label: 'Card Moved',            emoji: '📦', color: 0x8b5cf6 },
  rename_card:     { label: 'Card Renamed',          emoji: '✏️', color: 0x5865f2 },
  update_card:     { label: 'Card Updated',          emoji: '🔄', color: 0xf59e0b },
  archive_card:    { label: 'Card Archived',         emoji: '📁', color: 0xd97706 },
  unarchive_card:  { label: 'Card Restored',         emoji: '♻️', color: 0x10b981 },
  delete_card:     { label: 'Card Deleted',          emoji: '🗑️', color: 0xe53535 },
  comment_card:    { label: 'Comment Added',         emoji: '💬', color: 0x6b7280 },
  add_member:      { label: 'Member Added to Card',  emoji: '➕', color: 0x0ea5e9 },
  remove_member:   { label: 'Member Removed',        emoji: '➖', color: 0xef4444 },
  add_attachment:  { label: 'Attachment Added',      emoji: '📎', color: 0x7c3aed },
  add_label:       { label: 'Label Added',           emoji: '🏷️', color: 0x22c55e },
  remove_label:    { label: 'Label Removed',         emoji: '🏷️', color: 0xf97316 },
  create_list:     { label: 'List Created',          emoji: '📂', color: 0x3b82f6 },
  rename_list:     { label: 'List Renamed',          emoji: '🏷️', color: 0x6366f1 },
  checkitem_state: { label: 'Checklist Item Toggled', emoji: '☑️', color: 0x14b8a6 },
};

// ── Normalise a Trello action into one of our canonical event types ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAction(action: Record<string, any>): string {
  const type: string = action.type ?? '';
  const data = action.data ?? {};

  switch (type) {
    case 'createCard':                return 'create_card';
    case 'deleteCard':                return 'delete_card';
    case 'commentCard':               return 'comment_card';
    case 'addMemberToCard':           return 'add_member';
    case 'removeMemberFromCard':      return 'remove_member';
    case 'addAttachmentToCard':       return 'add_attachment';
    case 'addLabelToCard':            return 'add_label';
    case 'removeLabelFromCard':       return 'remove_label';
    case 'createList':                return 'create_list';
    case 'updateCheckItemStateOnCard': return 'checkitem_state';
    case 'updateList':
      return data.old?.name !== undefined ? 'rename_list' : 'update_card';
    case 'updateCard':
      if (data.listBefore && data.listAfter) return 'move_card';
      if (data.old?.name !== undefined)      return 'rename_card';
      if (data.old?.closed === false && data.card?.closed) return 'archive_card';
      if (data.old?.closed === true && data.card?.closed === false) return 'unarchive_card';
      return 'update_card';
    default:
      return type;
  }
}

// ── Embed builder ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEmbed(normalizedType: string, action: Record<string, any>, boardLabel?: string | null) {
  const meta = EVENT_META[normalizedType] ?? { label: normalizedType, emoji: '🔔', color: 0x0079bf };
  const data = action.data ?? {};

  const board = data.board ?? {};
  const card = data.card ?? {};
  const boardName = boardLabel || board.name || 'Unknown Board';
  const boardUrl = board.shortLink ? `https://trello.com/b/${board.shortLink}` : null;
  const cardUrl = card.shortLink ? `https://trello.com/c/${card.shortLink}` : null;

  const actorName: string | undefined = action.memberCreator?.fullName ?? action.memberCreator?.username;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  const addField = (name: string, value: string, inline = true) => {
    if (value) fields.push({ name, value: value.slice(0, 1024), inline });
  };

  const cardField = () => addField('Card', cardUrl ? `[${card.name ?? 'View card'}](${cardUrl})` : (card.name ?? '—'));
  const boardField = () => addField('Board', boardUrl ? `[${boardName}](${boardUrl})` : boardName);

  // Discord-native timestamp, or *none* when the value was cleared.
  const fmtDate = (v: unknown) =>
    typeof v === 'string' && v ? `<t:${Math.floor(Date.parse(v) / 1000)}:f>` : '*none*';

  switch (normalizedType) {
    case 'create_card':
      cardField(); boardField();
      if (data.list?.name) addField('List', data.list.name);
      break;
    case 'move_card':
      cardField(); boardField();
      addField('From', data.listBefore?.name ?? '—');
      addField('To', `**${data.listAfter?.name ?? '—'}**`);
      break;
    case 'rename_card':
      boardField();
      addField('Old Name', data.old?.name ?? '—');
      addField('New Name', cardUrl ? `[${card.name}](${cardUrl})` : (card.name ?? '—'));
      break;
    case 'archive_card':
    case 'unarchive_card':
    case 'delete_card':
      addField('Card', card.name ?? (card.idShort ? `#${card.idShort}` : '—'));
      boardField();
      if (data.list?.name) addField('List', data.list.name);
      break;
    case 'comment_card': {
      cardField(); boardField();
      const text = String(data.text ?? '').trim().slice(0, 512);
      if (text) addField('Comment', text, false);
      break;
    }
    case 'add_member':
    case 'remove_member': {
      cardField(); boardField();
      const target = action.member?.fullName ?? action.member?.username;
      if (target) addField('Member', `**${target}**`);
      break;
    }
    case 'update_card': {
      cardField(); boardField();
      // Trello's `data.old` holds the previous value of every field that
      // changed — enumerate them so the embed says exactly what happened.
      const old = data.old ?? {};
      const changes: string[] = [];
      if ('desc' in old) {
        const newDesc = String(card.desc ?? '').trim();
        changes.push(newDesc
          ? `**Description** updated:\n> ${newDesc.slice(0, 300).replace(/\n/g, '\n> ')}`
          : '**Description** removed');
      }
      if ('due' in old) changes.push(`**Due date:** ${fmtDate(old.due)} → ${fmtDate(card.due)}`);
      if ('start' in old) changes.push(`**Start date:** ${fmtDate(old.start)} → ${fmtDate(card.start)}`);
      if ('dueComplete' in old) changes.push(card.dueComplete ? '**Due date** marked complete ✅' : '**Due date** marked incomplete');
      if ('dueReminder' in old) changes.push('**Due date reminder** changed');
      if ('pos' in old) changes.push('**Position** changed within list');
      if (changes.length) addField('Changes', changes.join('\n').slice(0, 1024), false);
      break;
    }

    case 'add_attachment': {
      cardField(); boardField();
      const att = data.attachment ?? {};
      addField('Attachment', att.url ? `[${att.name ?? 'View attachment'}](${att.url})` : (att.name ?? '—'), false);
      break;
    }

    case 'add_label':
    case 'remove_label': {
      cardField(); boardField();
      const label = data.label ?? {};
      const labelText = [label.name, label.color ? `(${label.color})` : null].filter(Boolean).join(' ');
      addField('Label', labelText || '—');
      break;
    }
    case 'create_list':
    case 'rename_list':
      addField('List', data.list?.name ?? '—');
      if (normalizedType === 'rename_list' && data.old?.name) addField('Old Name', data.old.name);
      boardField();
      break;
    case 'checkitem_state': {
      cardField(); boardField();
      const item = data.checkItem ?? {};
      const state = item.state === 'complete' ? '✅ complete' : '⬜ incomplete';
      addField('Item', `${item.name ?? '—'} — ${state}`, false);
      break;
    }
    default:
      boardField();
      if (card.name) cardField();
      break;
  }

  if (actorName) addField('By', `**${actorName}**`);

  return {
    title: `${meta.emoji} ${meta.label}`,
    color: meta.color,
    fields,
    footer: { text: `Trello · ${boardName}` },
    timestamp: action.date ?? new Date().toISOString(),
  };
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

/** Extracts a board ID or shortlink from a raw ID, shortlink, or full board URL. */
function parseBoardId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/trello\.com\/b\/([A-Za-z0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{8,32}$/.test(trimmed)) return trimmed;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════════
export async function trelloRoutes(server: FastifyInstance): Promise<void> {

  // ── GET /guilds/:guildId/trello-alerts ────────────────────────────────────
  server.get('/guilds/:guildId/trello-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const alerts = await prisma.trelloAlert.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: alerts });
  });

  // ── POST /guilds/:guildId/trello-alerts ───────────────────────────────────
  // Creates the alert AND registers the webhook with Trello using the caller's
  // API key + token. The credentials are used once and never stored.
  server.post('/guilds/:guildId/trello-alerts', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId } = request.params as { guildId: string };
    const { discordChannelId, board, trelloKey, trelloToken, events } = request.body as Record<string, unknown>;

    if (!discordChannelId) {
      return reply.code(400).send({ success: false, error: 'discordChannelId is required' });
    }
    if (typeof board !== 'string' || typeof trelloKey !== 'string' || typeof trelloToken !== 'string') {
      return reply.code(400).send({ success: false, error: 'board, trelloKey, and trelloToken are required' });
    }

    const boardRef = parseBoardId(board);
    if (!boardRef) {
      return reply.code(400).send({ success: false, error: 'Could not parse a board ID from the value provided. Paste the board URL (https://trello.com/b/…) or its ID.' });
    }

    const auth = `key=${encodeURIComponent(trelloKey.trim())}&token=${encodeURIComponent(trelloToken.trim())}`;

    // Resolve the board — validates credentials and gets the full ID + name.
    const boardRes = await fetch(`${TRELLO_API}/boards/${boardRef}?fields=id,name&${auth}`).catch(() => null);
    if (!boardRes?.ok) {
      const detail = boardRes ? await boardRes.text().catch(() => '') : '';
      return reply.code(400).send({ success: false, error: `Trello rejected the board lookup (${boardRes?.status ?? 'network error'}). Check the board URL, API key, and token. ${detail.slice(0, 120)}` });
    }
    const boardInfo = await boardRes.json() as { id: string; name: string };

    const alert = await prisma.trelloAlert.create({
      data: {
        guildId,
        discordChannelId: discordChannelId as string,
        boardId: boardInfo.id,
        boardName: boardInfo.name,
        events: Array.isArray(events) ? (events as string[]) : [],
      },
    });

    // Register the webhook with Trello. Trello immediately sends a HEAD request
    // to the callback URL, which our public endpoint below answers with 200.
    const callbackURL = `${PUBLIC_API_URL}/trello/webhook/${alert.webhookToken}`;
    const hookRes = await fetch(`${TRELLO_API}/webhooks/?${auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackURL, idModel: boardInfo.id, description: `ArkenBot alerts (${guildId})` }),
    }).catch(() => null);

    if (!hookRes?.ok) {
      const detail = hookRes ? await hookRes.text().catch(() => '') : '';
      await prisma.trelloAlert.delete({ where: { id: alert.id } }).catch(() => undefined);
      return reply.code(400).send({ success: false, error: `Trello webhook registration failed (${hookRes?.status ?? 'network error'}): ${detail.slice(0, 160)}` });
    }
    const hook = await hookRes.json() as { id: string };
    const updated = await prisma.trelloAlert.update({ where: { id: alert.id }, data: { trelloWebhookId: hook.id } });

    return reply.code(201).send({ success: true, data: updated });
  });

  // ── PATCH /guilds/:guildId/trello-alerts/:id ──────────────────────────────
  server.patch('/guilds/:guildId/trello-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.trelloAlert.findFirst({ where: { id, guildId } });
    if (!existing) return reply.code(404).send({ success: false, error: 'Not found' });

    const data: Record<string, unknown> = {};
    if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);
    if (typeof body.discordChannelId === 'string') data.discordChannelId = body.discordChannelId;
    if (typeof body.boardName === 'string') data.boardName = body.boardName.trim() || null;
    if (Array.isArray(body.events)) data.events = body.events as string[];

    if (Object.keys(data).length === 0) return reply.send({ success: true });

    await prisma.trelloAlert.update({ where: { id }, data });
    return reply.send({ success: true });
  });

  // ── DELETE /guilds/:guildId/trello-alerts/:id ─────────────────────────────
  // Trello's webhook is cleaned up automatically: once the alert row is gone,
  // the public endpoint answers 410 Gone and Trello deletes the webhook.
  server.delete('/guilds/:guildId/trello-alerts/:id', { preHandler: [requireGuildAdmin] }, async (request, reply) => {
    const { guildId, id } = request.params as { guildId: string; id: string };
    await prisma.trelloAlert.deleteMany({ where: { id, guildId } });
    return reply.code(204).send();
  });

  // ── /trello/webhook/:token ────────────────────────────────────────────────
  // Public endpoint — Trello verifies the callback with HEAD/GET at creation,
  // then POSTs an action payload for every board event.
  server.head('/trello/webhook/:token', async (_request, reply) => reply.code(200).send());
  server.get('/trello/webhook/:token', async (_request, reply) => reply.code(200).send({ ok: true }));

  server.post('/trello/webhook/:token', {
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as Record<string, any>;

    const alert = await prisma.trelloAlert.findUnique({ where: { webhookToken: token } });
    // 410 tells Trello the webhook is dead — it deletes it on their side.
    if (!alert) return reply.code(410).send({ error: 'gone' });
    if (!alert.enabled) return reply.send({ ok: true });

    const action = body?.action;
    if (!action?.type) return reply.send({ ok: true });

    const normalizedType = normalizeAction(action);

    // Event filter: if the alert has a specific list, skip events not in it
    if (alert.events.length > 0 && !alert.events.includes(normalizedType)) {
      return reply.send({ ok: true });
    }

    const embed = buildEmbed(normalizedType, action, alert.boardName);

    // Fire-and-forget — don't let Discord latency slow the webhook response
    sendDiscordEmbed(alert.discordChannelId, embed).catch((err) => {
      request.log.error({ err }, 'trello discord send failed');
    });

    return reply.send({ ok: true });
  });
}
