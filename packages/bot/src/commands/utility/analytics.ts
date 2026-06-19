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

    if (sub === 'view') {
      await interaction.deferReply();
      await postAnalytics(interaction.guildId!, interaction);
      return;
    }

    // set-channel and disable require Manage Guild
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [errorEmbed('Missing Permission', 'You need the **Manage Server** permission to configure analytics.')],
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
        embeds: [successEmbed('Analytics Channel Set', `Weekly reports will be posted in <#${channel.id}> every Monday.`)],
      });
      return;
    }

    if (sub === 'disable') {
      await prisma.guildSettings.updateMany({
        where:  { guildId: interaction.guildId! },
        data:   { analyticsChannelId: null },
      });
      await interaction.reply({
        embeds: [successEmbed('Analytics Disabled', 'Weekly analytics reports have been turned off.')],
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

  const image = await generateAnalyticsImage(rows);
  const file  = new AttachmentBuilder(image, { name: 'analytics.png' });

  const totalMessages = rows.reduce((s, r) => s + r.messagesCount, 0);
  const totalCommands = rows.reduce((s, r) => s + r.commandsCount, 0);
  const totalJoins    = rows.reduce((s, r) => s + r.newMembers, 0);
  const totalLeaves   = rows.reduce((s, r) => s + r.leftMembers, 0);

  const embed = new EmbedBuilder()
    .setTitle('Server Analytics — Last 30 Days')
    .setColor(0x5865f2)
    .addFields(
      { name: '💬 Messages',   value: totalMessages.toLocaleString(), inline: true },
      { name: '⌨️ Commands',   value: totalCommands.toLocaleString(), inline: true },
      { name: '​',        value: '​',                       inline: true },
      { name: '📥 Joins',      value: totalJoins.toLocaleString(),    inline: true },
      { name: '📤 Leaves',     value: totalLeaves.toLocaleString(),   inline: true },
      { name: '📈 Net Growth', value: (totalJoins - totalLeaves).toLocaleString(), inline: true },
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
