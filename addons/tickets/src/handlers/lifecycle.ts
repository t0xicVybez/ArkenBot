/**
 * Lifecycle handling for the tickets addon.
 */
import {
  MessageFlags,
  type ButtonInteraction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Ticket, TicketPanel } from '../types.js';
import { isTicketStaff } from '../utils/permissions.js';
import { isReopenAllowed } from '../utils/time.js';
import {
  getPanel,
  getConfig,
  getTicketByChannel,
  saveTicket,
  getMessages,
} from '../utils/storage.js';
import {
  buildTicketEmbed,
  buildClosedEmbed,
  buildRatingEmbed,
  buildRatingButtons,
  buildTicketControls,
  buildClaimedControls,
  buildTranscriptEmbed,
} from '../utils/embeds.js';
import { archiveTicketChannel, restoreTicketChannel } from '../utils/channel.js';
import { generateTranscriptHtml } from '../utils/transcript.js';
import { fireWebhook } from '../utils/webhook.js';
import { sendClaimBrief } from './triage.js';

const pendingClose = new Map<string, ReturnType<typeof setTimeout>>();

export async function handleCloseButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isOwner = interaction.user.id === ticket.userId;
  if (!isOwner && !isTicketStaff(panel, ticket, member)) {
    await interaction.reply({ content: t('onlyStaffClose'), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  await closeTicket(ctx, interaction, ticket, undefined);
}

export async function finalizeTicketClose(
  ctx: AddonContext,
  guildId: string,
  channelId: string,
  closeAction: 'delete' | 'archive',
  logChannelId: string | undefined,
  panel: TicketPanel | null,
  webhookUrl: string | undefined,
  webhookSecret?: string,
): Promise<void> {
  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId, guildLocale: ctx.getGuild(guildId)?.preferredLocale });
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);

  const existing = pendingClose.get(channelId);
  if (existing) {
    clearTimeout(existing);
    pendingClose.delete(channelId);
  }

  const freshTicket = await getTicketByChannel(ctx.storage, guildId, channelId);
  if (!freshTicket) return;

  const channel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
  const freshMessages = await getMessages(ctx.storage, channelId);

  if (logChannelId && panel && channel) {
    const logChannel = ctx.client.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logChannel) {
      try {
        const transcriptEmbed = buildTranscriptEmbed(freshTicket, freshMessages.length, t);
        const staffHtml = generateTranscriptHtml(freshTicket, panel, freshMessages, t, true);
        await logChannel.send({
          embeds: [transcriptEmbed],
          files: [{ attachment: staffHtml, name: `ticket-${freshTicket.number}.html` }],
        });
      } catch (err) {
        ctx.logger.warn(`Failed to send staff transcript: ${err}`);
      }
    }
  }

  if (webhookUrl) {
    fireWebhook(webhookUrl, {
      event: 'ticket.closed',
      ticketId: freshTicket.id,
      number: freshTicket.number,
      panelName: panel?.name,
      userId: freshTicket.userId,
      username: freshTicket.username,
      closedBy: freshTicket.closedByTag,
      reason: freshTicket.reason,
      guildId,
      closedAt: freshTicket.closedAt,
      rating: freshTicket.rating,
    }, webhookSecret).catch((err) => ctx.logger.warn(`Webhook delivery failed (ticket.closed): ${err}`));
  }

  if (channel) {
    try {
      if (closeAction === 'archive') {
        await archiveTicketChannel(channel, freshTicket);
      } else {
        await channel.delete(`Ticket #${freshTicket.number} closed by ${freshTicket.closedByTag}`);
      }
    } catch (err) {
      ctx.logger.error('Failed to delete/archive ticket channel', String(err));
    }
  }
}

export async function closeTicket(
  ctx: AddonContext,
  interaction: ButtonInteraction | import('discord.js').ChatInputCommandInteraction,
  ticket: Ticket,
  reason: string | undefined,
): Promise<void> {
  const guildId = ticket.guildId;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ownerLoc = await ctx.resolveLocale({ user: { id: ticket.userId }, guildId, guildLocale: ctx.getGuild(guildId)?.preferredLocale });
  const ownerT = (k: string, v?: Record<string, string | number>) => ctx.t(k, ownerLoc, v);
  const channel = ctx.client.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  const panel = await getPanel(ctx.storage, guildId, ticket.panelId);
  const config = await getConfig(ctx.storage, guildId);

  ticket.status = 'closed';
  ticket.closedBy = interaction.user.id;
  ticket.closedByTag = interaction.user.tag;
  ticket.closedAt = new Date().toISOString();
  if (reason) ticket.reason = reason;
  await saveTicket(ctx.storage, guildId, ticket);

  const closeAction = panel?.closeAction ?? 'delete';
  const closedEmbed = buildClosedEmbed(ticket, interaction.user.tag, ownerT);
  if (channel) {
    try {
      if (closeAction === 'archive') {
        const { buildReopenButton } = await import('../utils/embeds.js');
        await channel.send({ embeds: [closedEmbed], components: [buildReopenButton(channel.id, ownerT)] });
      } else {
        await channel.send({ embeds: [closedEmbed] });
      }
    } catch (err) {
      ctx.logger.warn(`Could not send close embed to ticket channel: ${err}`);
    }
  }

  const messages = await getMessages(ctx.storage, ticket.channelId);
  const resolvedLogChannelId = panel?.logChannelId ?? config.transcriptChannelId;

  if (panel) {
    try {
      const user = await ctx.client.users.fetch(ticket.userId);
      const userHtml = generateTranscriptHtml(ticket, panel, messages, ownerT, false);
      await user.send({
        content: ownerT('transcriptDmContent', { num: ticket.number }),
        files: [{ attachment: userHtml, name: `ticket-${ticket.number}.html` }],
      });
    } catch {

    }
  }

  if (channel && closeAction === 'delete') {
    try {
      const ratingEmbed = buildRatingEmbed(ticket, ownerT);
      const ratingRow = buildRatingButtons(guildId, ticket.channelId);
      await channel.send({
        content: ownerT('pleaseRateClose', { mention: `<@${ticket.userId}>` }),
        embeds: [ratingEmbed],
        components: [ratingRow],
      });
    } catch (err) {
      ctx.logger.warn(`Could not send rating prompt to ticket channel: ${err}`);
    }
  } else if (channel && closeAction === 'archive') {
    try {
      const ratingEmbed = buildRatingEmbed(ticket, ownerT);
      const ratingRow = buildRatingButtons(guildId, ticket.channelId);
      await channel.send({
        content: ownerT('pleaseRate', { mention: `<@${ticket.userId}>` }),
        embeds: [ratingEmbed],
        components: [ratingRow],
      });
    } catch (err) {
      ctx.logger.warn(`Could not send rating prompt to ticket channel: ${err}`);
    }
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(t('ticketBeingClosed'));
  } else {
    await interaction.reply({ content: t('closingTicket'), flags: MessageFlags.Ephemeral });
  }

  const fallbackMs = (config.ratingWindowMinutes ?? 10) * 60 * 1000;
  const timer = setTimeout(async () => {
    pendingClose.delete(ticket.channelId);
    try {
      await finalizeTicketClose(ctx, guildId, ticket.channelId, closeAction, resolvedLogChannelId as string | undefined, panel ?? null, config.webhookUrl, config.webhookSecret);
    } catch (err) {
      ctx.logger.error('Fallback close timer failed', String(err));
    }
  }, fallbackMs);
  pendingClose.set(ticket.channelId, timer);
}

export async function handleReopenButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (ticket.status !== 'closed') {
    await interaction.reply({ content: t('notClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = isTicketStaff(panel, ticket, member);

  if (!isStaff) {
    await interaction.reply({ content: t('onlyStaffReopen'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (!isReopenAllowed(panel?.reopenWindowHours, ticket.closedAt, Date.now())) {
    await interaction.reply({ content: t('reopenWindowExpired', { hours: panel!.reopenWindowHours! }), flags: MessageFlags.Ephemeral });
    return;
  }

  ticket.status = 'open';
  ticket.closedAt = undefined;
  ticket.closedBy = undefined;
  ticket.closedByTag = undefined;
  ticket.lastActivity = new Date().toISOString();

  const channel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
  if (channel) {

    const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
    if (panel?.closeAction === 'archive') {
      await restoreTicketChannel(channel, ticket).catch((err) =>
        ctx.logger.warn(`Failed to restore archived channel: ${err}`),
      );
    }

    const controls = buildTicketControls(channel.id, t);
    const controlsMsg = await channel.send({
      content: t('reopenedMsg', { user: interaction.user.tag, mention: `<@${ticket.userId}>` }),
      components: controls,
    });
    ticket.controlsMessageId = controlsMsg.id;
  }

  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await interaction.reply({ content: t('reopenedOk'), flags: MessageFlags.Ephemeral });

  await interaction.message.edit({ components: [] }).catch(() => null);
}

export async function handleClaimButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = isTicketStaff(panel, ticket, member);

  if (!isStaff) {
    await interaction.reply({ content: t('onlyStaffClaim'), flags: MessageFlags.Ephemeral });
    return;
  }

  ticket.status = 'claimed';
  ticket.claimedBy = interaction.user.id;
  ticket.claimedByTag = interaction.user.tag;
  ticket.lastActivity = new Date().toISOString();
  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await updateControlsMessage(ctx, ticket, true);
  await interaction.reply(t('claimed', { user: interaction.user.tag }));
  await sendClaimBrief(ctx, interaction, ticket, t);
}

export async function handleKeepOpenButton(ctx: AddonContext, interaction: ButtonInteraction, channelId: string): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  ticket.lastActivity = new Date().toISOString();
  ticket.nudgedAt = undefined;
  ticket.closeRequestedBy = undefined;
  ticket.closeRequestedByTag = undefined;
  ticket.closeRequestedAt = undefined;
  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await interaction.reply({ content: t('keptOpen', { user: `<@${interaction.user.id}>` }) });
}

export async function handleConfirmCloseButton(ctx: AddonContext, interaction: ButtonInteraction, channelId: string): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }
  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = isTicketStaff(panel, ticket, member);
  const isOpener = interaction.user.id === ticket.userId;
  if (!isOpener && !isStaff) {
    await interaction.reply({ content: t('onlyOpenerOrStaffClose'), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  await closeTicket(ctx, interaction, ticket, t('closedViaRequest'));
}

export async function handleUnclaimButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket || ticket.status === 'closed') {
    await interaction.reply({ content: t('ticketNotFoundOrClosed'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (ticket.claimedBy !== interaction.user.id) {
    await interaction.reply({ content: t('onlyClaimerUnclaim'), flags: MessageFlags.Ephemeral });
    return;
  }

  ticket.status = 'open';
  ticket.claimedBy = undefined;
  ticket.claimedByTag = undefined;
  ticket.lastActivity = new Date().toISOString();
  await saveTicket(ctx.storage, interaction.guildId, ticket);
  await updateControlsMessage(ctx, ticket, false);
  await interaction.reply(t('unclaimed'));
}

export async function updateControlsMessage(ctx: AddonContext, ticket: Ticket, claimed: boolean): Promise<void> {
  if (!ticket.controlsMessageId) return;
  const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: ticket.guildId, guildLocale: ctx.getGuild(ticket.guildId)?.preferredLocale });
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const channel = ctx.client.channels.cache.get(ticket.channelId) as TextChannel | undefined;
  if (!channel) return;
  const msg = await channel.messages.fetch(ticket.controlsMessageId).catch(() => null);
  if (!msg) return;
  const waiting = ticket.status === 'waiting';
  const components = claimed ? buildClaimedControls(ticket.channelId, t, waiting) : buildTicketControls(ticket.channelId, t, waiting);
  const panel = await getPanel(ctx.storage, channel.guildId, ticket.panelId);
  const member = channel.guild.members.cache.get(ticket.userId)
    ?? await channel.guild.members.fetch(ticket.userId).catch(() => null);
  if (panel && member) {
    const embed = buildTicketEmbed(ticket, panel, member, t);
    await msg.edit({ embeds: [embed], components }).catch(() => null);
  } else {
    await msg.edit({ components }).catch(() => null);
  }
}

export async function handleTranscriptButton(
  ctx: AddonContext,
  interaction: ButtonInteraction,
  channelId: string,
): Promise<void> {
  if (!interaction.guildId) return;
  const loc = await ctx.resolveLocale(interaction);
  const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
  const ticket = await getTicketByChannel(ctx.storage, interaction.guildId, channelId);
  if (!ticket) {
    await interaction.reply({ content: t('ticketNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }
  const panel = await getPanel(ctx.storage, interaction.guildId, ticket.panelId);
  if (!panel) {
    await interaction.reply({ content: t('panelNotFound'), flags: MessageFlags.Ephemeral });
    return;
  }

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const isStaff = isTicketStaff(panel, ticket, member);
  const isOwner = interaction.user.id === ticket.userId;

  if (!isStaff && !isOwner) {
    await interaction.reply({ content: t('onlyOwnerStaffTranscript'), flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const messages = await getMessages(ctx.storage, channelId);

  const html = generateTranscriptHtml(ticket, panel, messages, t, isStaff);
  const embed = buildTranscriptEmbed(ticket, messages.length, t);
  await interaction.editReply({
    embeds: [embed],
    files: [{ attachment: html, name: `ticket-${ticket.number}.html` }],
  });
}
