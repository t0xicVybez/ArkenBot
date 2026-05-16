/**
 * /resetxp command — permanently deletes all XP and level records for the guild.
 * Requires explicit confirmation via the `confirm` option to prevent accidental use.
 */
import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('resetxp')
    .setDescription('Reset all XP and levels for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(o => o.setName('confirm').setDescription('Type true to confirm — this cannot be undone').setRequired(true)),
  category: 'utility',
  cooldown: 30,
  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const confirm = interaction.options.getBoolean('confirm', true);
    if (!confirm) {
      await interaction.reply({ content: 'Reset cancelled.', flags: 64 });
      return;
    }
    const { count } = await prisma.userLevel.deleteMany({ where: { guildId: interaction.guildId! } });
    await interaction.reply({ content: `Reset complete. Deleted XP records for ${count} member${count !== 1 ? 's' : ''}.`, flags: 64 });
  },
};

export default command;
