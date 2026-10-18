/**
 * Security alerts posted to a guild from the dashboard surface. Currently: a
 * dashboard-action flood (one actor making an abnormal burst of setting changes
 * to a guild), the web-surface counterpart to anti-nuke. Reuses the same
 * channel/role config as permission alerts (modLog → log channel, gated on
 * permissionAlertsEnabled, pinging permissionAlertRoleId).
 */
import { EmbedBuilder } from 'discord.js';
import type { BotClient } from '../client.js';
import { logger, swallow } from '../logger.js';
import { getGuildSettings } from './settings.js';
import { t, resolveUserLocale } from '../i18n/index.js';

export async function notifyDashboardFlood(
  client: BotClient,
  guildId: string,
  userId: string,
  count: number,
  windowSeconds: number,
): Promise<void> {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const settings = await getGuildSettings(guildId);
    if (!settings || settings.permissionAlertsEnabled === false) return;

    const channelId = settings.modLogChannelId ?? settings.logChannelId;
    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: guild.preferredLocale });
    const roleId = settings.permissionAlertRoleId;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(t('security.dashboardFloodTitle', loc))
      .setDescription(t('security.dashboardFloodDescription', loc, { user: `<@${userId}>`, count, seconds: windowSeconds }))
      .setFooter({ text: t('security.dashboardFloodFooter', loc) })
      .setTimestamp();

    await channel
      .send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [embed],
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      })
      .catch(swallow);

    logger.warn({ guildId, userId, count, windowSeconds }, 'Dashboard action flood alert sent');
  } catch (e) {
    logger.debug({ err: e, guildId }, 'notifyDashboardFlood internal error');
  }
}
