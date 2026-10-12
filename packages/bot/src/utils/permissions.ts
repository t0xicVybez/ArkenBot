/**
 * Small permission helpers shared by commands.
 *
 * These answer common "is this person allowed?" questions in one place so the
 * rules stay consistent across every command.
 */
import {
  type GuildMember,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { config } from '../config.js';

// Bot owners are listed in config (BOT_OWNER_IDS) and bypass normal checks.
export function isBotOwner(userId: string): boolean {
  return config.owners.includes(userId);
}

// Guild admins either hold Administrator or are the server owner.
export function isGuildAdmin(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.guild.ownerId === member.id
  );
}

// "Moderator" is anyone who can manage messages, kick, or ban (admins included).
export function isModerator(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    isGuildAdmin(member)
  );
}

/**
 * Whether `moderator` is allowed to act on `target`. The server owner can't be
 * targeted; the owner can target anyone; otherwise the moderator must sit
 * strictly above the target in the role hierarchy.
 */
export function canModerate(moderator: GuildMember, target: GuildMember): boolean {
  if (target.guild.ownerId === target.id) return false;
  if (moderator.guild.ownerId === moderator.id) return true;
  return moderator.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

// True only if the caller has every one of the required permission flags.
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
