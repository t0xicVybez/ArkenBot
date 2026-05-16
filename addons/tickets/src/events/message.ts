import type { Message } from 'discord.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { TicketMessage } from '../types.js';
import { getTicketByChannel, appendMessage, saveTicket, getPanel } from '../utils/storage.js';
import { updateControlsMessage } from './interaction.js';

/**
 * Track messages inside ticket channels for transcript generation.
 * Also tracks first staff response time, updates lastActivity, and
 * automatically manages the waiting status:
 *   - Staff reply  → set ticket to "waiting" (waiting on user)
 *   - User reply when waiting → restore to "open" or "claimed"
 */
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
  const isStaff =
    !panel ||
    panel.staffRoles.length === 0 ||
    panel.staffRoles.some((rid) => member?.roles.cache.has(rid));

  // Track first staff response time
  if (!ticket.firstResponseAt && !isUser && isStaff) {
    ticket.firstResponseAt = now;
  }

  // Auto-waiting: staff reply → waiting; user reply when waiting → open/claimed
  let statusChanged = false;
  if (isStaff && !isUser && ticket.status !== 'waiting') {
    ticket.status = 'waiting';
    statusChanged = true;
  } else if (isUser && ticket.status === 'waiting') {
    ticket.status = ticket.claimedBy ? 'claimed' : 'open';
    statusChanged = true;
  }

  // Update last activity for auto-close tracking
  ticket.lastActivity = now;
  await saveTicket(ctx.storage, message.guildId, ticket);

  // Reflect the new waiting state in the controls message buttons
  if (statusChanged) {
    await updateControlsMessage(ctx, ticket, !!ticket.claimedBy).catch(() => null);
  }
}
