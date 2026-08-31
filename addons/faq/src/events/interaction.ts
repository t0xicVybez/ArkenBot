/**
 * FAQ admin modal routing:
 *  - `faq:add`            — create a new knowledge-base entry
 *  - `faq:edit:<entryId>` — update an existing entry
 */
import { MessageFlags, type Interaction } from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { findEntry, findByTitle, saveEntry, getEntries, atCapacity, generateId } from '../utils/storage.js';
import type { FaqEntry } from '../types.js';

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

export const interactionHandler = {
  async handle(ctx: AddonContext, interaction: Interaction): Promise<void> {
    if (!interaction.isModalSubmit() || !interaction.guildId) return;
    if (interaction.customId !== 'faq:add' && !interaction.customId.startsWith('faq:edit:')) return;

    const guildId = interaction.guildId;
    const loc = await ctx.resolveLocale(interaction);
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

    const title = interaction.fields.getTextInputValue('title').trim();
    const answer = interaction.fields.getTextInputValue('answer').trim();
    const tags = parseTags(interaction.fields.getTextInputValue('tags') || '');
    if (!title) { await interaction.reply({ content: t('titleRequired'), flags: MessageFlags.Ephemeral }); return; }
    if (!answer) { await interaction.reply({ content: t('answerRequired'), flags: MessageFlags.Ephemeral }); return; }

    if (interaction.customId === 'faq:add') {
      if (atCapacity((await getEntries(ctx.storage, guildId)).length)) {
        await interaction.reply({ content: t('atCapacity'), flags: MessageFlags.Ephemeral }); return;
      }
      const dupe = await findByTitle(ctx.storage, guildId, title);
      if (dupe) { await interaction.reply({ content: t('duplicate', { title }), flags: MessageFlags.Ephemeral }); return; }
      const entry: FaqEntry = { id: generateId(), title, answer, tags, createdAt: new Date().toISOString(), uses: 0 };
      await saveEntry(ctx.storage, guildId, entry);
      await interaction.reply({ content: t('created', { title }), flags: MessageFlags.Ephemeral });
      return;
    }

    // faq:edit:<id>
    const id = interaction.customId.split(':')[2];
    const entry = await findEntry(ctx.storage, guildId, id);
    if (!entry) { await interaction.reply({ content: t('entryGone'), flags: MessageFlags.Ephemeral }); return; }
    entry.title = title; entry.answer = answer; entry.tags = tags;
    await saveEntry(ctx.storage, guildId, entry);
    await interaction.reply({ content: t('updated', { title }), flags: MessageFlags.Ephemeral });
  },
};
