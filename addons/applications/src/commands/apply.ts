import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getForms } from '../utils/storage.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Submit an application')
    .addStringOption((o) =>
      o.setName('form').setDescription('Which application to submit').setRequired(true).setAutocomplete(true),
    ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const formId = interaction.options.getString('form', true);
    const forms = await getForms(ctx.storage, interaction.guildId!);
    const form = forms.find((f) => f.id === formId && f.enabled);

    if (!form) {
      const loc = await ctx.resolveLocale(interaction);
      await interaction.reply({ content: ctx.t('notFoundOrClosed', loc), flags: MessageFlags.Ephemeral });
      return;
    }

    const modalFields = form.fields.slice(0, 5);
    const modal = new ModalBuilder()
      .setCustomId(`app:submit:${form.id}`)
      .setTitle(form.name.slice(0, 45));

    for (const field of modalFields) {
      const input = new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label.slice(0, 45))
        .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(field.required);
      if (field.placeholder) input.setPlaceholder(field.placeholder.slice(0, 100));
      if (field.minLength) input.setMinLength(field.minLength);
      if (field.maxLength) input.setMaxLength(field.maxLength);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    await interaction.showModal(modal);
  },

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    const forms = await getForms(ctx.storage, interaction.guildId!);
    const query = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      forms
        .filter((f) => f.enabled && f.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((f) => ({ name: f.name, value: f.id })),
    );
  },
};

export default command;
