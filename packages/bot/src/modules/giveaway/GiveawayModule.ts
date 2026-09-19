/**
 * Posts the Discord announcement for a giveaway that was created outside a slash
 * command (currently the web dashboard). The dashboard writes the giveaway row
 * and publishes a `giveaway:start` Redis event; without this, the row exists but
 * no message is ever posted, so members can't enter and the end-job finds no
 * 🎉 reaction to draw winners from.
 */
import { EmbedBuilder, type TextChannel } from 'discord.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { logger, swallow } from '../../logger.js';
import { notifyActionFailure, isPermissionError } from '../../utils/permissionAlert.js';

export class GiveawayModule {
  /**
   * Posts the giveaway embed to its channel and seeds the 🎉 entry reaction,
   * then stores the resulting message id. Idempotent: a giveaway that has
   * already been posted or ended is skipped.
   */
  static async post(client: BotClient, giveawayId: string): Promise<void> {
    const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(swallow);
    if (!giveaway || giveaway.ended || giveaway.messageId) return;

    const guild = client.guilds.cache.get(giveaway.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(giveaway.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });

    const guildSettings = await getGuildSettings(guild.id);
    const giveawayColor = guildSettings?.giveawayColor
      ? (parseInt(guildSettings.giveawayColor.replace('#', ''), 16) as number)
      : 0xf1c40f;

    // Bonus entries are stored as [{ roleId, bonusEntries }]; tolerate the older
    // dashboard shape ({ roleId, entries }) for display too.
    const bonus = Array.isArray(giveaway.bonusRoleEntries)
      ? (giveaway.bonusRoleEntries[0] as { roleId?: string; bonusEntries?: number; entries?: number } | undefined)
      : undefined;

    let description =
      `${t('cmd.giveaway.fieldPrize', loc, { prize: giveaway.prize })}\n` +
      `${t('cmd.giveaway.fieldWinners', loc, { count: giveaway.winnersCount })}\n` +
      `${t('cmd.giveaway.fieldEnds', loc, { time: `<t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R>` })}`;
    if (giveaway.requiredRoleId) description += `\n${t('cmd.giveaway.fieldRequiredRole', loc, { role: `<@&${giveaway.requiredRoleId}>` })}`;
    if (bonus?.roleId) description += `\n${t('cmd.giveaway.fieldBonus', loc, { role: `<@&${bonus.roleId}>`, count: bonus.bonusEntries ?? bonus.entries ?? 1 })}`;
    description += `\n\n${t('cmd.giveaway.enterPrompt', loc)}`;

    const embed = new EmbedBuilder()
      .setTitle(t('cmd.giveaway.title', loc))
      .setDescription(description)
      .setColor(giveawayColor)
      .setFooter({ text: t('cmd.giveaway.winnersFooter', loc, { count: giveaway.winnersCount }) })
      .setTimestamp(giveaway.endsAt);

    try {
      const msg = await channel.send({ embeds: [embed] });
      await msg.react('🎉').catch(swallow);
      await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: msg.id } });
      logger.info(`Posted dashboard giveaway ${giveaway.id} in guild ${guild.id}`);
    } catch (err) {
      if (isPermissionError(err)) {
        await notifyActionFailure(guild, {
          action: 'sendMessage',
          error: err,
          requiredPermission: 'Send Messages / Add Reactions',
          channelId: giveaway.channelId,
        });
      } else {
        logger.error({ err, giveawayId }, 'Failed to post dashboard giveaway');
      }
    }
  }
}
