/**
 * The /triage command for the tickets addon.
 */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { generateTriage } from '../events/interaction.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('triage')
    .setDescription('AI summary, urgency, and a suggested reply for the current ticket (staff only)')
    .setDMPermission(false) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isChatInputCommand()) return;
    await generateTriage(ctx, interaction, interaction.channelId);
  },
};

export default command;
