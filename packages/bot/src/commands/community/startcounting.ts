/**
 * /startcounting command — posts a counting-game announcement in the configured
 * counting channel, including current state and configured rule settings.
 */
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
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
    const loc = await resolveUserLocale(interaction);

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('cmd.startcounting.notInServer', loc))] });
      return;
    }

    const settings = await getCountingSettings(interaction.guild.id);
    if (!settings?.channelId) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.startcounting.notConfiguredTitle', loc), t('cmd.startcounting.notConfigured', loc))] });
      return;
    }

    const countingChannel = interaction.guild.channels.cache.get(String(settings.channelId)) as TextChannel | undefined;
    if (!countingChannel?.isTextBased()) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.startcounting.channelNotFoundTitle', loc), t('cmd.startcounting.channelNotFound', loc))] });
      return;
    }

    const state = await db.countingState.findUnique({
      where: { guildId: interaction.guild.id },
    }).catch(swallow);

    const resetOnFail   = settings.resetOnFail !== false;
    const allowSameUser = settings.allowSameUser === true;

    const embed = new EmbedBuilder()
      .setColor(COLORS.INFO)
      .setTitle(t('cmd.startcounting.title', loc))
      .setDescription(t('cmd.startcounting.description', loc))
      .addFields(
        { name: t('cmd.startcounting.fieldCurrentCount', loc), value: `**${state?.currentCount ?? 0}**`, inline: true },
        { name: t('cmd.startcounting.fieldBestCount', loc),    value: `**${state?.bestCount ?? 0}**`,    inline: true },
        { name: '\u200b',        value: '\u200b',                          inline: true },
        { name: t('cmd.startcounting.fieldResetOnFail', loc),   value: resetOnFail   ? t('cmd.startcounting.yes', loc) : t('cmd.startcounting.no', loc), inline: true },
        { name: t('cmd.startcounting.fieldSameUser', loc),      value: allowSameUser ? t('cmd.startcounting.yes', loc) : t('cmd.startcounting.no', loc), inline: true },
      )
      .setFooter({ text: t('cmd.startcounting.footer', loc, { start: (state?.currentCount ?? 0) + 1 }) })
      .setTimestamp();

    await countingChannel.send({ embeds: [embed] });
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setDescription(t('cmd.startcounting.posted', loc, { channel: `<#${countingChannel.id}>` })),
    ]});
  },
};

export default command;
