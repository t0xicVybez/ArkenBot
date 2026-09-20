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

  // example-economy is retired (superseded by the core economy) and no longer
  // seeded; the core economy is the real feature.

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
