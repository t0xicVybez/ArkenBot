/**
 * Staff-permission resolution for tickets — one shared implementation used
 * by every command/button/handler that needs to know "is this member staff
 * for this ticket", so button-level staffRoles overrides are honored
 * consistently everywhere instead of each call site reimplementing it.
 */
import type { GuildMember } from 'discord.js';
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
 * Whether a member counts as staff for this ticket. No panel, or an empty
 * effective role list, means "everyone is staff" — matching the behavior
 * every call site already relied on.
 */
export function isTicketStaff(
  panel: TicketPanel | null | undefined,
  ticket: Ticket,
  member: GuildMember | null | undefined,
): boolean {
  if (!panel) return true;
  const roles = effectiveStaffRoles(panel, ticket);
  return roles.length === 0 || roles.some((rid) => member?.roles.cache.has(rid) ?? false);
}
