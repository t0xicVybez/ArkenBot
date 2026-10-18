/**
 * Message event handling for the tickets addon.
 */
import type { Message } from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { TicketMessage } from '../types.js';
import { getTicketByChannel, appendMessage, saveTicket, getPanel } from '../utils/storage.js';
import { updateControlsMessage } from './interaction.js';
import { isTicketStaff } from '../utils/permissions.js';

export async function handleTicketMessage(ctx: AddonContext, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId || !message.channelId) return;

  const ticket = await getTicketByChannel(ctx.storage, message.guildId, message.channelId);
  if (!ticket || ticket.status === 'closed') return;

  const msg: TicketMessage = {
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content ?? '',
    attachments: message.attachments.map((a) => a.url),
    timestamp: message.createdAt.toISOString(),
  };

  await appendMessage(ctx.storage, message.channelId, msg);

  const now = message.createdAt.toISOString();
  const isUser = message.author.id === ticket.userId;

  const panel = await getPanel(ctx.storage, message.guildId, ticket.panelId);
  const member = message.guild?.members.cache.get(message.author.id);
  const isStaff = isTicketStaff(panel, ticket, member);

  if (!ticket.firstResponseAt && !isUser && isStaff) {
    ticket.firstResponseAt = now;
  }

  let statusChanged = false;
  if (isStaff && !isUser && ticket.status !== 'waiting') {
    ticket.status = 'waiting';
    statusChanged = true;
  } else if (isUser && ticket.status === 'waiting') {
    ticket.status = ticket.claimedBy ? 'claimed' : 'open';
    statusChanged = true;
  }

  ticket.lastActivity = now;
  if (ticket.nudgedAt) ticket.nudgedAt = undefined;
  await saveTicket(ctx.storage, message.guildId, ticket);

  if (statusChanged) {
    await updateControlsMessage(ctx, ticket, !!ticket.claimedBy).catch(() => null);
  }
}
