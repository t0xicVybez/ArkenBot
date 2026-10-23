import { describe, it, expect } from 'vitest';
import type { GuildMember } from 'discord.js';
import { isTicketStaff } from '../../addons/tickets/src/utils/permissions.js';
import type { Ticket, TicketPanel } from '../../addons/tickets/src/types.js';

// discord.js's ManageChannels bit; the addon resolves the real constant at runtime.
const MANAGE_CHANNELS = 1n << 4n;

function member(opts: { roles?: string[]; manageChannels?: boolean }): GuildMember {
  const roles = new Map((opts.roles ?? []).map((r) => [r, true]));
  return {
    roles: { cache: roles },
    permissions: { has: (flag: bigint) => flag === MANAGE_CHANNELS && !!opts.manageChannels },
  } as unknown as GuildMember;
}

const ticket = { id: 't1', buttonId: undefined } as unknown as Ticket;
const panel = (staffRoles: string[], buttons?: TicketPanel['buttons']) =>
  ({ id: 'p1', staffRoles, buttons }) as unknown as TicketPanel;

describe('isTicketStaff', () => {
  it('does not treat the opener as staff just because the panel has no staff roles', () => {
    expect(isTicketStaff(panel([]), ticket, member({}))).toBe(false);
  });

  it('counts a member holding a panel staff role', () => {
    expect(isTicketStaff(panel(['staff']), ticket, member({ roles: ['staff'] }))).toBe(true);
  });

  it('rejects a member without a panel staff role', () => {
    expect(isTicketStaff(panel(['staff']), ticket, member({ roles: ['other'] }))).toBe(false);
  });

  it('lets a member who can manage channels act even without a staff role', () => {
    expect(isTicketStaff(panel(['staff']), ticket, member({ manageChannels: true }))).toBe(true);
    expect(isTicketStaff(panel([]), ticket, member({ manageChannels: true }))).toBe(true);
  });

  it('fails closed when the panel no longer exists', () => {
    expect(isTicketStaff(null, ticket, member({}))).toBe(false);
    expect(isTicketStaff(undefined, ticket, member({ roles: ['staff'] }))).toBe(false);
  });

  it('fails closed when there is no member object', () => {
    expect(isTicketStaff(panel(['staff']), ticket, undefined)).toBe(false);
  });

  it('honours a button-level staff role override', () => {
    const withButton = panel(['default-staff'], [{ id: 'b1', staffRoles: ['bug-team'] } as never]);
    const bugTicket = { id: 't2', buttonId: 'b1' } as unknown as Ticket;
    expect(isTicketStaff(withButton, bugTicket, member({ roles: ['bug-team'] }))).toBe(true);
    expect(isTicketStaff(withButton, bugTicket, member({ roles: ['default-staff'] }))).toBe(false);
  });
});
