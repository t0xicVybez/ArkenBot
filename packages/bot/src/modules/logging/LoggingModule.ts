/**
 * Centralises all structured logging for guild events: moderation actions,
 * message edits and deletions, and member join/leave events. Each log method
 * writes an embed to the configured log channel and persists a `LogEntry` record
 * to the database. Moderation actions and member joins are additionally broadcast
 * to the dashboard via the Redis pub channel.
 */

import {
  type Guild,
  type TextChannel,
  EmbedBuilder,
  type GuildMember,
  type Message,
} from 'discord.js';
import { COLORS, LOG_TYPES, type LogType } from '@arkenbot/shared';
import type { ModerationAction } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';
import { logger, swallow} from '../../logger.js';
import { pub } from '../../redis.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

export class LoggingModule {
  /**
   * Resolves a log channel from the guild's channel cache.
   * Returns `null` when the channel ID is absent or the channel is not text-based.
   */
  static async getLogChannel(guild: Guild, channelId: string | null | undefined): Promise<TextChannel | null> {
    if (!channelId) return null;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return null;
    return channel as TextChannel;
  }

  /**
   * Sends a log embed to the appropriate channel and persists a `LogEntry` record.
   * Moderation- and automod-type events are routed to `modLogChannelId` when
   * configured, falling back to the general `logChannelId`.
   */
  static async log(guild: Guild, type: LogType, embed: EmbedBuilder, data: Record<string, unknown> = {}): Promise<void> {
    try {
      const settings = await getGuildSettings(guild.id);
      if (!settings?.loggingEnabled) return;

      // Moderation and automod events go to the dedicated mod-log channel when one
      // is configured; all other events go to the general log channel.
      const logChannelId = type.startsWith('member_') || type === 'automod'
        ? (settings.modLogChannelId ?? settings.logChannelId)
        : settings.logChannelId;

      const channel = await this.getLogChannel(guild, logChannelId);
      if (channel) {
        if (settings.loggingColor) embed.setColor(settings.loggingColor as `#${string}`);
        await channel.send({ embeds: [embed] }).catch(swallow);
      }

      const userId = (data.userId ?? data.authorId) as string | undefined;
      await prisma.logEntry.create({
        data: {
          guildId: guild.id,
          type,
          userId: userId ?? null,
          data: data as object,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to log event');
    }
  }

  /** Logs a moderation action and broadcasts it to the dashboard via Redis pub/sub. */
  static async logModerationAction(guild: Guild, action: ModerationAction): Promise<void> {
    const typeEmojis: Record<string, string> = {
      ban: '🔨', tempban: '⏱️', kick: '👢', mute: '🔇',
      unmute: '🔊', unban: '✅', warn: '⚠️',
    };

    const typeColors: Record<string, number> = {
      ban: COLORS.ERROR, tempban: COLORS.ERROR, kick: COLORS.WARNING,
      mute: COLORS.WARNING, unmute: COLORS.SUCCESS, unban: COLORS.SUCCESS, warn: 0xffa500,
    };

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(typeColors[action.type] ?? COLORS.NEUTRAL)
      .setTitle(`${typeEmojis[action.type] ?? '📋'} ${action.type.toUpperCase()}`)
      .addFields(
        { name: t('logging.user', loc), value: `${action.userTag} (${action.userId})`, inline: true },
        { name: t('logging.moderator', loc), value: `${action.moderatorTag}`, inline: true },
        { name: t('logging.reason', loc), value: action.reason ?? t('logging.noReason', loc) },
      )
      .setTimestamp();

    const logType = `member_${action.type}` as LogType;
    await this.log(guild, logType, embed, {
      type: action.type,
      userId: action.userId,
      userTag: action.userTag,
      moderatorId: action.moderatorId,
      reason: action.reason,
    });

    // Broadcast to dashboard via WebSocket
    await pub.publish('api:ws:broadcast', JSON.stringify({
      type: 'moderation:action',
      guildId: action.guildId,
      data: { type: action.type, userTag: action.userTag, moderatorTag: action.moderatorTag },
      timestamp: Date.now(),
    })).catch(swallow);
  }

  static async logMessageDelete(guild: Guild, message: Message): Promise<void> {
    if (message.author.bot) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(t('logging.messageDeleted', loc))
      .addFields(
        { name: t('logging.author', loc), value: `${message.author.tag} (${message.author.id})`, inline: true },
        { name: t('logging.channel', loc), value: `<#${message.channelId}>`, inline: true },
      )
      .setTimestamp();

    if (message.content) {
      embed.addFields({ name: t('logging.content', loc), value: message.content.slice(0, 1024) });
    }

    await this.log(guild, LOG_TYPES.MESSAGE_DELETE, embed, {
      authorId: message.author.id,
      authorTag: message.author.tag,
      channelId: message.channelId,
      content: message.content,
    });
  }

  static async logMessageEdit(guild: Guild, oldMessage: Message, newMessage: Message): Promise<void> {
    if (newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(COLORS.WARNING)
      .setTitle(t('logging.messageEdited', loc))
      .setURL(newMessage.url)
      .addFields(
        { name: t('logging.author', loc), value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
        { name: t('logging.channel', loc), value: `<#${newMessage.channelId}>`, inline: true },
        { name: t('logging.before', loc), value: (oldMessage.content ?? t('logging.noContent', loc)).slice(0, 512) },
        { name: t('logging.after', loc), value: (newMessage.content ?? t('logging.noContent', loc)).slice(0, 512) },
      )
      .setTimestamp();

    await this.log(guild, LOG_TYPES.MESSAGE_EDIT, embed, {
      authorId: newMessage.author.id,
      authorTag: newMessage.author.tag,
      channelId: newMessage.channelId,
      before: oldMessage.content,
      after: newMessage.content,
    });
  }

  static async logMemberJoin(guild: Guild, member: GuildMember): Promise<void> {
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(COLORS.SUCCESS)
      .setTitle(t('logging.memberJoined', loc))
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: t('logging.user', loc), value: `${member.user.tag} (${member.id})`, inline: true },
        { name: t('logging.accountAge', loc), value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t('logging.memberCount', loc), value: `${guild.memberCount}`, inline: true },
      )
      .setTimestamp();

    await this.log(guild, LOG_TYPES.MEMBER_JOIN, embed, {
      userId: member.id,
      userTag: member.user.tag,
      memberCount: guild.memberCount,
    });

    // Broadcast to dashboard via WebSocket
    await pub.publish('api:ws:broadcast', JSON.stringify({
      type: 'member:join',
      guildId: guild.id,
      data: { userTag: member.user.tag, memberCount: guild.memberCount },
      timestamp: Date.now(),
    })).catch(swallow);
  }

  static async logMemberLeave(guild: Guild, member: GuildMember): Promise<void> {
    const loc = await resolveUserLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const embed = new EmbedBuilder()
      .setColor(COLORS.ERROR)
      .setTitle(t('logging.memberLeft', loc))
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: t('logging.user', loc), value: `${member.user.tag} (${member.id})`, inline: true },
        { name: t('logging.joined', loc), value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : t('logging.unknown', loc), inline: true },
        { name: t('logging.memberCount', loc), value: `${guild.memberCount}`, inline: true },
      )
      .setTimestamp();

    await this.log(guild, LOG_TYPES.MEMBER_LEAVE, embed, {
      userId: member.id,
      userTag: member.user.tag,
      memberCount: guild.memberCount,
    });
  }
}
