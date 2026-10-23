/**
 * Staff-permission resolution for tickets — one shared implementation used
 * by every command/button/handler that needs to know "is this member staff
 * for this ticket", so button-level staffRoles overrides are honored
 * consistently everywhere instead of each call site reimplementing it.
 */
import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { Ticket, TicketPanel } from '../types.js';

/**
 * The staff roles that actually apply to a ticket: the panel button it was
 * opened from, if that button has its own staffRoles configured, else the
 * panel's own staffRoles. Falls back to the panel default when the ticket's
 * originating button can't be found (e.g. the button was since deleted).
 */
export function effectiveStaffRoles(panel: TicketPanel | null | undefined, ticket: Ticket): string[] {
  const button = panel?.buttons?.find((b) => b.id === ticket.buttonId);
  return button?.staffRoles ?? panel?.staffRoles ?? [];
}

/**
 * Whether a member can act as staff on this ticket. Fails closed: the opener
 * and other members are not staff just because a panel has no staff roles.
 * Members who can manage channels are always staff, so a server whose panel
 * was never given a staff role still has moderators who can work its tickets.
 */
export function isTicketStaff(
  panel: TicketPanel | null | undefined,
  ticket: Ticket,
  member: GuildMember | null | undefined,
): boolean {
  if (member?.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (!panel) return false;
  const roles = effectiveStaffRoles(panel, ticket);
  return roles.length > 0 && roles.some((rid) => member?.roles.cache.has(rid) ?? false);
}
