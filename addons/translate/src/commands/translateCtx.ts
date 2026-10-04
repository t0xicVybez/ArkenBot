import {
  ContextMenuCommandBuilder, ApplicationCommandType, EmbedBuilder, MessageFlags,
  type ChatInputCommandInteraction, type ContextMenuCommandInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { translate, isTranslateAvailable, langName, localeToLt } from '../service.js';

const command: AddonCommandDefinition = {
  data: new ContextMenuCommandBuilder().setName('Translate').setType(ApplicationCommandType.Message),

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext) {
    if (!interaction.isMessageContextMenuCommand()) return;
    const loc = await ctx.resolveLocale(interaction);
    if (!isTranslateAvailable()) {
      await interaction.reply({ content: ctx.t('unavailable', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    const content = interaction.targetMessage.content;
    if (!content?.trim()) {
      await interaction.reply({ content: ctx.t('noText', loc), flags: MessageFlags.Ephemeral });
      return;
    }
    const target = localeToLt(loc);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { text: out, detected } = await translate(content.slice(0, 1500), target);
      if (detected === target) {
        await interaction.editReply({ content: ctx.t('alreadyIn', loc, { lang: langName(target) }) });
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription((out || '—').slice(0, 2000))
        .setFooter({ text: ctx.t('translatedFrom', loc, { lang: langName(detected) }) });
      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply({ content: ctx.t('failed', loc) });
    }
  },
};

export default command;
