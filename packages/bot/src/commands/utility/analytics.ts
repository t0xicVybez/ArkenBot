import {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { generateAnalyticsImage } from '../../utils/analyticsChart.js';
import { errorEmbed, successEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('View or configure server analytics')
    .addSubcommand(s =>
      s.setName('view')
        .setDescription('Post the 30-day activity and member-flow charts here'),
    )
    .addSubcommand(s =>
      s.setName('set-channel')
        .setDescription('Set the channel for automatic weekly analytics reports')
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Text channel to post reports in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand(s =>
      s.setName('disable')
        .setDescription('Stop automatic weekly analytics reports'),
    ),
  category: 'utility',
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const sub = interaction.options.getSubcommand();
    const loc = await resolveUserLocale(interaction);

    if (sub === 'view') {
      await interaction.deferReply();
      await postAnalytics(interaction.guildId!, interaction);
      return;
    }

    // set-channel and disable require Manage Guild
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [errorEmbed(t('cmd.analytics.missingPermTitle', loc), t('cmd.analytics.missingPerm', loc))],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'set-channel') {
      const channel = interaction.options.getChannel('channel', true);
      await prisma.guildSettings.upsert({
        where:  { guildId: interaction.guildId! },
        update: { analyticsChannelId: channel.id },
        create: { guildId: interaction.guildId!, analyticsChannelId: channel.id },
      });
      await interaction.reply({
        embeds: [successEmbed(t('cmd.analytics.channelSetTitle', loc), t('cmd.analytics.channelSet', loc, { channel: `<#${channel.id}>` }))],
      });
      return;
    }

    if (sub === 'disable') {
      await prisma.guildSettings.updateMany({
        where:  { guildId: interaction.guildId! },
        data:   { analyticsChannelId: null },
      });
      await interaction.reply({
        embeds: [successEmbed(t('cmd.analytics.disabledTitle', loc), t('cmd.analytics.disabled', loc))],
      });
    }
  },
};

export async function postAnalytics(
  guildId: string,
  target: ChatInputCommandInteraction | import('discord.js').TextChannel,
): Promise<void> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await prisma.serverDailyStats.findMany({
    where:   { guildId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const loc = 'deferReply' in target
    ? await resolveUserLocale(target)
    : await resolveUserLocale({ user: { id: '' }, guildId, guildLocale: target.guild?.preferredLocale });

  const image = await generateAnalyticsImage(rows);
  const file  = new AttachmentBuilder(image, { name: 'analytics.png' });

  const totalMessages = rows.reduce((s, r) => s + r.messagesCount, 0);
  const totalCommands = rows.reduce((s, r) => s + r.commandsCount, 0);
  const totalJoins    = rows.reduce((s, r) => s + r.newMembers, 0);
  const totalLeaves   = rows.reduce((s, r) => s + r.leftMembers, 0);

  const embed = new EmbedBuilder()
    .setTitle(t('cmd.analytics.reportTitle', loc))
    .setColor(0x5865f2)
    .addFields(
      { name: t('cmd.analytics.messages', loc),   value: totalMessages.toLocaleString(loc), inline: true },
      { name: t('cmd.analytics.commands', loc),   value: totalCommands.toLocaleString(loc), inline: true },
      { name: '​',        value: '​',                       inline: true },
      { name: t('cmd.analytics.joins', loc),      value: totalJoins.toLocaleString(loc),    inline: true },
      { name: t('cmd.analytics.leaves', loc),     value: totalLeaves.toLocaleString(loc),   inline: true },
      { name: t('cmd.analytics.netGrowth', loc), value: (totalJoins - totalLeaves).toLocaleString(loc), inline: true },
    )
    .setImage('attachment://analytics.png')
    .setTimestamp();

  if ('deferReply' in target) {
    await target.editReply({ embeds: [embed], files: [file] });
  } else {
    await target.send({ embeds: [embed], files: [file] });
  }
}

export default command;
