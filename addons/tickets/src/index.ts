import { defineAddon } from '@arkenbot/addon-sdk';
import type { AddonContext } from '@arkenbot/addon-sdk';
import type { AutocompleteInteraction, Interaction, Message, TextChannel } from 'discord.js';
import { Redis } from 'ioredis';

import setupCommand from './commands/setup.js';
import ticketCommand from './commands/ticket.js';
import { isTicketInteraction, handleTicketInteraction, closeTicket, postNoteToThread, updateControlsMessage } from './events/interaction.js';
import { handleTicketMessage } from './events/message.js';
import { getTickets, getPanels, getConfig, getPanel, getTicketByChannel, appendMessage, saveTicket } from './utils/storage.js';
import { buildPanelEmbed, buildPanelButtons } from './utils/embeds.js';
import type { TicketNote } from './types.js';

// Auto-close / SLA check interval (every 30 minutes)
const AUTO_CLOSE_INTERVAL_MS = 30 * 60 * 1000;
let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
let redisSub: Redis | null = null;

export default defineAddon({
  manifest: {
    name: 'tickets',
    displayName: 'Ticket System',
    version: '1.1.0',
    description:
      'Full-featured ticket system with panels, transcripts, auto-close, priorities, staff notes, ratings, canned responses, SLA warnings, webhooks, and a portal dashboard.',
    author: 't0ixcyVybez',
    commands: ['ticket-setup', 'ticket'],
    settings: [],
  },

  commands: [setupCommand, ticketCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;

        // Route autocomplete to the ticket command's autocomplete handler
        if (interaction.isAutocomplete()) {
          if (interaction.commandName === 'ticket' && ticketCommand.autocomplete) {
            await ticketCommand.autocomplete(interaction as AutocompleteInteraction, ctx);
          }
          return;
        }

        if (!isTicketInteraction(interaction)) return;
        await handleTicketInteraction(ctx, interaction);
      },
    },
    {
      event: 'messageCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const message = args[0] as Message;
        await handleTicketMessage(ctx, message);
      },
    },
  ],

  hooks: {
    async onLoad(ctx: AddonContext): Promise<void> {
      ctx.logger.info('Ticket System v1.1 loaded.');
      startAutoCloseLoop(ctx);
      await startPanelSyncListener(ctx);
    },

    async onUnload(_ctx: AddonContext): Promise<void> {
      if (autoCloseTimer) {
        clearInterval(autoCloseTimer);
        autoCloseTimer = null;
      }
      if (redisSub) {
        await redisSub.quit();
        redisSub = null;
      }
    },
  },
});

// ─── Panel Auto-Sync (Redis pub/sub) ─────────────────────────────────────────

async function startPanelSyncListener(ctx: AddonContext): Promise<void> {
  try {
    redisSub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    await redisSub.connect();
    await redisSub.subscribe('ticket:panel:updated', 'ticket:note:added', 'ticket:reply', 'ticket:priority:updated');

    redisSub.on('message', async (channel, message) => {
      try {
        if (channel === 'ticket:panel:updated') {
          const { guildId, panelId } = JSON.parse(message) as { guildId: string; panelId: string };
          await syncPanelMessage(ctx, guildId, panelId);
        } else if (channel === 'ticket:note:added') {
          const { guildId, channelId, note } = JSON.parse(message) as {
            guildId: string;
            channelId: string;
            note: TicketNote;
          };
          const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
          if (ticket) {
            await postNoteToThread(ctx, ticket, guildId, note);
          }
        } else if (channel === 'ticket:reply') {
          const { guildId, channelId, content, authorTag } = JSON.parse(message) as {
            guildId: string;
            channelId: string;
            content: string;
            authorTag: string;
          };
          await handlePortalReply(ctx, guildId, channelId, content, authorTag);
        } else if (channel === 'ticket:priority:updated') {
          const { guildId, channelId } = JSON.parse(message) as { guildId: string; channelId: string };
          const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
          if (ticket && ticket.status !== 'closed') {
            await updateControlsMessage(ctx, ticket, !!ticket.claimedBy);
          }
        }
      } catch (err) {
        ctx.logger.error('Failed to handle Redis event', String(err));
      }
    });

    ctx.logger.info('Panel auto-sync listener started.');
  } catch (err) {
    ctx.logger.warn(`Panel auto-sync listener failed to start: ${String(err)}`);
  }
}

async function handlePortalReply(
  ctx: AddonContext,
  guildId: string,
  channelId: string,
  content: string,
  authorTag: string,
): Promise<void> {
  const ticket = await getTicketByChannel(ctx.storage, guildId, channelId);
  if (!ticket || ticket.status === 'closed') return;

  const discordChannel = ctx.client.channels.cache.get(channelId) as TextChannel | undefined;
  if (!discordChannel?.isTextBased()) return;

  await discordChannel.send({ content: `**[Staff Portal · ${authorTag}]** ${content}` });

  const now = new Date().toISOString();

  // Append to transcript storage (bot messages are excluded from messageCreate, so do it manually)
  await appendMessage(ctx.storage, channelId, {
    authorId: 'portal',
    authorTag: `${authorTag} (Portal)`,
    content,
    attachments: [],
    timestamp: now,
  });

  // Staff reply → set to waiting (waiting on user response)
  const wasWaiting = ticket.status === 'waiting';
  if (!wasWaiting) {
    ticket.status = 'waiting';
  }
  ticket.lastActivity = now;
  if (!ticket.firstResponseAt) {
    ticket.firstResponseAt = now;
  }
  await saveTicket(ctx.storage, guildId, ticket);

  if (!wasWaiting) {
    await updateControlsMessage(ctx, ticket, !!ticket.claimedBy).catch(() => null);
  }
}

async function syncPanelMessage(ctx: AddonContext, guildId: string, panelId: string): Promise<void> {
  const panel = await getPanel(ctx.storage, guildId, panelId);
  if (!panel?.channelId || !panel.messageId) return;

  const guild = ctx.client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(panel.channelId) as TextChannel | undefined;
  if (!channel?.isTextBased()) return;

  try {
    const msg = await channel.messages.fetch(panel.messageId);
    await msg.edit({ embeds: [buildPanelEmbed(panel, guild)], components: buildPanelButtons(panel) });
    ctx.logger.info(`Auto-updated panel "${panel.name}" in guild ${guildId}`);
  } catch (err) {
    ctx.logger.warn(`Failed to auto-update panel message: ${String(err)}`);
  }
}

// ─── Auto-Close / SLA Loop ────────────────────────────────────────────────────

function startAutoCloseLoop(ctx: AddonContext): void {
  autoCloseTimer = setInterval(async () => {
    try {
      await runAutoCloseAndSLA(ctx);
    } catch (err) {
      ctx.logger.error('Auto-close/SLA check failed', String(err));
    }
  }, AUTO_CLOSE_INTERVAL_MS);
}

async function runAutoCloseAndSLA(ctx: AddonContext): Promise<void> {
  const now = Date.now();

  for (const guild of ctx.client.guilds.cache.values()) {
    const panels = await getPanels(ctx.storage, guild.id);
    const tickets = await getTickets(ctx.storage, guild.id);
    const config = await getConfig(ctx.storage, guild.id);

    for (const ticket of tickets) {
      if (ticket.status === 'closed' || ticket.status === 'waiting') continue;

      const panel = panels.find((p) => p.id === ticket.panelId);
      const lastActivity = new Date(ticket.lastActivity).getTime();
      const idleMs = now - lastActivity;

      // ── Auto-close ────────────────────────────────────────────────
      if (panel && panel.autoCloseHours > 0) {
        const thresholdMs = panel.autoCloseHours * 60 * 60 * 1000;
        if (idleMs >= thresholdMs) {
          ctx.logger.info(`Auto-closing ticket #${ticket.number} in guild ${guild.id} (idle ${Math.floor(idleMs / 3600000)}h)`);
          try {
            const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
            if (channel?.isTextBased()) {
              await channel.send(
                `⏰ This ticket has been automatically closed due to **${panel.autoCloseHours} hours** of inactivity.`,
              );
            }
            const fakeInteraction = {
              user: { id: ctx.client.user!.id, tag: 'System (Auto-close)' },
              guildId: guild.id,
              deferred: false,
              replied: false,
              reply: async () => {},
              editReply: async () => {},
            } as unknown as import('discord.js').ChatInputCommandInteraction;
            await closeTicket(ctx, fakeInteraction, ticket, 'Auto-closed due to inactivity');
          } catch (err) {
            ctx.logger.error(`Failed to auto-close ticket #${ticket.number}`, String(err));
          }
          continue; // skip SLA warning for auto-closed ticket
        }
      }

      // ── SLA Warning ───────────────────────────────────────────────
      if (config.slaLevels && config.slaLevels.length > 0 && !ticket.firstResponseAt) {
        const openMs = now - new Date(ticket.createdAt).getTime();
        for (const level of config.slaLevels.sort((a, b) => a.hours - b.hours)) {
          const slaMs = level.hours * 60 * 60 * 1000;
          const warnTag = `sla-level-${level.hours}h`;
          if (openMs >= slaMs && !ticket.tags.includes(warnTag)) {
            ticket.tags.push(warnTag);
            await (await import('./utils/storage.js')).saveTicket(ctx.storage, guild.id, ticket);
            const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
            if (channel?.isTextBased()) {
              const rolePing = level.pingRoleId ? `<@&${level.pingRoleId}> ` : '';
              const msg = level.message ?? `⚠️ **SLA Alert:** Ticket #${ticket.number} has been open for over **${level.hours} hours** without a staff response.`;
              await channel.send(`${rolePing}${msg}`).catch(() => null);
            }
          }
        }
      }
      if (config.slaHours && config.slaHours > 0 && !(config.slaLevels?.length)) {
        const slaMs = config.slaHours * 60 * 60 * 1000;
        const openMs = now - new Date(ticket.createdAt).getTime();
        if (openMs >= slaMs && !ticket.firstResponseAt) {
          const warnTag = `sla-warned`;
          if (!ticket.tags.includes(warnTag)) {
            ticket.tags.push(warnTag);
            await (await import('./utils/storage.js')).saveTicket(ctx.storage, guild.id, ticket);
            ctx.logger.warn(`SLA breach on ticket #${ticket.number} in guild ${guild.id}`);

            const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
            if (channel?.isTextBased()) {
              await channel.send(
                `⚠️ **SLA Warning:** This ticket has been open for over **${config.slaHours} hours** without a staff response.`,
              ).catch(() => null);
            }
          }
        }
      }
    }
  }
}
