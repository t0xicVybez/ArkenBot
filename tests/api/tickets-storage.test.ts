import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  TEST_DB_URL, testPrisma, seedAddon, seedGuild, clearAddonData, makeStorage, closeTestDb,
} from '../helpers/testDb.js';
import {
  getTickets, saveTicket, getTicketByChannel, getTicketById, getUserOpenTickets,
  nextTicketNumber, savePanel, getPanel, deletePanel, getConfig, saveConfig,
  getCannedResponses, saveCannedResponses, appendMessage, getMessages,
} from '../../addons/tickets/src/utils/storage.js';
import type { AddonStorage } from '../../packages/addon-sdk/src/types.js';
import type { Ticket, TicketPanel } from '../../addons/tickets/src/types.js';

const GUILD = '111111111111111111';

function mkTicket(over: Partial<Ticket> = {}): Ticket {
  const now = new Date().toISOString();
  return {
    id: over.id ?? 't-' + Math.random().toString(36).slice(2),
    number: over.number ?? 1,
    panelId: 'p1',
    guildId: GUILD,
    channelId: over.channelId ?? 'c-' + Math.random().toString(36).slice(2),
    userId: over.userId ?? 'u1',
    username: 'tester',
    status: over.status ?? 'open',
    priority: 'medium',
    tags: [],
    notes: [],
    createdAt: now,
    lastActivity: now,
    ...over,
  };
}

// Gated: skips when the test DB isn't available (e.g. CI without .env).
describe.skipIf(!TEST_DB_URL)('tickets storage (integration, arkenbot_test)', () => {
  let storage: AddonStorage;

  beforeAll(async () => {
    const addonId = await seedAddon('tickets');
    await seedGuild(GUILD);
    storage = makeStorage(addonId);
  });
  afterAll(async () => { await closeTestDb(); });
  beforeEach(async () => { await clearAddonData(); });

  it('round-trips a ticket through save → getTickets', async () => {
    const tk = mkTicket({ number: 1 });
    await saveTicket(storage, GUILD, tk);
    const all = await getTickets(storage, GUILD);
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(tk.id);
  });

  it('updates in place on re-save (no duplicate)', async () => {
    const tk = mkTicket({ number: 1, status: 'open' });
    await saveTicket(storage, GUILD, tk);
    await saveTicket(storage, GUILD, { ...tk, status: 'claimed', claimedBy: 'staff1' });
    const all = await getTickets(storage, GUILD);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('claimed');
    expect(all[0].claimedBy).toBe('staff1');
  });

  it('finds tickets by channel and by id', async () => {
    const tk = mkTicket({ number: 2, channelId: 'chan-xyz' });
    await saveTicket(storage, GUILD, tk);
    expect((await getTicketByChannel(storage, GUILD, 'chan-xyz'))?.id).toBe(tk.id);
    expect((await getTicketById(storage, GUILD, tk.id))?.channelId).toBe('chan-xyz');
    expect(await getTicketByChannel(storage, GUILD, 'nope')).toBeUndefined();
  });

  it('getUserOpenTickets filters by user and excludes closed', async () => {
    await saveTicket(storage, GUILD, mkTicket({ number: 1, userId: 'ua', status: 'open' }));
    await saveTicket(storage, GUILD, mkTicket({ number: 2, userId: 'ua', status: 'closed' }));
    await saveTicket(storage, GUILD, mkTicket({ number: 3, userId: 'ub', status: 'open' }));
    const open = await getUserOpenTickets(storage, GUILD, 'ua');
    expect(open).toHaveLength(1);
    expect(open[0].number).toBe(1);
  });

  it('nextTicketNumber increments and persists', async () => {
    expect(await nextTicketNumber(storage, GUILD)).toBe(1);
    expect(await nextTicketNumber(storage, GUILD)).toBe(2);
    expect(await nextTicketNumber(storage, GUILD)).toBe(3);
  });

  // Note: concurrent-write atomicity is a property of the production
  // Redis-locked AddonStorage.mutate (proven separately in the P1.1 work), not
  // of this storage-logic harness (whose mutate is a plain read-modify-write).

  it('saves/gets/deletes panels', async () => {
    const panel = { id: 'p1', name: 'Support', namingPattern: 'ticket-{number}' } as TicketPanel;
    await savePanel(storage, GUILD, panel);
    expect((await getPanel(storage, GUILD, 'p1'))?.name).toBe('Support');
    await deletePanel(storage, GUILD, 'p1');
    expect(await getPanel(storage, GUILD, 'p1')).toBeUndefined();
  });

  it('config defaults then persists', async () => {
    expect((await getConfig(storage, GUILD)).blacklistedUsers).toEqual([]);
    await saveConfig(storage, GUILD, { blacklistedUsers: ['bad'], autoTriage: true });
    const cfg = await getConfig(storage, GUILD);
    expect(cfg.blacklistedUsers).toEqual(['bad']);
    expect(cfg.autoTriage).toBe(true);
  });

  it('canned responses round-trip', async () => {
    await saveCannedResponses(storage, GUILD, [{ id: 'c1', name: 'greeting', content: 'Hi {user}', createdBy: 'x', createdByTag: 'X', createdAt: new Date().toISOString() }]);
    const canned = await getCannedResponses(storage, GUILD);
    expect(canned).toHaveLength(1);
    expect(canned[0].name).toBe('greeting');
  });

  it('appends and reads channel messages (global scope)', async () => {
    const m = { authorId: 'u1', authorTag: 'U#1', content: 'hello', attachments: [], timestamp: new Date().toISOString() };
    await appendMessage(storage, 'chan-1', m);
    await appendMessage(storage, 'chan-1', { ...m, content: 'world' });
    const msgs = await getMessages(storage, 'chan-1');
    expect(msgs.map((x) => x.content)).toEqual(['hello', 'world']);
    expect(await getMessages(storage, 'chan-2')).toEqual([]);
  });
});
