import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getForms, saveForm, deleteForm, generateId } from '../utils/storage.js';
import type { ApplicationField } from '../types.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('app-setup')
    .setDescription('Manage application forms')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new application form')
        .addStringOption((o) => o.setName('name').setDescription('Form name').setRequired(true))
        .addChannelOption((o) => o.setName('review-channel').setDescription('Channel for submissions').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Short description shown to applicants'))
        .addRoleOption((o) => o.setName('accept-role').setDescription('Role to assign on acceptance'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-field')
        .setDescription('Add a question to a form')
        .addStringOption((o) => o.setName('form').setDescription('Form to edit').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('label').setDescription('Question label').setRequired(true))
        .addStringOption((o) =>
          o.setName('style').setDescription('Input style').setRequired(true)
            .addChoices({ name: 'Short', value: 'short' }, { name: 'Paragraph', value: 'paragraph' })
        )
        .addBooleanOption((o) => o.setName('required').setDescription('Is this field required?'))
        .addStringOption((o) => o.setName('placeholder').setDescription('Placeholder text'))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List all forms in this server'))
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a form')
        .addStringOption((o) => o.setName('form').setDescription('Form to delete').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable a form')
        .addStringOption((o) => o.setName('form').setDescription('Form to toggle').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enable or disable?').setRequired(true))
    ) as unknown as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'create') {
      const name = interaction.options.getString('name', true);
      const reviewChannel = interaction.options.getChannel('review-channel', true);
      const description = interaction.options.getString('description') ?? '';
      const acceptRole = interaction.options.getRole('accept-role');

      const form = {
        id: generateId(),
        guildId,
        name,
        description,
        fields: [] as ApplicationField[],
        reviewChannelId: reviewChannel.id,
        ...(acceptRole ? { acceptRoleId: acceptRole.id } : {}),
        enabled: true,
        createdAt: new Date().toISOString(),
      };

      await saveForm(ctx.storage, guildId, form);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('Form Created')
            .setDescription(`**${name}** created. Use \`/app-setup add-field\` to add questions.`)
            .addFields(
              { name: 'Form ID', value: form.id, inline: true },
              { name: 'Review Channel', value: `<#${reviewChannel.id}>`, inline: true },
              ...(acceptRole ? [{ name: 'Accept Role', value: `<@&${acceptRole.id}>`, inline: true }] : []),
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    else if (sub === 'add-field') {
      const formId = interaction.options.getString('form', true);
      const label = interaction.options.getString('label', true);
      const style = interaction.options.getString('style', true) as 'short' | 'paragraph';
      const required = interaction.options.getBoolean('required') ?? true;
      const placeholder = interaction.options.getString('placeholder') ?? undefined;

      const forms = await getForms(ctx.storage, guildId);
      const form = forms.find((f) => f.id === formId);
      if (!form) {
        await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (form.fields.length >= 5) {
        await interaction.reply({ content: 'Discord modals support a maximum of 5 fields per form.', flags: MessageFlags.Ephemeral });
        return;
      }
      form.fields.push({ id: generateId(), label, style, required, placeholder });
      await saveForm(ctx.storage, guildId, form);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('Field Added')
            .setDescription(`Added **${label}** to **${form.name}** (${form.fields.length}/5 fields).`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    else if (sub === 'list') {
      const forms = await getForms(ctx.storage, guildId);
      if (forms.length === 0) {
        await interaction.reply({ content: 'No forms configured. Use `/app-setup create` to create one.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Application Forms')
            .setDescription(
              forms.map((f) =>
                `**${f.name}** \`${f.id}\` — ${f.enabled ? '✅ Open' : '❌ Closed'} — ${f.fields.length} field(s) — <#${f.reviewChannelId}>`
              ).join('\n'),
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    else if (sub === 'delete') {
      const formId = interaction.options.getString('form', true);
      const forms = await getForms(ctx.storage, guildId);
      const form = forms.find((f) => f.id === formId);
      if (!form) {
        await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      await deleteForm(ctx.storage, guildId, formId);
      await interaction.reply({ content: `Form **${form.name}** deleted.`, flags: MessageFlags.Ephemeral });
    }

    else if (sub === 'toggle') {
      const formId = interaction.options.getString('form', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      const forms = await getForms(ctx.storage, guildId);
      const form = forms.find((f) => f.id === formId);
      if (!form) {
        await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
        return;
      }
      form.enabled = enabled;
      await saveForm(ctx.storage, guildId, form);
      await interaction.reply({
        content: `Form **${form.name}** is now ${enabled ? '✅ open' : '❌ closed'} for applications.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    const forms = await getForms(ctx.storage, interaction.guildId!);
    const query = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      forms
        .filter((f) => f.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map((f) => ({ name: `${f.name} (${f.enabled ? 'open' : 'closed'})`, value: f.id })),
    );
  },
};

export default command;
