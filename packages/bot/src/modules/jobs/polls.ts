/** polls scheduler job(s) — extracted from BackgroundJobs (P3 god-file split). */
import { type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { buildPollEmbed, buildPollComponents } from '../../commands/utility/poll.js';
import { generatePollChart } from '../../utils/pollChart.js';
import type { BotClient } from '../../client.js';

export async function closePolls(client: BotClient): Promise<void> {
  const now = new Date();
  try {
    const expired = await prisma.poll.findMany({
      where: { closed: false, endsAt: { not: null, lte: now } },
      include: { votes: true },
    });
    for (const poll of expired) {
      await prisma.poll.update({ where: { id: poll.id }, data: { closed: true } });

      const guild = client.guilds.cache.get(poll.guildId);
      const channel = guild?.channels.cache.get(poll.channelId) as TextChannel | undefined;
      if (!guild || !channel?.isTextBased() || !poll.messageId) continue;

      const options = poll.options as string[];
      const loc = await resolveUserLocale({ user: { id: '' }, guildId: poll.guildId, guildLocale: guild.preferredLocale });
      try {
        const embed = buildPollEmbed(poll.question, options, poll.votes, poll.endsAt, loc)
          .setTitle(`📊 ${t('cmd.poll.ended', loc, { question: poll.question })}`)
          .setColor(0x57f287);
        const chart = await generatePollChart(poll.question, options, poll.votes).catch(swallow);
        const msg = await channel.messages.fetch(poll.messageId);
        await msg.edit({
          embeds: [embed],
          components: buildPollComponents(poll.id, options, true, loc),
          files: chart ? [{ attachment: chart, name: 'poll-results.png' }] : [],
        });
      } catch { /* poll message may have been deleted */ }
    }
  } catch (err) {
    logger.error({ err }, 'Poll auto-close failed');
  }
}
