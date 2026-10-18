/**
 * Interaction event handling for the tickets addon.
 */
import {
  MessageFlags,
  type Interaction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { Ticket, TicketNote } from '../types.js';
import {
  getPanel,
  saveTicket,
  getTicketByChannel,
  getConfig,
} from '../utils/storage.js';
import { isTicketStaff } from '../utils/permissions.js';

import {
  handleCloseButton,
  handleClaimButton,
  handleUnclaimButton,
  handleReopenButton,
  handleKeepOpenButton,
  handleConfirmCloseButton,
  handleTranscriptButton,
  updateControlsMessage,
} from '../handlers/lifecycle.js';
export { closeTicket, updateControlsMessage } from '../handlers/lifecycle.js';
import { handleRateButton, handleRateModal } from '../handlers/rating.js';
import { handleOpenTicket, handleReasonModal } from '../handlers/open.js';
export { createTicket } from '../handlers/open.js';
export { resolvePanelFields } from '../utils/fields.js';

import {
  handleAiAction,
} from '../handlers/triage.js';
export {
  generateTriage,
  runTriageModel,
  getUserTicketHistory,
  freshTriage,
  buildTriageEmbed,
  buildTriageActions,
  sendClaimBrief,
  sendAssignmentBrief,
} from '../handlers/triage.js';

const CUSTOM_ID_PREFIX = 'ticket:';

export function isTicketInteraction(interaction: Interaction): boolean {
  if (interaction.isButton()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  if (interaction.isStringSelectMenu()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  if (interaction.isModalSubmit()) return interaction.customId.startsWith(CUSTOM_ID_PREFIX);
  return false;
}

export async function handleTicketInteraction(
  ctx: AddonContext,
  interaction: Interaction,
): Promise<void> {
  if (interaction.isButton()) {
    await handleButton(ctx, interaction);
  } else if (interaction.isStringSelectMenu()) {
    await handleSelect(ctx, interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModal(ctx, interaction);
  }
}

async function handleSelect(ctx: AddonContext, interaction: StringSelectMenuInteraction): Promise<void> {
  const id = interaction.customId;
  if (id.startsWith('ticket:select:')) {

    const panelId = id.slice('ticket:select:'.length);
    const buttonId = interaction.values[0];
    await handleOpenTicket(ctx, interaction, panelId, buttonId);
  }
}

async function handleButton(ctx: AddonContext, interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith('ticket:open:')) {

    const parts = id.slice('ticket:open:'.length).split(':');
    const panelId = parts[0];
    const buttonId = parts[1];
    await handleOpenTicket(ctx, interaction, panelId, buttonId);
  } else if (id.startsWith('ticket:close:')) {
    const channelId = id.slice('ticket:close:'.length);
    await handleCloseButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:claim:')) {
    const channelId = id.slice('ticket:claim:'.length);
    await handleClaimButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:unclaim:')) {
    const channelId = id.slice('ticket:unclaim:'.length);
    await handleUnclaimButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:transcript:')) {
    const channelId = id.slice('ticket:transcript:'.length);
    await handleTranscriptButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:reopen:')) {
    const channelId = id.slice('ticket:reopen:'.length);
    await handleReopenButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:rate:')) {
    const parts = id.split(':');
    const guildId = parts[2];
    const channelId = parts[3];
    const rating = parseInt(parts[4] ?? '0', 10);
    await handleRateButton(ctx, interaction, guildId, channelId, rating);
  } else if (id.startsWith('ticket:waiting:')) {
    const channelId = id.slice('ticket:waiting:'.length);
    await handleWaitingButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:ai:')) {
    await handleAiAction(ctx, interaction, id);
  } else if (id.startsWith('ticket:keepopen:')) {
    const channelId = id.slice('ticket:keepopen:'.length);
    await handleKeepOpenButton(ctx, interaction, channelId);
  } else if (id.startsWith('ticket:confirmclose:')) {
    const channelId = id.slice('ticket:confirmclose:'.length);
    await handleConfirmCloseButton(ctx, interaction, channelId);
  }
}

async function handleModal(ctx: AddonContext, interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith('ticket:reason:')) {

    const parts = id.slice('ticket:reason:'.length).split(':');
    await handleReasonModal(ctx, interaction, parts[0], parts[1]);
  } else if (id.startsWith('ticket:rate-modal:')) {
    const parts = id.split(':');
    const guildId = parts[2];
    const channelId = parts[3];
    const rating = parseInt(parts[4] ?? '0', 10);
    await handleRateModal(ctx, interaction, guildId, channelId, rating);
  }
}

async function handleWaitingButton(
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
    await interaction.reply({ content: t('onlyStaffWaiting'), flags: MessageFlags.Ephemeral });
    return;
  }

  if (ticket.status === 'waiting') {
    ticket.status = ticket.claimedBy ? 'claimed' : 'open';
    ticket.lastActivity = new Date().toISOString();
    await saveTicket(ctx.storage, interaction.guildId, ticket);
    await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
    await interaction.reply({ content: t('markedActive'), flags: MessageFlags.Ephemeral });
  } else {
    ticket.status = 'waiting';
    ticket.lastActivity = new Date().toISOString();
    await saveTicket(ctx.storage, interaction.guildId, ticket);
    await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
    await interaction.reply({ content: t('setWaiting'), flags: MessageFlags.Ephemeral });
  }
}

/**
 * Notifies Discord-side staff when a note is added from the web dashboard.
 * The note is already saved to the DB by the API before this publishes —
 * this only makes sure staff actually see it happened, via the configured
 * staff-notify channel (the same channel used for new-ticket pings).
 */
export async function notifyNoteAdded(ctx: AddonContext, ticket: Ticket, guildId: string, note: TicketNote): Promise<void> {
  const config = await getConfig(ctx.storage, guildId);
  if (!config.staffNotifyChannelId) return;

  const guild = ctx.getGuild(guildId);
  if (!guild) return;

  const notifyChannel = guild.channels.cache.get(config.staffNotifyChannelId) as TextChannel | undefined;
  if (!notifyChannel?.isTextBased() || !('send' in notifyChannel)) return;

  const preview = note.content.length > 300 ? `${note.content.slice(0, 300)}…` : note.content;
  await notifyChannel.send(
    `📝 Note added on ticket **#${ticket.number}** by **${note.authorTag}** (staff portal)\n> ${preview.replace(/\n/g, '\n> ')}\n→ <#${ticket.channelId}>`,
  ).catch(() => null);
}

