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

/**
 * Returns the canonical emoji key matching what the API stores in the DB:
 *   - Custom emoji  → "name:id"
 *   - Unicode emoji → stripped Unicode (no FE0F variation selectors)
 */
function emojiKey(reaction: MessageReaction): string | null {
  if (reaction.emoji.id) return `${reaction.emoji.name}:${reaction.emoji.id}`;
  return reaction.emoji.name?.replace(/\uFE0F/g, '').trim() ?? null;
}

export class ReactionRolesModule {
  /**
   * Grants or toggles a role when a user adds a reaction to a configured panel message.
   *
   * - `add` mode: always grants the role.
   * - `toggle` mode: grants the role if the user doesn't already have it, removes it otherwise.
   * - `remove` mode: no action on reaction-add; role is only removed when the reaction is removed.
   *
   * Silently skips if the bot cannot edit the role (e.g. the role is above the bot in the hierarchy).
   */
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

  /**
   * Removes a role when a user takes back their reaction on a configured panel message.
   * Only acts on `toggle` and `remove`-mode entries; `add`-only roles are unaffected
   * by reaction removal.
   */
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

  // ── Panel management ──────────────────────────────────────────────

  /**
   * Sends or updates the reaction role panel embed in the configured channel.
   * After posting, the bot reacts with each configured emoji so members can
   * click them directly. If the panel has been posted before (tracked by
   * `messageId`), the existing message is edited in place; if the fetch fails
   * (e.g. the message was deleted), a new message is posted instead.
   *
   * Emoji stored in the database are normalised to the canonical form Discord
   * uses in reaction events — any mismatch between the stored value and the
   * resolved form is corrected in the database automatically.
   */
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

      // React to msg and return the canonical emoji key Discord uses in events
      const reactAndCanonicalise = async (
        msg: import('discord.js').Message,
        role: (typeof panel.roles)[number],
      ): Promise<string> => {
        const mr = await msg.react(role.emoji).catch(swallow);
        if (mr) {
          // Use the emoji Discord resolved to — this is what reaction events return
          return mr.emoji.id
            ? `${mr.emoji.name}:${mr.emoji.id}`
            : (mr.emoji.name?.replace(/\uFE0F/g, '').trim() ?? role.emoji);
        }
        return role.emoji;
      };

      if (discordMessageId) {
        try {
          const existing = await channel.messages.fetch(discordMessageId);
          await existing.edit({ embeds: [embed] });
          await existing.reactions.removeAll();
          for (const role of panel.roles) {
            const canonical = await reactAndCanonicalise(existing, role);
            if (canonical !== role.emoji) {
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
          if (canonical !== role.emoji) {
            await prisma.reactionRole.update({ where: { id: role.id }, data: { emoji: canonical } }).catch(swallow);
          }
        }
      }

      // Persist messageId on the panel and all its linked roles
      await prisma.reactionRolePanel.update({
        where: { id: panelId },
        data: { messageId: discordMessageId },
      });
      await prisma.reactionRole.updateMany({
        where: { panelId },
        data: { messageId: discordMessageId, channelId: panel.channelId },
      });

      logger.info(`Deployed reaction role panel ${panelId} in guild ${panel.guildId}`);
    } catch (err) {
      logger.error({ err }, `Failed to deploy reaction role panel ${panelId}`);
    }
  }

  /**
   * Deletes the Discord message for a reaction role panel when the panel is
   * removed from the database. Failures (e.g. message already deleted) are
   * logged but do not throw, so the caller's database delete always succeeds.
   */
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
