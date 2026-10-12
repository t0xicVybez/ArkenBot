
import { EmbedBuilder, type TextChannel } from 'discord.js';
import { prisma } from '../../database.js';
import { logger, swallow } from '../../logger.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';
import type { BotClient } from '../../client.js';

export async function checkBirthdays(client: BotClient): Promise<void> {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();

  try {
    const birthdays = await prisma.birthday.findMany({
      where: {
        month,
        day,
        OR: [{ lastNotifiedYear: null }, { lastNotifiedYear: { not: year } }],
      },
    });

    for (const bday of birthdays) {
      await sendBirthdayNotification(client, bday.guildId, bday.userId, year);
    }
  } catch (err) {
    logger.error({ err }, 'Birthday check failed');
  }
}

async function sendBirthdayNotification(
  client: BotClient,
  guildId: string,
  userId: string,
  year: number,
): Promise<void> {
  try {
    const config = await prisma.birthdayConfig.findUnique({ where: { guildId } });
    if (!config?.enabled || !config.channelId) {
      logger.warn({ guildId, userId }, 'Birthday skipped: config not set or disabled');
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn({ guildId, userId }, 'Birthday skipped: guild not in cache');
      return;
    }

    const member = await guild.members.fetch(userId).catch(swallow);
    if (!member) {
      logger.warn({ guildId, userId }, 'Birthday skipped: member not found');
      return;
    }

    const channel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) {
      logger.warn({ guildId, userId, channelId: config.channelId }, 'Birthday skipped: channel not found or not text-based');
      return;
    }

    const message = config.message.replace(/\{user\}/g, `<@${userId}>`);

    const settings = await getGuildSettings(guildId);
    const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: guild.preferredLocale });
    const birthdayColor = settings?.birthdayColor
      ? (parseInt(settings.birthdayColor.replace('#', ''), 16) as number)
      : 0xffc0cb;

    const notifMsg = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(birthdayColor)
          .setTitle(t('birthday.title', loc))
          .setDescription(message)
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp(),
      ],
    });

    if (config.birthdayRoleId) {
      const role = guild.roles.cache.get(config.birthdayRoleId);
      if (role && member.roles.cache.has(role.id) === false) {
        await member.roles.add(role, 'Birthday role').catch(swallow);

        const msUntilTomorrow =
          new Date(Date.UTC(year, new Date().getUTCMonth(), new Date().getUTCDate() + 1)).getTime() -
          Date.now();
        setTimeout(
          () => member.roles.remove(role, 'Birthday role expired').catch(swallow),
          msUntilTomorrow,
        );
      }
    }

    await prisma.birthday.update({
      where: { guildId_userId: { guildId, userId } },
      data: { lastNotifiedYear: year, notificationMessageId: notifMsg.id, notificationChannelId: notifMsg.channelId },
    });

    logger.info({ guildId, userId }, 'Birthday notification sent');
  } catch (err) {
    logger.error({ err, guildId, userId }, 'Failed to send birthday notification');
  }
}
