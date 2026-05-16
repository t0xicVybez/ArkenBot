/**
 * Seed built-in addons into the database.
 * Run once after initial setup or when new addons are added:
 *   npx ts-node scripts/seed-addons.ts
 * or via:
 *   npx tsx scripts/seed-addons.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADDONS = [
  {
    name:        'tickets',
    displayName: 'Ticket System',
    version:     '1.0.0',
    description: 'Full-featured support ticket system with categories, claiming, and transcripts.',
    author:      'Arken Bot',
    enabled:     true,
    verified:    true,
    manifest: {
      settings: [
        { key: 'categoryId',      label: 'Ticket Category',    type: 'channel',  required: true,  description: 'Category channel where ticket channels are created' },
        { key: 'supportRoleId',   label: 'Support Role',       type: 'role',     required: false, description: 'Role that can see and manage tickets' },
        { key: 'logChannelId',    label: 'Log Channel',        type: 'channel',  required: false, description: 'Channel where ticket logs are posted' },
        { key: 'maxOpenTickets',  label: 'Max Open Tickets',   type: 'number',   required: false, default: 1, min: 1, max: 10, description: 'Max open tickets per user' },
      ],
    },
  },
  {
    name:        'counting',
    displayName: 'Counting Game',
    version:     '1.0.0',
    description: 'Members count together in a dedicated channel. Wrong numbers or consecutive counts reset the score.',
    author:      'Arken Bot',
    enabled:     true,
    verified:    true,
    manifest: {
      settings: [
        { key: 'channelId',     label: 'Counting Channel',         type: 'channel', required: true,  description: 'The channel where members count' },
        { key: 'resetOnFail',   label: 'Reset Count on Fail',      type: 'boolean', required: false, default: true,  description: 'Reset the count back to 0 when someone sends the wrong number' },
        { key: 'allowSameUser', label: 'Allow Same User Twice',    type: 'boolean', required: false, default: false, description: 'Allow the same user to count two numbers in a row' },
      ],
    },
  },
];

async function main() {
  for (const addon of ADDONS) {
    await prisma.addon.upsert({
      where:  { name: addon.name },
      update: { ...addon, manifest: addon.manifest as never },
      create: { ...addon, manifest: addon.manifest as never },
    });
    console.log(`✓ Upserted addon: ${addon.displayName}`);
  }
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
