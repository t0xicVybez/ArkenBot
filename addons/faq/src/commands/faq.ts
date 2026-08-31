import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type AutocompleteInteraction,
} from 'discord.js';
import type { AddonContext, AddonCommandDefinition } from '@arkenbot/addon-sdk';
import { getEntries, findEntry, saveEntry, search } from '../utils/storage.js';

const command: AddonCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Search the server knowledge base')
    .addStringOption((o) => o.setName('query').setDescription('What are you looking for?').setRequired(true).setAutocomplete(true)) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | ContextMenuCommandInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    const guildId = interaction.guildId;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    if (!guildId) { await interaction.reply({ content: t('guildOnly'), flags: MessageFlags.Ephemeral }); return; }

    const entries = await getEntries(ctx.storage, guildId);
    if (!entries.length) { await interaction.reply({ content: t('noEntries'), flags: MessageFlags.Ephemeral }); return; }

    const raw = interaction.options.getString('query', true);
    // Autocomplete hands us an entry id; a typed query falls through to search.
    const entry = (await findEntry(ctx.storage, guildId, raw)) ?? search(entries, raw)[0] ?? null;
    if (!entry) { await interaction.reply({ content: t('notFound'), flags: MessageFlags.Ephemeral }); return; }

    entry.uses += 1;
    await saveEntry(ctx.storage, guildId, entry);

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle(`❓ ${entry.title}`)
      .setDescription(entry.answer)
      .setFooter({ text: t('answerFooter') });
    await interaction.reply({ embeds: [embed] });
  },

  async autocomplete(interaction: AutocompleteInteraction, ctx: AddonContext): Promise<void> {
    if (!interaction.guildId) { await interaction.respond([]); return; }
    const entries = await getEntries(ctx.storage, interaction.guildId);
    const focused = interaction.options.getFocused();
    await interaction.respond(
      search(entries, focused).slice(0, 25).map((e) => ({ name: e.title.slice(0, 100), value: e.id })),
    );
  },
};

export default command;
