
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { setTicketDb } from '../addons/tickets/dist/utils/db.js';
import { backfillTickets, repoAppendMessage, repoDeleteMessages } from '../addons/tickets/dist/utils/ticketsRepo.js';

const DRY = process.argv.includes('--dry');
if (!process.env.DATABASE_URL) {
  const m = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m);
  process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
setTicketDb(prisma);

async function main() {
  const addon = await prisma.addon.findUnique({ where: { name: 'tickets' }, select: { id: true } });
  if (!addon) { console.log('tickets addon not registered — nothing to do'); return; }

  const ticketRows = await prisma.addonData.findMany({ where: { addonId: addon.id, key: 'tickets' } });
  const msgRows = await prisma.addonData.findMany({ where: { addonId: addon.id, key: { startsWith: 'msgs:' } } });

  let guilds = 0, tickets = 0, msgChannels = 0, messages = 0;
  for (const row of ticketRows) {
    const arr = Array.isArray(row.value) ? row.value : [];
    guilds++; tickets += arr.length;
    if (!DRY && arr.length) await backfillTickets(arr);
  }
  for (const row of msgRows) {
    const channelId = row.key.slice('msgs:'.length);
    const arr = Array.isArray(row.value) ? row.value : [];
    msgChannels++; messages += arr.length;
    if (!DRY && arr.length) {
      await repoDeleteMessages(channelId);
      for (const m of arr) await repoAppendMessage(channelId, m);
    }
  }

  console.log(`${DRY ? '[DRY] would backfill' : 'backfilled'}: ${tickets} tickets across ${guilds} guild blob(s); ${messages} messages across ${msgChannels} channel(s)`);
  if (!DRY) {
    const [tc, mc] = await Promise.all([prisma.addonTicket.count(), prisma.addonTicketMessage.count()]);
    console.log(`table now holds: ${tc} tickets, ${mc} messages`);
  }
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
