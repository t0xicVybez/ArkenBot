import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { generateTriage } from '../events/interaction.js';

/**
 * Standalone `/triage` command. Kept separate from `/ticket` (rather than a
 * subcommand) so it can be restricted independently in Commands → Role
 * Permissions — command permissions apply per top-level command, not per
 * subcommand. Run inside a ticket channel; the bot still enforces staff-only at
 * runtime regardless of how permissions are configured.
 */
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
