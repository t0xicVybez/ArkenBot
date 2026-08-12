/**
 * /suggestion command — moderator controls for approving, denying, or marking
 * suggestions as under consideration. Updates the original suggestion embed in place.
 */
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { prisma } from '../../database.js';
import { t, resolveUserLocale } from '../../i18n/index.js';

import { swallow } from '../../logger.js';
const STATUS_COLORS: Record<string, number> = {
  approved: 0x57f287,
  denied: 0xed4245,
  considering: 0xfee75c,
  pending: 0x5865f2,
};

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Manage suggestions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('approve')
      .setDescription('Approve a suggestion')
      .addStringOption(o => o.setName('id').setDescription('Suggestion ID').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Staff note').setRequired(false)))
    .addSubcommand(s => s.setName('deny')
      .setDescription('Deny a suggestion')
      .addStringOption(o => o.setName('id').setDescription('Suggestion ID').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Staff note').setRequired(false)))
    .addSubcommand(s => s.setName('consider')
      .setDescription('Mark a suggestion as under consideration')
      .addStringOption(o => o.setName('id').setDescription('Suggestion ID').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Staff note').setRequired(false))),
  category: 'moderation',
  cooldown: 3,
  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    const loc = await resolveUserLocale(interaction);
    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getString('id', true);
    const note = interaction.options.getString('note');
    const statusMap: Record<string, string> = { approve: 'approved', deny: 'denied', consider: 'considering' };
    const status = statusMap[sub];

    const suggestion = await prisma.suggestion.findFirst({ where: { id, guildId: interaction.guildId! } });
    if (!suggestion) {
      await interaction.reply({ content: t('cmd.suggestion.notFound', loc), flags: 64 });
      return;
    }

    await prisma.suggestion.update({ where: { id }, data: { status, staffNote: note ?? undefined } });

    const statusLabels: Record<string, string> = {
      approved: t('cmd.suggestion.statusApproved', loc),
      denied: t('cmd.suggestion.statusDenied', loc),
      considering: t('cmd.suggestion.statusConsidering', loc),
    };
    const statusLabel = statusLabels[status] ?? status;

    if (suggestion.messageId && suggestion.channelId) {
      const channel = interaction.guild!.channels.cache.get(suggestion.channelId);
      if (channel?.isTextBased()) {
        const msg = await channel.messages.fetch(suggestion.messageId).catch(swallow);
        if (msg?.editable) {
          const updatedEmbed = EmbedBuilder.from(msg.embeds[0])
            .setColor(STATUS_COLORS[status] ?? 0x5865f2)
            .setFooter({ text: `${t('cmd.suggestion.footer', loc, { status: statusLabel, user: interaction.user.username })}${note ? ` · ${note}` : ''}` });
          await msg.edit({ embeds: [updatedEmbed] });
        }
      }
    }

    await interaction.reply({ content: t('cmd.suggestion.result', loc, { status: statusLabel }), flags: 64 });
  },
};

export default command;
