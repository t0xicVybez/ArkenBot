import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create example addons
  await prisma.addon.upsert({
    where: { name: 'example-greeting' },
    update: {},
    create: {
      name: 'example-greeting',
      displayName: 'Greeting Bot',
      version: '1.0.0',
      description: 'Sends custom greeting messages with configurable templates.',
      author: 'Example Author',
      homepage: 'https://github.com/example/greeting-addon',
      enabled: true,
      verified: true,
      manifest: {
        commands: ['greet'],
        events: ['guildMemberAdd'],
        settings: [
          { key: 'message', type: 'string', default: 'Hello {user}!', label: 'Greeting Message' },
          { key: 'channel', type: 'channel', label: 'Greeting Channel' },
        ],
      },
    },
  });

  await prisma.addon.upsert({
    where: { name: 'example-economy' },
    update: {},
    create: {
      name: 'example-economy',
      displayName: 'Economy System',
      version: '1.0.0',
      description: 'Full economy system with currency, shop, and transactions.',
      author: 'Example Author',
      homepage: 'https://github.com/example/economy-addon',
      enabled: true,
      verified: true,
      manifest: {
        commands: ['balance', 'pay', 'daily', 'shop'],
        events: ['messageCreate'],
        settings: [
          { key: 'currencyName', type: 'string', default: 'Coins', label: 'Currency Name' },
          { key: 'currencyEmoji', type: 'string', default: '🪙', label: 'Currency Emoji' },
          { key: 'dailyAmount', type: 'number', default: 100, label: 'Daily Reward Amount' },
        ],
      },
    },
  });

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
