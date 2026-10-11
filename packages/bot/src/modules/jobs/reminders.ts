/** reminders scheduler job(s) — extracted from BackgroundJobs (P3 god-file split). */
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';

export async function runReminders(client: BotClient): Promise<void> {
  const now = new Date();
  try {
    const due = await prisma.reminder.findMany({
      where: { sent: false, remindAt: { lte: now } },
    });
    for (const reminder of due) {
      const channel = client.channels.cache.get(reminder.channelId);
      if (channel?.isTextBased() && 'send' in channel) {
        const loc = await resolveUserLocale({ user: { id: reminder.userId } });
        await (channel as import('discord.js').TextChannel).send({ content: t('reminders.deliver', loc, { user: `<@${reminder.userId}>`, message: reminder.message }) }).catch(swallow);
      }
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
    }
  } catch (err) {
    logger.error({ err }, 'Reminder delivery failed');
  }
}
