/**
 * /report-setup command — admin command to configure report channel.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import type { Prisma } from '@prisma/client';
import { invalidateSettingsCache } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('report-setup')
    .setDescription('Configure the member report system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Channel where reports will be sent')
        .setRequired(true)
    ),
  category: 'community',
  userPermissions: [PermissionFlagsBits.Administrator],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.options.getChannel('channel', true);

    const settings = await prisma.guildSettings.findUnique({ where: { guildId: interaction.guildId! } });
    const extended = ((settings?.extended ?? {}) as Record<string, unknown>);
    extended.reportConfig = { channelId: channel.id };

    await prisma.guildSettings.update({
      where: { guildId: interaction.guildId! },
      data: { extended: extended as Prisma.InputJsonValue },
    });
    await invalidateSettingsCache(interaction.guildId!);

    await interaction.editReply({
      embeds: [successEmbed('Report System Configured', `Reports will now be sent to <#${channel.id}>.`)],
    });
  },
};

export default command;
