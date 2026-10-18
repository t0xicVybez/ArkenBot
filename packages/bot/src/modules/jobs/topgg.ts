
/**
 * top.gg integration jobs: `postTopggStats` reports our server count to the
 * bot list (only when a TOPGG_TOKEN is set), and `runTopggReminders` nudges
 * users who asked to be reminded when they can vote again.
 */
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import type { BotClient } from '../../client.js';
import { isLeaderShard, totalGuildCount } from '../../utils/sharding.js';

export async function postTopggStats(client: BotClient): Promise<void> {
  const token = process.env.TOPGG_TOKEN;
  if (!token || !client.user) return;
  // Global: only one shard posts, and it posts the FLEET total — otherwise each
  // shard would overwrite top.gg with its own partial count.
  if (!isLeaderShard(client)) return;
  try {
    const serverCount = await totalGuildCount(client);
    const res = await fetch(`https://top.gg/api/bots/${client.user.id}/stats`, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ server_count: serverCount }),
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
  // Global DM queue — run on one shard only, or both shards DM each voter.
  if (!isLeaderShard(client)) return;
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

      }
      await prisma.topggVoter.update({ where: { userId: voter.userId }, data: { reminderSent: true } }).catch(swallow);
    }
  } catch (err) {
    logger.warn({ err }, 'top.gg reminder sweep failed');
  }
}
