/**
 * channel helpers for the tickets addon.
 */
import {
  ChannelType,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  type Guild,
  type GuildMember,
  type TextChannel,
  type CategoryChannel,
  type TextChannel as DjsTextChannel,
} from 'discord.js';
import type { Ticket, TicketPanel } from '../types.js';

export function resolveChannelName(panel: TicketPanel, number: number, username: string, categoryTag?: string): string {
  const category = (categoryTag ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'ticket';
  return panel.namingPattern
    .replace(/\{category\}/g, category)
    .replace(/\{number\}/g, String(number).padStart(4, '0'))
    .replace(/\{username\}/g, username.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .slice(0, 100);
}

export async function createTicketChannel(
  guild: Guild,
  panel: TicketPanel,
  member: GuildMember,
  channelName: string,
): Promise<TextChannel> {

  const permissionOverwrites: import('discord.js').OverwriteResolvable[] = [
    {
      id: guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {

      id: guild.client.user!.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
      ],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  for (const roleId of panel.staffRoles) {
    if (guild.roles.cache.has(roleId)) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      });
    }
  }

  const category = panel.categoryId
    ? (guild.channels.cache.get(panel.categoryId) as CategoryChannel | undefined)
    : undefined;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category ?? undefined,
    permissionOverwrites,
    topic: `Ticket #${channelName} | Opened by ${member.displayName}`,
  });

  return channel as TextChannel;
}

export async function archiveTicketChannel(
  channel: TextChannel,
  ticket: Ticket,
): Promise<void> {
  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: false,
    SendMessages: false,
  });
  await channel.setName(`archived-${channel.name}`.slice(0, 100));
  await channel.setTopic(`[ARCHIVED] Ticket #${ticket.number}`);
}

export async function restoreTicketChannel(
  channel: TextChannel,
  ticket: Ticket,
): Promise<void> {
  await channel.permissionOverwrites.edit(ticket.userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
  const newName = channel.name.startsWith('archived-')
    ? channel.name.slice('archived-'.length)
    : channel.name;
  await channel.setName(newName);
  await channel.setTopic(`Ticket #${ticket.number} | Reopened`);
}

export async function createTicketThread(
  guild: Guild,
  panel: TicketPanel,
  member: GuildMember,
  threadName: string,
): Promise<import('discord.js').ThreadChannel> {
  const parentChannel = panel.categoryId
    ? (guild.channels.cache.get(panel.categoryId) as DjsTextChannel | undefined)
    : undefined;

  if (!parentChannel?.isTextBased()) {
    throw new Error('Thread mode requires a valid parent text channel set as the category.');
  }

  const thread = await (parentChannel as DjsTextChannel).threads.create({
    name: threadName,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    type: ChannelType.PrivateThread,
    reason: `Ticket opened by ${member.displayName}`,
  });

  await thread.members.add(member.id);
  await thread.members.add(guild.client.user!.id);

  return thread;
}

export async function addUserToTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
}

export async function removeUserFromTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.delete(userId);
}
