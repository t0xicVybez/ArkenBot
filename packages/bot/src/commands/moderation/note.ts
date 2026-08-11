/**
 * /note command — staff notes on users (stored in UserNote).
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { successEmbed, errorEmbed } from '../../utils/embed.js';
import { t, resolveUserLocale } from '../../i18n/index.js';
import { prisma } from '../../database.js';

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Manage staff notes on users')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a note to a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('content').setDescription('Note content').setRequired(true).setMaxLength(1000))
    )
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List notes for a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a specific note by ID')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Note ID to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Clear all notes for a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addBooleanOption(o => o.setName('confirm').setDescription('Must be true to confirm clear').setRequired(true))
    ),
  category: 'moderation',
  userPermissions: [PermissionFlagsBits.ManageMessages],

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ flags: 64 });
    const loc = await resolveUserLocale(interaction);

    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user', true);
    const guildId = interaction.guildId!;

    if (sub === 'add') {
      const content = interaction.options.getString('content', true);

      const note = await prisma.userNote.create({
        data: {
          guildId,
          userId: targetUser.id,
          staffId: interaction.user.id,
          staffTag: interaction.user.tag,
          content,
        },
      });

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.note.addedTitle', loc), t('cmd.note.added', loc, { id: note.id, user: targetUser.tag, content }))],
      });
    }

    if (sub === 'list') {
      const notes = await prisma.userNote.findMany({
        where: { guildId, userId: targetUser.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      if (notes.length === 0) {
        await interaction.editReply({ embeds: [errorEmbed(t('cmd.note.noNotesTitle', loc), t('cmd.note.noNotes', loc, { user: targetUser.tag }))] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(t('cmd.note.listTitle', loc, { user: targetUser.tag }))
        .setThumbnail(targetUser.displayAvatarURL({ size: 64 }))
        .setFooter({ text: t('cmd.note.listFooter', loc, { count: notes.length }) })
        .setTimestamp();

      for (const note of notes) {
        const date = `<t:${Math.floor(note.createdAt.getTime() / 1000)}:d>`;
        embed.addFields({
          name: t('cmd.note.fieldName', loc, { id: note.id, date, staff: note.staffTag }),
          value: note.content.length > 200 ? note.content.slice(0, 197) + '...' : note.content,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id', true);

      const note = await prisma.userNote.findFirst({
        where: { id, guildId, userId: targetUser.id },
      });

      if (!note) {
        await interaction.editReply({ embeds: [errorEmbed(t('cmd.note.notFoundTitle', loc), t('cmd.note.notFound', loc))] });
        return;
      }

      await prisma.userNote.delete({ where: { id } });
      await interaction.editReply({ embeds: [successEmbed(t('cmd.note.removedTitle', loc), t('cmd.note.removed', loc, { id }))] });
    }

    if (sub === 'clear') {
      const confirm = interaction.options.getBoolean('confirm', true);
      if (!confirm) {
        await interaction.editReply({ embeds: [errorEmbed(t('cmd.note.cancelledTitle', loc), t('cmd.note.cancelled', loc))] });
        return;
      }

      const { count } = await prisma.userNote.deleteMany({
        where: { guildId, userId: targetUser.id },
      });

      await interaction.editReply({
        embeds: [successEmbed(t('cmd.note.clearedTitle', loc), t('cmd.note.cleared', loc, { count, user: targetUser.tag }))],
      });
    }
  },
};

export default command;
