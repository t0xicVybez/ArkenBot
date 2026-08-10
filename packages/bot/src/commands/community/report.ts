/**
 * /report command — lets any member report another user to staff.
 */
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { BotCommand } from '../../types.js';
import type { BotClient } from '../../client.js';
import { errorEmbed, successEmbed } from '../../utils/embed.js';
import { prisma } from '../../database.js';
import { getGuildSettings } from '../../utils/settings.js';

import { swallow } from '../../logger.js';
function buildReportEmbed(report: {
  reporterId: string; reporterTag: string;
  targetId: string; targetTag: string;
  reason: string; status: string;
  reviewerTag?: string | null; staffNote?: string | null;
  createdAt: Date;
}, disabled = false): EmbedBuilder {
  const statusColors: Record<string, number> = {
    pending: 0xf1c40f,
    dismissed: 0x95a5a6,
    reviewed: 0x2ecc71,
  };
  const embed = new EmbedBuilder()
    .setColor(statusColors[report.status] ?? 0xf1c40f)
    .setTitle('📋 Member Report')
    .addFields(
      { name: 'Reporter', value: `<@${report.reporterId}> (${report.reporterTag})`, inline: true },
      { name: 'Target', value: `<@${report.targetId}> (${report.targetTag})`, inline: true },
      { name: 'Reason', value: report.reason },
      { name: 'Status', value: report.status.charAt(0).toUpperCase() + report.status.slice(1), inline: true },
    )
    .setTimestamp(report.createdAt);

  if (report.reviewerTag) {
    embed.addFields({ name: 'Reviewed By', value: report.reviewerTag, inline: true });
  }
  if (report.staffNote) {
    embed.addFields({ name: 'Staff Note', value: report.staffNote });
  }

  return embed;
}

function buildReportButtons(reportId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`report:dismiss:${reportId}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚫')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`report:action:${reportId}`)
      .setLabel('Take Action')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚠️')
      .setDisabled(disabled),
  );
}

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a user to the moderation team')
    .addUserOption(o => o.setName('user').setDescription('User to report').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the report').setRequired(true).setMaxLength(1000)),
  category: 'community',

  async execute(interaction: ChatInputCommandInteraction, _client: BotClient) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [errorEmbed('Error', 'This command must be used in a server.')] });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (targetUser.id === interaction.user.id) {
      await interaction.editReply({ embeds: [errorEmbed('Invalid Target', 'You cannot report yourself.')] });
      return;
    }

    const report = await prisma.report.create({
      data: {
        guildId: interaction.guild.id,
        reporterId: interaction.user.id,
        reporterTag: interaction.user.tag,
        targetId: targetUser.id,
        targetTag: targetUser.tag,
        reason,
        status: 'pending',
      },
    });

    const settings = await getGuildSettings(interaction.guild.id);
    const extended = (settings?.extended ?? {}) as Record<string, unknown>;
    const reportConfig = extended.reportConfig as { channelId?: string } | undefined;

    if (reportConfig?.channelId) {
      const reportChannel = interaction.guild.channels.cache.get(reportConfig.channelId);
      if (reportChannel?.isTextBased() && 'send' in reportChannel) {
        const embed = buildReportEmbed({
          reporterId: report.reporterId,
          reporterTag: report.reporterTag,
          targetId: report.targetId,
          targetTag: report.targetTag,
          reason: report.reason,
          status: report.status,
          createdAt: report.createdAt,
        });
        const row = buildReportButtons(report.id);

        const msg = await (reportChannel as import('discord.js').TextChannel).send({
          embeds: [embed],
          components: [row],
        });

        await prisma.report.update({
          where: { id: report.id },
          data: { messageId: msg.id, reviewChannelId: msg.channelId },
        });
      }
    }

    await interaction.editReply({ embeds: [successEmbed('Report Submitted', 'Your report has been submitted to the moderation team.')] });
  },

  async handleButton(interaction: ButtonInteraction, _client: BotClient) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const reportId = parts[2];

    if (!reportId || !interaction.guild) return;

    if (action === 'dismiss') {
      const report = await prisma.report.findUnique({ where: { id: reportId } });
      if (!report || report.guildId !== interaction.guild.id) return;

      await prisma.report.update({
        where: { id: reportId },
        data: {
          status: 'dismissed',
          reviewerId: interaction.user.id,
          reviewerTag: interaction.user.tag,
          updatedAt: new Date(),
        },
      });

      const updatedReport = await prisma.report.findUnique({ where: { id: reportId } });
      if (!updatedReport) return;

      const embed = buildReportEmbed({
        reporterId: updatedReport.reporterId,
        reporterTag: updatedReport.reporterTag,
        targetId: updatedReport.targetId,
        targetTag: updatedReport.targetTag,
        reason: updatedReport.reason,
        status: updatedReport.status,
        reviewerTag: updatedReport.reviewerTag,
        staffNote: updatedReport.staffNote,
        createdAt: updatedReport.createdAt,
      }, true);

      await interaction.update({ embeds: [embed], components: [buildReportButtons(reportId, true)] });
    }

    if (action === 'action') {
      const modal = new ModalBuilder()
        .setCustomId(`report:action:${reportId}:modal`)
        .setTitle('Report Action');

      const noteInput = new TextInputBuilder()
        .setCustomId('staffNote')
        .setLabel('Staff Note (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput));
      await interaction.showModal(modal);
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, _client: BotClient) {
    if (!interaction.customId.startsWith('report:action:')) return;
    const parts = interaction.customId.split(':');
    const reportId = parts[2];
    if (!reportId || !interaction.guild) return;

    const staffNote = interaction.fields.getTextInputValue('staffNote') || null;

    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'reviewed',
        reviewerId: interaction.user.id,
        reviewerTag: interaction.user.tag,
        staffNote,
        updatedAt: new Date(),
      },
    });

    const updatedReport = await prisma.report.findUnique({ where: { id: reportId } });
    if (!updatedReport) {
      await interaction.reply({ content: 'Report not found.', flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = buildReportEmbed({
      reporterId: updatedReport.reporterId,
      reporterTag: updatedReport.reporterTag,
      targetId: updatedReport.targetId,
      targetTag: updatedReport.targetTag,
      reason: updatedReport.reason,
      status: updatedReport.status,
      reviewerTag: updatedReport.reviewerTag,
      staffNote: updatedReport.staffNote,
      createdAt: updatedReport.createdAt,
    }, true);

    // ModalSubmitInteraction has no .update(); fetch the original report message and edit it
    if (updatedReport.messageId && updatedReport.reviewChannelId && interaction.guild) {
      const reportChannel = interaction.guild.channels.cache.get(updatedReport.reviewChannelId);
      if (reportChannel?.isTextBased() && 'messages' in reportChannel) {
        const originalMsg = await (reportChannel as import('discord.js').TextChannel).messages
          .fetch(updatedReport.messageId).catch(swallow);
        if (originalMsg) {
          await originalMsg.edit({ embeds: [embed], components: [buildReportButtons(reportId, true)] }).catch(swallow);
        }
      }
    }
    await interaction.reply({ content: 'Report marked as reviewed.', flags: MessageFlags.Ephemeral });
  },
};

export default command;
