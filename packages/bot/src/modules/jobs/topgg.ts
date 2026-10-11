/** topgg scheduler job(s) — extracted from BackgroundJobs (P3 god-file split). */
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';

export async function postTopggStats(client: BotClient): Promise<void> {
  const token = process.env.TOPGG_TOKEN;
  if (!token || !client.user) return;
  try {
    const res = await fetch(`https://top.gg/api/bots/${client.user.id}/stats`, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_count: client.guilds.cache.size }),
    });
    if (!res.ok) {
      logger.warn(`top.gg stats post failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    logger.warn(`top.gg stats post failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runTopggReminders(client: BotClient): Promise<void> {
  if (!client.user) return;
  try {
    const due = await prisma.topggVoter.findMany({
      where: { remindersOptIn: true, reminderSent: false, eligibleAt: { lte: new Date() } },
      take: 50,
    });
    if (due.length === 0) return;

    const voteUrl = `https://top.gg/bot/${client.user.id}/vote`;
    for (const voter of due) {
      try {
        const user = await client.users.fetch(voter.userId);
        const loc = await resolveUserLocale({ user: { id: voter.userId } });
        await user.send(
          t('topgg.voteReminder', loc, { bot: client.user.username, url: voteUrl }),
        );
      } catch {
        // DMs closed or user gone — mark as sent anyway so we don't retry every cycle.
      }
      await prisma.topggVoter.update({ where: { userId: voter.userId }, data: { reminderSent: true } }).catch(swallow);
    }
  } catch (err) {
    logger.warn({ err }, 'top.gg reminder sweep failed');
  }
}
