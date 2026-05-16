import 'dotenv/config';
import { prisma } from '../database.js';
import { resolveRoleMentions } from '../utils/roleMentions.js';

async function main() {
  console.log('Scanning stream alerts for @role-name mentions...');

  const alerts = await prisma.streamAlert.findMany({
    where: { message: { contains: '@' } },
    select: { id: true, guildId: true, message: true },
  });

  if (alerts.length === 0) {
    console.log('No stream alerts found with @ mentions. Nothing to update.');
    return;
  }

  let updatedCount = 0;
  for (const alert of alerts) {
    const resolvedMessage = await resolveRoleMentions(alert.guildId, alert.message ?? undefined);
    if (resolvedMessage && resolvedMessage !== alert.message) {
      await prisma.streamAlert.update({
        where: { id: alert.id },
        data: { message: resolvedMessage },
      });
      updatedCount += 1;
      console.log(`Updated alert ${alert.id} in guild ${alert.guildId}`);
    }
  }

  console.log(`Done. ${updatedCount} alert(s) updated.`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
