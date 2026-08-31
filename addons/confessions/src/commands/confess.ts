import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getConfig } from '../utils/storage.js';
import { cooldownRemaining } from '../utils/cooldown.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Anonymously send a confession to this server'),

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!guildId) {
      await interaction.reply({ content: t('guildOnly'), flags: MessageFlags.Ephemeral });
      return;
    }

    const config = await getConfig(ctx.storage, guildId);
    if (!config.channelId) {
      await interaction.reply({ content: t('notConfigured'), flags: MessageFlags.Ephemeral });
      return;
    }
    if (config.blocked.includes(interaction.user.id)) {
      await interaction.reply({ content: t('blocked'), flags: MessageFlags.Ephemeral });
      return;
    }
    const wait = cooldownRemaining(guildId, interaction.user.id, config.cooldownSec);
    if (wait > 0) {
      await interaction.reply({ content: t('cooldown', { seconds: wait }), flags: MessageFlags.Ephemeral });
      return;
    }

    const modal = new ModalBuilder().setCustomId('confess:submit').setTitle(t('modalTitle'));
    const input = new TextInputBuilder()
      .setCustomId('content')
      .setLabel(t('modalLabel'))
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(1)
      .setMaxLength(1000)
      .setRequired(true)
      .setPlaceholder(t('modalPlaceholder'));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
  },
};

export default command;
