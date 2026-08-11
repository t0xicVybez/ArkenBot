/**
 * /userinfo command — displays account and server membership details for a user,
 * including roles, join date, account creation date, and Nitro boost status.
 */
import {
  MessageFlags,
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { t, resolveUserLocale } from '../../i18n/index.js';

import { swallow } from '../../logger.js';
const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display information about a user')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('The user to look up (defaults to yourself)').setRequired(false)
    ),
  category: 'utility',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    if (!interaction.guild) {
      await interaction.reply({ content: t('common.notInServer', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const member = await interaction.guild.members.fetch(targetUser.id).catch(swallow);

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor ?? COLORS.INFO)
      .setTitle(targetUser.tag)
      .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: t('cmd.userinfo.fieldId', loc), value: targetUser.id, inline: true },
        { name: t('cmd.userinfo.fieldBot', loc), value: targetUser.bot ? t('cmd.userinfo.yes', loc) : t('cmd.userinfo.no', loc), inline: true },
        {
          name: t('cmd.userinfo.fieldCreated', loc),
          value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`,
          inline: true,
        },
      );

    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guild!.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => r.toString())
        .slice(0, 10);

      embed.addFields(
        { name: t('cmd.userinfo.fieldNickname', loc), value: member.nickname ?? t('cmd.userinfo.none', loc), inline: true },
        {
          name: t('cmd.userinfo.fieldJoined', loc),
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:D>`
            : t('cmd.userinfo.unknown', loc),
          inline: true,
        },
        {
          name: t('cmd.userinfo.fieldRoles', loc, { count: member.roles.cache.size - 1 }),
          value: roles.length > 0 ? roles.join(', ') : t('cmd.userinfo.none', loc),
        },
      );

      if (member.premiumSince) {
        embed.addFields({
          name: t('cmd.userinfo.fieldBoosting', loc),
          value: `<t:${Math.floor(member.premiumSinceTimestamp! / 1000)}:D>`,
          inline: true,
        });
      }
    }

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
