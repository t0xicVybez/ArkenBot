import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getEntries, findEntry, deleteEntry, search } from '../utils/storage.js';

type Labels = { title: string; answer: string; tags: string };
function entryModal(customId: string, title: string, L: Labels, e?: { title: string; answer: string; tags: string[] }): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const titleIn = new TextInputBuilder().setCustomId('title').setLabel(L.title).setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
  const answerIn = new TextInputBuilder().setCustomId('answer').setLabel(L.answer).setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true);
  const tagsIn = new TextInputBuilder().setCustomId('tags').setLabel(L.tags).setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false);
  if (e) { titleIn.setValue(e.title); answerIn.setValue(e.answer); if (e.tags.length) tagsIn.setValue(e.tags.join(', ')); }
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleIn),
    new ActionRowBuilder<TextInputBuilder>().addComponents(answerIn),
    new ActionRowBuilder<TextInputBuilder>().addComponents(tagsIn),
  );
  return modal;
}

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('faq-admin')
    .setDescription('Manage the server knowledge base')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('add').setDescription('Add a new FAQ entry'))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit an existing FAQ entry')
      .addStringOption((o) => o.setName('entry').setDescription('The entry to edit').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a FAQ entry')
      .addStringOption((o) => o.setName('entry').setDescription('The entry to remove').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List all FAQ entries')) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!guildId) { await interaction.reply({ content: t('guildOnly'), flags: MessageFlags.Ephemeral }); return; }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: t('needManage'), flags: MessageFlags.Ephemeral }); return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      await interaction.showModal(entryModal('faq:add', t('addModalTitle'), { title: t('lblTitle'), answer: t('lblAnswer'), tags: t('lblTags') }));
      return;
    }
    if (sub === 'edit') {
      const entry = await findEntry(ctx.storage, guildId, interaction.options.getString('entry', true));
      if (!entry) { await interaction.reply({ content: t('entryGone'), flags: MessageFlags.Ephemeral }); return; }
      await interaction.showModal(entryModal(`faq:edit:${entry.id}`, t('editModalTitle'), { title: t('lblTitle'), answer: t('lblAnswer'), tags: t('lblTags') }, entry));
      return;
    }
    if (sub === 'remove') {
      const entry = await findEntry(ctx.storage, guildId, interaction.options.getString('entry', true));
      if (!entry) { await interaction.reply({ content: t('entryGone'), flags: MessageFlags.Ephemeral }); return; }
      await deleteEntry(ctx.storage, guildId, entry.id);
      await interaction.reply({ content: t('removed', { title: entry.title }), flags: MessageFlags.Ephemeral });
      return;
    }

    // list
    const entries = await getEntries(ctx.storage, guildId);
    if (!entries.length) { await interaction.reply({ content: t('emptyList'), flags: MessageFlags.Ephemeral }); return; }
    const lines = entries
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((e) => `• **${e.title}**${e.tags.length ? ` — \`${e.tags.join('`, `')}\`` : ''}`)
      .join('\n')
      .slice(0, 4000);
    const embed = new EmbedBuilder().setColor(0x3b82f6).setTitle(t('listTitle', { count: entries.length })).setDescription(lines);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.guildId) { await interaction.respond([]); return; }
    const entries = await getEntries(ctx.storage, interaction.guildId);
    await interaction.respond(
      search(entries, interaction.options.getFocused()).slice(0, 25).map((e) => ({ name: e.title.slice(0, 100), value: e.id })),
    );
  },
};

export default command;
