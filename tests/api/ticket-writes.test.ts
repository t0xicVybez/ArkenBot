import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TEST_DB_URL, testPrisma, seedGuild, closeTestDb } from '../helpers/testDb.js';
import { writeTicketIfUnchanged } from '../../packages/api/src/utils/ticketWrites.js';

function fakeRows(initial: { id: string; updatedAt: Date; priority: string }[]) {
  const rows = new Map(initial.map((r) => [r.id, { ...r }]));
  const updateRow = async (where: { id: string; updatedAt: Date }, data: Record<string, unknown>) => {
    const row = rows.get(where.id);
    if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return 0;
    Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    return 1;
  };
  return { rows, updateRow };
}

describe('writeTicketIfUnchanged', () => {
  const readAt = new Date('2026-10-23T10:00:00.000Z');

  it('writes when the row is still at the version that was read', async () => {
    const { rows, updateRow } = fakeRows([{ id: 't1', updatedAt: readAt, priority: 'low' }]);
    const ok = await writeTicketIfUnchanged(updateRow, 't1', readAt, { priority: 'high' });
    expect(ok).toBe(true);
    expect(rows.get('t1')?.priority).toBe('high');
  });

  it('refuses the write when another writer changed the row after it was read', async () => {
    const { rows, updateRow } = fakeRows([{ id: 't1', updatedAt: readAt, priority: 'low' }]);

    // Simulate the bot claiming the ticket between the dashboard's read and write.
    await writeTicketIfUnchanged(updateRow, 't1', readAt, { status: 'claimed' });

    const ok = await writeTicketIfUnchanged(updateRow, 't1', readAt, { priority: 'urgent' });
    expect(ok).toBe(false);
    expect(rows.get('t1')?.priority).toBe('low');
  });

  it('does not touch other tickets when a write conflicts', async () => {
    const { rows, updateRow } = fakeRows([
      { id: 't1', updatedAt: readAt, priority: 'low' },
      { id: 't2', updatedAt: readAt, priority: 'low' },
    ]);
    await writeTicketIfUnchanged(updateRow, 't1', new Date(0), { priority: 'high' });
    expect(rows.get('t2')?.priority).toBe('low');
  });
});

describe.skipIf(!TEST_DB_URL)('writeTicketIfUnchanged (integration, arkenbot_test)', () => {
  const GUILD = '111111111111111111';
  beforeAll(async () => { await seedGuild(GUILD); });
  afterAll(async () => { await closeTestDb(); });

  it('refuses a write made from a stale read and keeps the newer change', async () => {
    const prisma = testPrisma();
    const id = 'cas-' + Date.now();
    await prisma.addonTicket.create({
      data: { id, guildId: GUILD, number: 900001, panelId: 'p', channelId: id, userId: 'u', username: 'u', status: 'open', priority: 'low', lastActivity: new Date(), createdAt: new Date(), data: {} },
    });
    const read = await prisma.addonTicket.findUnique({ where: { id } });
    const updateRow = (where: { id: string; updatedAt: Date }, data: Record<string, unknown>) =>
      prisma.addonTicket.updateMany({ where, data: data as never }).then((r) => r.count);

    expect(await writeTicketIfUnchanged(updateRow, id, read!.updatedAt, { priority: 'high' })).toBe(true);
    expect(await writeTicketIfUnchanged(updateRow, id, read!.updatedAt, { priority: 'urgent' })).toBe(false);

    const after = await prisma.addonTicket.findUnique({ where: { id } });
    expect(after!.priority).toBe('high');
    await prisma.addonTicket.delete({ where: { id } });
  });
});
