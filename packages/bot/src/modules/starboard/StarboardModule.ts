

import { EmbedBuilder } from 'discord.js';
import type { MessageReaction, User } from 'discord.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

import { swallow } from '../../logger.js';
export class StarboardModule {

  static async handleReaction(reaction: MessageReaction, user: User): Promise<void> {
    if (!reaction.message.guild) return;
    const guildId = reaction.message.guild.id;

    const config = await prisma.starboardConfig.findUnique({ where: { guildId } }).catch(swallow);
    if (!config?.enabled || !config.channelId) return;
    if (reaction.emoji.name !== config.emoji && reaction.emoji.toString() !== config.emoji) return;
    if (!config.selfStar && user.id === reaction.message.author?.id) return;

    const msg = reaction.message.partial ? await reaction.message.fetch().catch(swallow) : reaction.message;
    if (!msg) return;

    if (msg.channelId === config.channelId) return;

    const starCount = reaction.count ?? 0;

    const existing = await prisma.starboardEntry.findUnique({
      where: { guildId_originalMsgId: { guildId, originalMsgId: msg.id } },
    });

    const starboardChannel = reaction.message.guild.channels.cache.get(config.channelId);
    if (!starboardChannel?.isTextBased()) return;

    if (starCount < config.threshold) {

      if (existing) {
        const starMsg = await starboardChannel.messages.fetch(existing.starboardMsgId).catch(swallow);
        if (starMsg) await starMsg.delete().catch(swallow);
        await prisma.starboardEntry.delete({ where: { id: existing.id } });
      }
      return;
    }

    const settings = await getGuildSettings(guildId);
    const starboardColor = settings?.starboardColor
      ? (parseInt(settings.starboardColor.replace('#', ''), 16) as number)
      : 0xf1c40f;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: reaction.message.guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(starboardColor)
      .setAuthor({ name: msg.author?.username ?? t('starboard.unknownAuthor', loc), iconURL: msg.author?.displayAvatarURL() })
      .setDescription(msg.content || null)
      .addFields({ name: t('starboard.source', loc), value: t('starboard.jumpToMessage', loc, { url: msg.url }) })
      .setTimestamp(msg.createdAt);

    if (msg.attachments.size > 0) {
      const image = msg.attachments.find(a => a.contentType?.startsWith('image/'));
      if (image) embed.setImage(image.url);
    }

    const content = `${config.emoji} **${starCount}** <#${msg.channelId}>`;

    if (existing) {

      const starMsg = await starboardChannel.messages.fetch(existing.starboardMsgId).catch(swallow);
      if (starMsg) await starMsg.edit({ content, embeds: [embed] }).catch(swallow);
      await prisma.starboardEntry.update({ where: { id: existing.id }, data: { starCount } });
    } else {

      const starMsg = await starboardChannel.send({ content, embeds: [embed] });
      await prisma.starboardEntry.create({
        data: {
          guildId,
          originalMsgId: msg.id,
          originalChanId: msg.channelId,
          starboardMsgId: starMsg.id,
          authorId: msg.author?.id ?? '',
          starCount,
        },
      });
    }
  }
}
