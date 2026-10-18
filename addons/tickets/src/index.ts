/**
 * The support-tickets addon — panels, per-ticket channels, claiming, AI triage, canned responses, transcripts and ratings. Tickets and their messages live in their own relational tables.
 */
import { defineAddon } from '@arkenbot/addon-sdk';
import { setTicketDb, type TicketDb } from './utils/db.js';
import type { AddonContext } from '@arkenbot/addon-sdk';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { AutocompleteInteraction, Interaction, Message, TextChannel } from 'discord.js';
import { Redis } from 'ioredis';
import { isWithinBusinessHours } from './utils/time.js';

import setupCommand from './commands/setup.js';
import ticketCommand from './commands/ticket.js';
import triageCommand from './commands/triage.js';
import { isTicketInteraction, handleTicketInteraction, closeTicket, notifyNoteAdded, updateControlsMessage } from './events/interaction.js';
import { handleTicketMessage } from './events/message.js';
import { getTickets, getPanels, getConfig, getPanel, getTicketByChannel, appendMessage, saveTicket } from './utils/storage.js';
import { initLiveSync, closeLiveSync } from './utils/liveSync.js';
import { buildPanelEmbed, buildPanelComponents } from './utils/embeds.js';
import type { TicketNote } from './types.js';
import { locales } from './locales.js';

const AUTO_CLOSE_INTERVAL_MS = 30 * 60 * 1000;
let autoCloseTimer: ReturnType<typeof setInterval> | null = null;
let redisSub: Redis | null = null;

export default defineAddon({
  locales,
  manifest: {
    name: 'tickets',
    displayName: 'Ticket System',
    version: '1.1.0',
    description:
      'Full-featured ticket system with panels, transcripts, auto-close, priorities, staff notes, ratings, canned responses, SLA warnings, webhooks, and a portal dashboard.',
    author: 't0xicVybez',
    commands: ['ticket-setup', 'ticket', 'triage'],
    settings: [],
  },

  commands: [setupCommand, ticketCommand, triageCommand],

  events: [
    {
      event: 'interactionCreate',
      handler: async (ctx: AddonContext, ...args: unknown[]): Promise<void> => {
        const interaction = args[0] as Interaction;

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
      if (ctx.db) setTicketDb(ctx.db as TicketDb);
      ctx.logger.info('Ticket System v1.1 loaded.');
      startAutoCloseLoop(ctx);
      await startPanelSyncListener(ctx);
      initLiveSync();
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
      await closeLiveSync();
    },
  },
});

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
            await notifyNoteAdded(ctx, ticket, guildId, note);
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

  await appendMessage(ctx.storage, channelId, {
    authorId: 'portal',
    authorTag: `${authorTag} (Portal)`,
    content,
    attachments: [],
    timestamp: now,
  });

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
    const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const selectPlaceholder = ctx.t('selectPlaceholder', loc);
    const msg = await channel.messages.fetch(panel.messageId);
    await msg.edit({ embeds: [buildPanelEmbed(panel, guild)], components: buildPanelComponents(panel, selectPlaceholder) });
    ctx.logger.info(`Auto-updated panel "${panel.name}" in guild ${guildId}`);
  } catch (err) {
    ctx.logger.warn(`Failed to auto-update panel message: ${String(err)}`);
  }
}

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
    const loc = await ctx.resolveLocale({ user: { id: '' }, guildId: guild.id, guildLocale: guild.preferredLocale });
    const t = (k: string, v?: Record<string, string | number>) => ctx.t(k, loc, v);
    const panels = await getPanels(ctx.storage, guild.id);
    const tickets = await getTickets(ctx.storage, guild.id);
    const config = await getConfig(ctx.storage, guild.id);

    if (config.weeklyDigestChannelId) {
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      const last = await ctx.storage.get<string>('digest:last', guild.id);
      if (!last) {

        await ctx.storage.set('digest:last', new Date(now).toISOString(), guild.id);
      } else if (now - new Date(last).getTime() >= WEEK) {
        await ctx.storage.set('digest:last', new Date(now).toISOString(), guild.id);
        const channel = ctx.client.channels.cache.get(config.weeklyDigestChannelId) as TextChannel | undefined;
        if (channel?.isTextBased()) {
          const weekAgo = now - WEEK;
          const opened = tickets.filter((x) => new Date(x.createdAt).getTime() >= weekAgo).length;
          const closed = tickets.filter((x) => x.closedAt && new Date(x.closedAt).getTime() >= weekAgo).length;
          const rated = tickets.filter((x) => typeof x.rating === 'number' && x.closedAt && new Date(x.closedAt).getTime() >= weekAgo);
          const rating = rated.length ? (rated.reduce((s, x) => s + (x.rating ?? 0), 0) / rated.length).toFixed(1) : '—';
          const openNow = tickets.filter((x) => x.status !== 'closed').length;
          await channel.send(t('digestMsg', { opened, closed, rating, open: openNow })).catch(() => null);
        }
      }
    }

    for (const ticket of tickets) {
      if (ticket.status === 'closed') continue;

      if (ticket.reminderAt && new Date(ticket.reminderAt).getTime() <= now) {
        const by = ticket.reminderBy;
        const note = ticket.reminderNote;
        ticket.reminderAt = undefined;
        ticket.reminderBy = undefined;
        ticket.reminderNote = undefined;
        await saveTicket(ctx.storage, guild.id, ticket);
        const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
        if (channel?.isTextBased()) {
          await channel.send(`${by ? `<@${by}> ` : ''}${t('reminderPing', { num: ticket.number })}${note ? `\n> ${note}` : ''}`).catch(() => null);
        }
      }

      if (ticket.status === 'waiting') continue;

      const panel = panels.find((p) => p.id === ticket.panelId);
      const lastActivity = new Date(ticket.lastActivity).getTime();
      const idleMs = now - lastActivity;

      if (panel && panel.autoCloseHours > 0 && config.nudgeBeforeCloseHours && config.nudgeBeforeCloseHours > 0 && !ticket.nudgedAt) {
        const closeMs = panel.autoCloseHours * 60 * 60 * 1000;
        const nudgeAtMs = (panel.autoCloseHours - config.nudgeBeforeCloseHours) * 60 * 60 * 1000;
        if (nudgeAtMs > 0 && idleMs >= nudgeAtMs && idleMs < closeMs) {
          ticket.nudgedAt = new Date().toISOString();
          await saveTicket(ctx.storage, guild.id, ticket);
          const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
          if (channel?.isTextBased()) {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId(`ticket:keepopen:${ticket.channelId}`).setLabel(t('btnKeepOpen')).setEmoji('🔓').setStyle(ButtonStyle.Success),
            );
            await channel.send({ content: t('nudgeMsg', { user: `<@${ticket.userId}>`, hours: config.nudgeBeforeCloseHours }), components: [row] }).catch(() => null);
          }
        }
      }

      if (panel && panel.autoCloseHours > 0) {
        const thresholdMs = panel.autoCloseHours * 60 * 60 * 1000;
        if (idleMs >= thresholdMs) {
          ctx.logger.info(`Auto-closing ticket #${ticket.number} in guild ${guild.id} (idle ${Math.floor(idleMs / 3600000)}h)`);
          try {
            const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
            if (channel?.isTextBased()) {
              await channel.send(
                t('autoClosedInactivity', { hours: panel.autoCloseHours }),
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
            await closeTicket(ctx, fakeInteraction, ticket, t('autoClosedReason'));
          } catch (err) {
            ctx.logger.error(`Failed to auto-close ticket #${ticket.number}`, String(err));
          }
          continue;
        }
      }

      if (config.businessHours?.enabled && config.businessHours.pauseSla && !isWithinBusinessHours(config.businessHours, now)) {
        continue;
      }

      if (config.slaLevels && config.slaLevels.length > 0 && !ticket.firstResponseAt) {
        const openMs = now - new Date(ticket.createdAt).getTime();
        for (const level of config.slaLevels.sort((a, b) => a.hours - b.hours)) {
          const slaMs = level.hours * 60 * 60 * 1000;
          const warnTag = `sla-level-${level.hours}h`;
          if (openMs >= slaMs && !ticket.tags.includes(warnTag)) {
            ticket.tags.push(warnTag);

            if (level.escalatePriority) ticket.priority = level.escalatePriority;
            await saveTicket(ctx.storage, guild.id, ticket);
            const channel = ctx.client.channels.cache.get(ticket.channelId) as import('discord.js').TextChannel | undefined;
            if (channel?.isTextBased()) {
              const pings = [level.pingRoleId, level.escalateRoleId].filter(Boolean).map((r) => `<@&${r}>`).join(' ');
              const rolePing = pings ? `${pings} ` : '';
              const msg = level.message ?? t('slaDefaultMsg', { num: ticket.number, hours: level.hours });
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
                t('slaWarningMsg', { hours: config.slaHours }),
              ).catch(() => null);
            }
          }
        }
      }
    }
  }
}
