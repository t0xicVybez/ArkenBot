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

/**
 * Resolve the ticket channel name from the panel naming pattern.
 * Supports {number}, {username}.
 */
export function resolveChannelName(panel: TicketPanel, number: number, username: string): string {
  return panel.namingPattern
    .replace('{number}', String(number).padStart(4, '0'))
    .replace('{username}', username.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .slice(0, 100);
}

/**
 * Create a private text channel for a ticket.
 * Grants view permission to the ticket owner and all staff roles.
 */
export async function createTicketChannel(
  guild: Guild,
  panel: TicketPanel,
  member: GuildMember,
  channelName: string,
): Promise<TextChannel> {
  // Base permission overwrites: deny everyone, allow the bot, allow the opener
  const permissionOverwrites: import('discord.js').OverwriteResolvable[] = [
    {
      id: guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      // Bot must be explicitly granted access even when @everyone is denied
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

  // Allow each staff role
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

/**
 * Archive a ticket channel by removing the user's view permission.
 * Staff can still access the channel.
 */
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

/**
 * Restore an archived ticket channel — re-grant user access and strip the archived- prefix.
 */
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

/**
 * Add a user to an open ticket channel.
 */
export async function addUserToTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
}

/**
 * Remove a user from a ticket channel.
 */
export async function removeUserFromTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.delete(userId);
}
