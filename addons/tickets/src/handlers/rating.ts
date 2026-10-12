
import {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { getPanel, getConfig, getTicketByChannel, saveTicket } from '../utils/storage.js';
import { finalizeTicketClose } from './lifecycle.js';

export async function handleRateButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  guildId: string,
  channelId: string,
  rating: number,
): Promise<void> {
  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: t('onlyOwnerRate'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (ticket.rating !== undefined) {
    await interaction.reply({ content: t('alreadyRated'), flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket:rate-modal:${guildId}:${channelId}:${rating}`)
    .setTitle(`${t('rateModalTitle')} (${'⭐'.repeat(rating)})`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel(t('rateFeedbackLabel'))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
          .setPlaceholder(t('rateFeedbackPlaceholder')),
      ),
    );

  await interaction.showModal(modal);
}

export async function handleRateModal(
  ctx: AddonContext,
  interaction: ModalSubmitInteraction,
  guildId: string,
  channelId: string,
  rating: number,
): Promise<void> {
  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== ticket.userId) {
    await interaction.reply({ content: t('onlyOwnerRate'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.rating !== undefined) {
    await interaction.reply({ content: t('alreadyRated'), flags: MessageFlags.Ephemeral });
    return;
  }

  const feedback = interaction.fields.getTextInputValue('feedback').trim() || undefined;
  ticket.rating = rating;
  ticket.ratingFeedback = feedback;
  await saveTicket(ctx.storage, guildId, ticket);

  await interaction.reply({
    content: `${'⭐'.repeat(rating)} Thank you for your rating!${feedback ? ' Your comments have been recorded.' : ''} This channel will now be closed.`,
    flags: MessageFlags.Ephemeral,
  });

  const panel = await getPanel(ctx.storage, guildId, ticket.panelId);
  const config = await getConfig(ctx.storage, guildId);

  if (config.lowRatingThreshold && config.lowRatingThreshold > 0 && rating <= config.lowRatingThreshold) {
    const alertChannelId = config.lowRatingAlertChannelId || config.staffNotifyChannelId;
    const guild = ctx.getGuild(guildId);
    const alertChannel = alertChannelId ? (guild?.channels.cache.get(alertChannelId) as TextChannel | undefined) : undefined;
    if (alertChannel && 'send' in alertChannel) {
      const staffLoc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: guild?.preferredLocale });
      const st = (k: string, v?: Record<string, string | number>) => ctx.t(k, staffLoc, v);
      const rolePing = config.lowRatingAlertRoleId ? `<@&${config.lowRatingAlertRoleId}> ` : '';
      await alertChannel.send(
        `${rolePing}${st('lowRatingAlert', { num: ticket.number, stars: '⭐'.repeat(rating), user: `<@${ticket.userId}>`, handler: ticket.claimedByTag || ticket.closedByTag || '—' })}${feedback ? `\n> ${feedback}` : ''}`,
      ).catch(() => null);
    }
  }

  const closeAction = panel?.closeAction ?? 'delete';
  const logChannelId = (panel?.logChannelId ?? config.transcriptChannelId) as string | undefined;
  await finalizeTicketClose(ctx, guildId, channelId, closeAction, logChannelId, panel ?? null, config.webhookUrl).catch((err: unknown) =>
    ctx.logger.error('Failed to finalize ticket after rating', String(err)),
  );
}
