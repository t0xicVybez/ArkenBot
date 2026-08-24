/** /prestige — reset to level 0 in exchange for a permanent prestige rank. */
import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { COLORS } from '@arkenbot/shared';
import { prisma } from '../../database.js';
import { errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { getGuildSettings } from '../../utils/settings.js';

const command: BotCommand = {
  data: new SlashCommandBuilder().setName('prestige').setDescription('Reset your level for a permanent prestige rank'),
  category: 'leveling',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply();
    const loc = await resolveUserLocale(interaction);
    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed(t('common.error', loc), t('common.notInServer', loc))] });
      return;
    }
    const settings = await getGuildSettings(interaction.guild.id);
    if (!settings?.levelingEnabled || !settings.prestigeEnabled) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.prestige.disabledTitle', loc), t('cmd.prestige.disabled', loc))] });
      return;
    }
    const row = await prisma.userLevel.findUnique({ where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } } });
    const required = settings.prestigeLevel;
    if (!row || row.level < required) {
      await interaction.editReply({ embeds: [errorEmbed(t('cmd.prestige.tooLowTitle', loc), t('cmd.prestige.tooLow', loc, { level: String(required), current: String(row?.level ?? 0) }))] });
      return;
    }
    const newPrestige = row.prestige + 1;
    await prisma.userLevel.update({
      where: { guildId_userId: { guildId: interaction.guild.id, userId: interaction.user.id } },
      data: { xp: 0, level: 0, prestige: newPrestige },
    });
    const embed = new EmbedBuilder().setColor(COLORS.WARNING)
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setTitle(t('cmd.prestige.title', loc))
      .setDescription(t('cmd.prestige.desc', loc, { prestige: String(newPrestige) }))
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
