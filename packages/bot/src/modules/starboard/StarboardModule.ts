/**
 * Manages the Starboard feature: a dedicated channel that showcases messages
 * that have received enough star reactions from server members. The module
 * handles both adding new entries and keeping existing ones up to date
 * as reactions are added or removed.
 */

import { EmbedBuilder } from 'discord.js';
import type { MessageReaction, User } from 'discord.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

import { swallow } from '../../logger.js';
export class StarboardModule {
  /**
   * Processes a reaction event (add or remove) on any message in the guild.
   * If the reaction matches the configured starboard emoji and the star count
   * meets or exceeds the threshold, the message is posted (or updated) in the
   * starboard channel. If the count drops below the threshold, the starboard
   * post is removed.
   *
   * Self-starring is blocked when `selfStar` is disabled in the config.
   * Messages posted inside the starboard channel itself are never starred
   * to prevent feedback loops.
   */
  static async handleReaction(reaction: MessageReaction, user: User): Promise<void> {
    if (!reaction.message.guild) return;
    const guildId = reaction.message.guild.id;

    const config = await prisma.starboardConfig.findUnique({ where: { guildId } }).catch(swallow);
    if (!config?.enabled || !config.channelId) return;
    if (reaction.emoji.name !== config.emoji && reaction.emoji.toString() !== config.emoji) return;
    if (!config.selfStar && user.id === reaction.message.author?.id) return;

    // Partial messages only contain the ID; fetch the full payload before reading content or attachments.
    const msg = reaction.message.partial ? await reaction.message.fetch().catch(swallow) : reaction.message;
    if (!msg) return;

    // Starring a message inside the starboard channel would create an infinite loop of reposts.
    if (msg.channelId === config.channelId) return;

    const starCount = reaction.count ?? 0;

    const existing = await prisma.starboardEntry.findUnique({
      where: { guildId_originalMsgId: { guildId, originalMsgId: msg.id } },
    });

    const starboardChannel = reaction.message.guild.channels.cache.get(config.channelId);
    if (!starboardChannel?.isTextBased()) return;

    if (starCount < config.threshold) {
      // Star count dropped below threshold — delete the starboard post if one exists.
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
      : 0xf1c40f; // Default: gold

    const loc = await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: reaction.message.guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(starboardColor)
      .setAuthor({ name: msg.author?.username ?? t('starboard.unknownAuthor', loc), iconURL: msg.author?.displayAvatarURL() })
      .setDescription(msg.content || null)
      .addFields({ name: t('starboard.source', loc), value: t('starboard.jumpToMessage', loc, { url: msg.url }) })
      .setTimestamp(msg.createdAt);

    // Attach the first image attachment so the starboard post is visually rich.
    if (msg.attachments.size > 0) {
      const image = msg.attachments.find(a => a.contentType?.startsWith('image/'));
      if (image) embed.setImage(image.url);
    }

    const content = `${config.emoji} **${starCount}** <#${msg.channelId}>`;

    if (existing) {
      // Update the live star count on the existing starboard post.
      const starMsg = await starboardChannel.messages.fetch(existing.starboardMsgId).catch(swallow);
      if (starMsg) await starMsg.edit({ content, embeds: [embed] }).catch(swallow);
      await prisma.starboardEntry.update({ where: { id: existing.id }, data: { starCount } });
    } else {
      // First time this message crosses the threshold — create a new starboard post.
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
