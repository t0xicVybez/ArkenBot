/**
 * Reaction roles. Members self-assign roles by reacting to a configured
 * message: adding a mapped emoji grants the role, removing it takes the role
 * away. Supports verify-style and unique (pick-one) modes depending on config.
 */
import {
  type MessageReaction,
  type User,
  type TextChannel,
  EmbedBuilder,
} from 'discord.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { COLORS } from '@arkenbot/shared';
import { logger, swallow} from '../../logger.js';
import { getGuildSettings } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { notifyActionFailure, isPermissionError } from '../../utils/permissionAlert.js';

function emojiKey(reaction: MessageReaction): string | null {
  if (reaction.emoji.id) return `${reaction.emoji.name}:${reaction.emoji.id}`;
  return reaction.emoji.name?.replace(/\uFE0F/g, '').trim() ?? null;
}

export class ReactionRolesModule {

  static async handleReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const guild = reaction.message.guild;
    const emoji = emojiKey(reaction);
    if (!emoji) return;

    const reactionRole = await prisma.reactionRole.findUnique({
      where: { messageId_emoji: { messageId: reaction.message.id, emoji } },
    });

    if (!reactionRole) return;
    if (reactionRole.type === 'remove') return;

    try {
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(reactionRole.roleId);
      if (!role || !role.editable) {
        logger.warn(`ReactionRoles: role ${reactionRole.roleId} not found or not editable`);
        return;
      }

      if (reactionRole.type === 'toggle') {
        if (member.roles.cache.has(reactionRole.roleId)) {
          await member.roles.remove(role, 'Reaction role toggle off');
        } else {
          await member.roles.add(role, 'Reaction role toggle on');
        }
      } else {
        await member.roles.add(role, 'Reaction role add');
      }
    } catch (err) {
      logger.error({ err }, 'ReactionRoles: Failed to add role');
    }
  }

  static async handleReactionRemove(reaction: MessageReaction, user: User): Promise<void> {
    if (user.bot) return;
    if (!reaction.message.guild) return;

    const guild = reaction.message.guild;
    const emoji = emojiKey(reaction);
    if (!emoji) return;

    const reactionRole = await prisma.reactionRole.findUnique({
      where: { messageId_emoji: { messageId: reaction.message.id, emoji } },
    });

    if (!reactionRole) return;
    if (reactionRole.type !== 'toggle' && reactionRole.type !== 'remove') return;

    try {
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(reactionRole.roleId);
      if (!role || !role.editable) return;

      await member.roles.remove(role, 'Reaction role remove');
    } catch (err) {
      logger.error({ err }, 'ReactionRoles: Failed to remove role');
    }
  }

  static async deployPanel(client: BotClient, panelId: string): Promise<void> {
    const panel = await prisma.reactionRolePanel.findUnique({
      where: { id: panelId },
      include: { roles: true },
    });
    if (!panel) return;

    const guild = client.guilds.cache.get(panel.guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
    if (!channel?.isTextBased()) return;

    const loc = await resolveUserLocale({ user: { id: '' }, guildId: panel.guildId, guildLocale: guild.preferredLocale });

    const roleLines = panel.roles.map((r) => {
      const role = guild.roles.cache.get(r.roleId);
      const roleName = role?.name ?? r.roleId;
      const typeLabel =
        r.type === 'add' ? t('reactionRoles.addOnly', loc) : r.type === 'remove' ? t('reactionRoles.removeOnly', loc) : '';
      return `${r.emoji}  <@&${r.roleId}> — **${roleName}**${typeLabel}`;
    });

    const guildSettings = await getGuildSettings(panel.guildId);
    const panelColor = guildSettings?.reactionRolesColor
      ? (parseInt(guildSettings.reactionRolesColor.replace('#', ''), 16) as number)
      : COLORS.INFO;

    const embed = new EmbedBuilder()
      .setColor(panelColor)
      .setTitle(panel.title)
      .setDescription(
        panel.description +
          (roleLines.length > 0
            ? '\n\n' + roleLines.join('\n')
            : '\n\n' + t('reactionRoles.noRoles', loc))
      )
      .setFooter({
        text: t('reactionRoles.footer', loc, { count: panel.roles.length }),
      })
      .setTimestamp();

    try {
      let discordMessageId: string | null = panel.messageId ?? null;
      let failedReactions = 0;
      let lastReactError: unknown = null;

      const reactAndCanonicalise = async (
        msg: import('discord.js').Message,
        role: (typeof panel.roles)[number],
      ): Promise<string | null> => {
        const reactable = (role.emoji ?? '').replace(/([#*0-9])⃣/g, '$1️⃣').trim();
        // A blank emoji would throw "Emoji must be a string or GuildEmoji" at the
        // API; skip it up front. (Deleted custom emoji and missing Add-Reactions
        // permission still surface via the catch below — those are real config
        // issues the admin should see.)
        if (!reactable) {
          failedReactions++;
          logger.debug({ panelId }, 'ReactionRoles: skipping empty panel emoji');
          return null;
        }
        const mr = await msg.react(reactable).catch((err: unknown) => {
          failedReactions++;
          lastReactError = err;
          // 10014 (Unknown Emoji — a deleted/invalid emoji the admin configured)
          // and 50013 (Missing Permissions) are expected misconfigurations the
          // bot can't fix and which recur on every panel re-deploy, so log them
          // at debug to keep them out of the dashboard. Anything else is a real
          // surprise and stays a warning.
          const code = (err as { code?: number })?.code;
          const expected = code === 10014 || code === 50013;
          logger[expected ? 'debug' : 'warn'](
            { err: (err as Error)?.message, emoji: role.emoji, panelId },
            'ReactionRoles: failed to add panel reaction',
          );
          return null;
        });
        if (mr) {

          return mr.emoji.id
            ? `${mr.emoji.name}:${mr.emoji.id}`
            : (mr.emoji.name?.replace(/\uFE0F/g, '').trim() ?? role.emoji);
        }
        return null;
      };

      if (discordMessageId) {
        try {
          const existing = await channel.messages.fetch(discordMessageId);
          await existing.edit({ embeds: [embed] });
          await existing.reactions.removeAll();
          for (const role of panel.roles) {
            const canonical = await reactAndCanonicalise(existing, role);
            if (canonical && canonical !== role.emoji) {
              await prisma.reactionRole.update({ where: { id: role.id }, data: { emoji: canonical } }).catch(swallow);
            }
          }
        } catch {
          discordMessageId = null;
        }
      }

      if (!discordMessageId) {
        const msg = await channel.send({ embeds: [embed] });
        discordMessageId = msg.id;
        for (const role of panel.roles) {
          const canonical = await reactAndCanonicalise(msg, role);
          if (canonical && canonical !== role.emoji) {
            await prisma.reactionRole.update({ where: { id: role.id }, data: { emoji: canonical } }).catch(swallow);
          }
        }
      }

      await prisma.reactionRolePanel.update({
        where: { id: panelId },
        data: { messageId: discordMessageId },
      });
      await prisma.reactionRole.updateMany({
        where: { panelId },
        data: { messageId: discordMessageId, channelId: panel.channelId },
      });

      if (failedReactions > 0 && lastReactError) {
        await notifyActionFailure(guild, {
          action: 'addReaction',
          error: lastReactError,
          requiredPermission: 'Add Reactions',
          channelId: panel.channelId,
        });
      }

      logger.info(`Deployed reaction role panel ${panelId} in guild ${panel.guildId}`);
    } catch (err) {

      if (isPermissionError(err)) {
        await notifyActionFailure(guild, {
          action: 'sendMessage',
          error: err,
          requiredPermission: 'Send Messages / Add Reactions',
          channelId: panel.channelId,
        });
      } else {
        logger.error({ err }, `Failed to deploy reaction role panel ${panelId}`);
      }
    }
  }

  static async deletePanel(
    client: BotClient,
    guildId: string,
    channelId: string,
    messageId: string | null,
  ): Promise<void> {
    if (!messageId) return;
    try {
      const guild = client.guilds.cache.get(guildId);
      const channel = guild?.channels.cache.get(channelId) as TextChannel | undefined;
      const msg = await channel?.messages.fetch(messageId).catch(swallow);
      if (msg) await msg.delete().catch(swallow);
    } catch (err) {
      logger.error({ err }, 'Failed to delete panel message');
    }
  }
}
