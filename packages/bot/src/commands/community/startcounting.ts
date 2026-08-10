/**
 * /startcounting command — posts a counting-game announcement in the configured
 * counting channel, including current state and configured rule settings.
 */
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { COLORS } from '@arkenbot/shared';

import { swallow } from '../../logger.js';
// Prisma is cast to `any` here because the `countingState` model is generated
// by an addon migration that the shared Prisma client type does not include.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * Retrieves the settings object for the counting addon in a given guild.
 * Returns null if the addon is not installed or not enabled.
 */
async function getCountingSettings(guildId: string): Promise<Record<string, unknown> | null> {
  const ga = await prisma.guildAddon.findFirst({
    where: { guildId, addon: { name: 'counting' }, enabled: true },
    select: { settings: true },
  }).catch(swallow);
  return ga ? (ga.settings as Record<string, unknown>) : null;
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('startcounting')
    .setDescription('Post a counting game announcement in the counting channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'Use this command in a server.')] });
      return;
    }

    const settings = await getCountingSettings(interaction.guild.id);
    if (!settings?.channelId) {
      await interaction.editReply({ embeds: [errorEmbed('Not Configured', 'The Counting addon is not installed or has no channel set. Configure it in the dashboard first.')] });
      return;
    }

    const countingChannel = interaction.guild.channels.cache.get(String(settings.channelId)) as TextChannel | undefined;
    if (!countingChannel?.isTextBased()) {
      await interaction.editReply({ embeds: [errorEmbed('Channel Not Found', 'The configured counting channel no longer exists.')] });
      return;
    }

    const state = await db.countingState.findUnique({
      where: { guildId: interaction.guild.id },
    }).catch(swallow);

    const resetOnFail   = settings.resetOnFail !== false;
    const allowSameUser = settings.allowSameUser === true;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle('🔢 Counting Game')
      .setDescription(
        `The counting game has begun! Start counting from **1** and see how high we can go.\n\n` +
        `Count one number at a time — whoever goes next must send the next number in the sequence.`,
      )
      .addFields(
        { name: 'Current Count', value: `**${state?.currentCount ?? 0}**`, inline: true },
        { name: 'Best Count',    value: `**${state?.bestCount ?? 0}**`,    inline: true },
        { name: '\u200b',        value: '\u200b',                          inline: true },
        { name: 'Reset on Fail',       value: resetOnFail   ? 'Yes' : 'No', inline: true },
        { name: 'Same User Twice',     value: allowSameUser ? 'Yes' : 'No', inline: true },
      )
      .setFooter({ text: `Start at ${(state?.currentCount ?? 0) + 1}` })
      .setTimestamp();

    await countingChannel.send({ embeds: [embed] });
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(`Announcement posted in <#${countingChannel.id}>!`),
    ]});
  },
};

export default command;
