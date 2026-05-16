import {
  type GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../config.js';

export function isBotOwner(userId: string): boolean {
  return config.owners.includes(userId);
}

export function isGuildAdmin(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.guild.ownerId === member.id
  );
}

export function isModerator(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    isGuildAdmin(member)
  );
}

export function canModerate(moderator: GuildMember, target: GuildMember): boolean {
  if (target.guild.ownerId === target.id) return false;
  if (moderator.guild.ownerId === moderator.id) return true;
  return moderator.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

export async function checkPermissions(
  interaction: ChatInputCommandInteraction,
  required: bigint[]
): Promise<boolean> {
  if (!interaction.memberPermissions) return false;
  for (const perm of required) {
    if (!interaction.memberPermissions.has(perm)) return false;
  }
  return true;
}
