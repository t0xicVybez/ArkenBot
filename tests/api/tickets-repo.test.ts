import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TEST_DB_URL, testPrisma, seedGuild, closeTestDb } from '../helpers/testDb.js';
import { setTicketDb, type TicketDb } from '../../addons/tickets/src/utils/db.js';
import {
  toRow, fromRow, repoSaveTicket, repoGetTickets, repoGetByChannel, repoGetById,
  repoGetUserOpen, repoAppendMessage, repoGetMessages, repoDeleteMessages, backfillTickets,
} from '../../addons/tickets/src/utils/ticketsRepo.js';
import type { Ticket } from '../../addons/tickets/src/types.js';

const GUILD = '222222222222222222';
const now = '2026-10-12T00:00:00.000Z';

/** A ticket with every field populated — the worst case for the column/data split. */
function richTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: over.id ?? 'rt-' + Math.random().toString(36).slice(2),
    number: over.number ?? 7,
    panelId: 'panel-1',
    guildId: GUILD,
    channelId: over.channelId ?? 'chan-' + Math.random().toString(36).slice(2),
    userId: over.userId ?? 'user-1',
    username: 'rich#1',
    status: over.status ?? 'claimed',
    priority: 'high',
    claimedBy: 'staff-1', claimedByTag: 'Staff#1',
    transferredTo: 'staff-2', transferredToTag: 'Staff#2',
    reason: 'my /warp crashes',
    categoryTag: 'con', buttonId: 'btn-1',
    tags: ['con', 'sla-level-4h'],
    rating: 4, ratingFeedback: 'ok-ish',
    closedBy: 'staff-2', closedByTag: 'Staff#2', closedAt: now,
    firstResponseAt: now,
    notes: [{ id: 'n1', authorId: 'a', authorTag: 'A', content: 'note', createdAt: now }],
    controlsMessageId: 'm-ctrl', notesThreadId: 'thr-1',
    createdAt: now, lastActivity: now,
    formResponses: { q1: 'Code', q2: 'Yes' },
    nudgedAt: now,
    reminderAt: now, reminderBy: 'staff-1', reminderNote: 'follow up',
    closeRequestedBy: 'staff-1', closeRequestedByTag: 'Staff#1', closeRequestedAt: now,
    aiTriage: { summary: 'crash', urgency: 'high', reply: 'send logs', tag: 'bug', at: now },
    ...over,
  };
}

describe('ticketsRepo serialization (pure)', () => {
  it('toRow → fromRow preserves every field', () => {
    const t = richTicket();
    const back = fromRow(toRow(t) as never);
    expect(back).toEqual(t);
  });

  it('round-trips a minimal ticket', () => {
    const t: Ticket = {
      id: 'min', number: 1, panelId: 'p', guildId: GUILD, channelId: 'c', userId: 'u',
      username: 'u', status: 'open', priority: 'medium', tags: [], notes: [],
      createdAt: now, lastActivity: now,
    };
    expect(fromRow(toRow(t) as never)).toEqual(t);
  });
});

describe.skipIf(!TEST_DB_URL)('ticketsRepo (integration, arkenbot_test)', () => {
  beforeAll(async () => {
    await seedGuild(GUILD);
    setTicketDb(testPrisma() as unknown as TicketDb);
  });
  afterAll(async () => { await closeTestDb(); });
  beforeEach(async () => {
    await testPrisma().addonTicketMessage.deleteMany({});
    await testPrisma().addonTicket.deleteMany({});
  });

  it('persists and reads back a rich ticket with full fidelity', async () => {
    const t = richTicket({ number: 1 });
    await repoSaveTicket(t);
    expect(await repoGetById(t.id)).toEqual(t);
  });

  it('upserts in place (no duplicate row)', async () => {
    const t = richTicket({ number: 1, status: 'open' });
    await repoSaveTicket(t);
    await repoSaveTicket({ ...t, status: 'closed', closedAt: now });
    const all = await repoGetTickets(GUILD);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('closed');
  });

  it('indexed lookups: by channel, by id, open-by-user', async () => {
    await repoSaveTicket(richTicket({ number: 1, channelId: 'cc', userId: 'ua', status: 'open' }));
    await repoSaveTicket(richTicket({ number: 2, userId: 'ua', status: 'closed' }));
    await repoSaveTicket(richTicket({ number: 3, userId: 'ub', status: 'open' }));
    expect((await repoGetByChannel('cc'))?.number).toBe(1);
    expect(await repoGetByChannel('missing')).toBeUndefined();
    const open = await repoGetUserOpen(GUILD, 'ua');
    expect(open.map((x) => x.number)).toEqual([1]);
  });

  it('messages: append preserves order, get, delete', async () => {
    const m = { authorId: 'u', authorTag: 'U', content: 'a', attachments: ['http://x/1'], timestamp: '2026-10-12T00:00:01.000Z' };
    await repoAppendMessage('chan-m', m);
    await repoAppendMessage('chan-m', { ...m, content: 'b', timestamp: '2026-10-12T00:00:02.000Z' });
    const msgs = await repoGetMessages('chan-m');
    expect(msgs.map((x) => x.content)).toEqual(['a', 'b']);
    expect(msgs[0].attachments).toEqual(['http://x/1']);
    await repoDeleteMessages('chan-m');
    expect(await repoGetMessages('chan-m')).toEqual([]);
  });

  it('backfills a blob array into the table', async () => {
    const blob = [richTicket({ number: 1 }), richTicket({ number: 2 }), richTicket({ number: 3 })];
    const n = await backfillTickets(blob);
    expect(n).toBe(3);
    const rows = await repoGetTickets(GUILD);
    expect(rows).toHaveLength(3);
    // parity: backfilled rows equal the source blob (order-independent)
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const t of blob) expect(byId.get(t.id)).toEqual(t);
  });
});
