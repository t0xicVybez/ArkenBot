/**
 * /forum-setup command — admin configuration for forum post management.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import type { Prisma } from '@prisma/client';
import { invalidateSettingsCache } from '../../utils/settings.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

interface ForumChannelConfig {
  requireTag?: boolean;
  autoTagId?: string | null;
  templateMessage?: string | null;
}

interface ForumManagementConfig {
  channels: Record<string, ForumChannelConfig>;
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('forum-setup')
    .setDescription('Configure forum post management')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set-template')
        .setDescription('Set a template message to post in new threads')
        .addChannelOption(o => o.setName('channel').setDescription('The forum channel').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Template message content').setRequired(true).setMaxLength(2000))
    )
    .addSubcommand(sub =>
      sub.setName('set-auto-tag')
        .setDescription('Set a tag to automatically apply to new threads')
        .addChannelOption(o => o.setName('channel').setDescription('The forum channel').setRequired(true))
        .addStringOption(o => o.setName('tag-id').setDescription('The tag ID to apply automatically').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Remove forum configuration for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('The forum channel to clear').setRequired(true))
    ),
  category: 'utility',
  userPermissions: [PermissionFlagsBits.Administrator],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ flags: 64 });

    const loc = await resolveUserLocale(interaction);
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel', true);

    // Verify it's a forum channel (type 15 = GuildForum)
    if (sub !== 'clear' && channel.type !== ChannelType.GuildForum) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.forum.invalidChannelTitle', loc), t('cmd.forum.invalidChannel', loc))] });
      return;
    }

    const settings = await prisma.guildSettings.findUnique({ where: { guildId: interaction.guildId! } });
    const extended = ((settings?.extended ?? {}) as Record<string, unknown>);
    const forumConfig = (extended.forumManagement ?? { channels: {} }) as ForumManagementConfig;
    if (!forumConfig.channels) forumConfig.channels = {};

    if (sub === 'set-template') {
      const message = interaction.options.getString('message', true);
      forumConfig.channels[channel.id] = {
        ...(forumConfig.channels[channel.id] ?? {}),
        templateMessage: message,
      };

      extended.forumManagement = forumConfig;
      await prisma.guildSettings.update({ where: { guildId: interaction.guildId! }, data: { extended: extended as Prisma.InputJsonValue } });
      await invalidateSettingsCache(interaction.guildId!);

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.forum.templateSetTitle', loc), t('cmd.forum.templateSet', loc, { channel: `<#${channel.id}>` }))],
      });
    }

    if (sub === 'set-auto-tag') {
      const tagId = interaction.options.getString('tag-id', true);
      forumConfig.channels[channel.id] = {
        ...(forumConfig.channels[channel.id] ?? {}),
        autoTagId: tagId,
      };

      extended.forumManagement = forumConfig;
      await prisma.guildSettings.update({ where: { guildId: interaction.guildId! }, data: { extended: extended as Prisma.InputJsonValue } });
      await invalidateSettingsCache(interaction.guildId!);

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.forum.autoTagSetTitle', loc), t('cmd.forum.autoTagSet', loc, { tag: tagId, channel: `<#${channel.id}>` }))],
      });
    }

    if (sub === 'clear') {
      delete forumConfig.channels[channel.id];
      extended.forumManagement = forumConfig;
      await prisma.guildSettings.update({ where: { guildId: interaction.guildId! }, data: { extended: extended as Prisma.InputJsonValue } });
      await invalidateSettingsCache(interaction.guildId!);

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.forum.clearedTitle', loc), t('cmd.forum.cleared', loc, { channel: `<#${channel.id}>` }))],
      });
    }
  },
};

export default command;
