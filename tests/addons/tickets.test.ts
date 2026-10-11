import { describe, it, expect } from 'vitest';
import { applyCannedVars, pickEmoji } from '../../addons/tickets/src/utils/format.js';
import { resolveChannelName } from '../../addons/tickets/src/utils/channel.js';
import { isWithinBusinessHours } from '../../addons/tickets/src/utils/time.js';
import type { TicketPanel, BusinessHours } from '../../addons/tickets/src/types.js';

// ─── Canned-response placeholders ──────────────────────────────────────────────
describe('applyCannedVars', () => {
  const vars = { user: '<@1>', username: 'trucker', staff: '<@2>', staffname: 'senpai', ticket: '#9' };

  it('substitutes all known placeholders', () => {
    expect(applyCannedVars('Hi {user}, I am {staffname} on ticket {ticket}', vars))
      .toBe('Hi <@1>, I am senpai on ticket #9');
  });
  it('is case-insensitive', () => {
    expect(applyCannedVars('{User} {TICKET}', vars)).toBe('<@1> #9');
  });
  it('leaves unknown tokens untouched', () => {
    expect(applyCannedVars('{user} {nope} {role}', vars)).toBe('<@1> {nope} {role}');
  });
  it('handles repeats and no-placeholder text', () => {
    expect(applyCannedVars('{user} {user}', vars)).toBe('<@1> <@1>');
    expect(applyCannedVars('plain text', vars)).toBe('plain text');
  });
});

// ─── Emoji sanitizer ───────────────────────────────────────────────────────────
describe('pickEmoji', () => {
  it('keeps a custom emoji token', () => {
    expect(pickEmoji('<:feedback:123456789>')).toBe('<:feedback:123456789>');
    expect(pickEmoji('<a:spin:987654321>')).toBe('<a:spin:987654321>');
  });
  it('extracts a leading unicode emoji and drops trailing text', () => {
    expect(pickEmoji('🎫 feedback')).toBe('🎫');
    expect(pickEmoji('🎫')).toBe('🎫');
  });
  it('extracts a country flag', () => {
    expect(pickEmoji('🇺🇸 USA')).toBe('🇺🇸');
  });
  it('returns undefined for plain text / empty', () => {
    expect(pickEmoji('feedback')).toBeUndefined();
    expect(pickEmoji('')).toBeUndefined();
    expect(pickEmoji(undefined)).toBeUndefined();
    expect(pickEmoji('   ')).toBeUndefined();
  });
});

// ─── Channel naming ────────────────────────────────────────────────────────────
describe('resolveChannelName', () => {
  const panel = (namingPattern: string): TicketPanel => ({ namingPattern } as TicketPanel);

  it('pads the number to 4 digits', () => {
    expect(resolveChannelName(panel('ticket-{number}'), 9, 'Bob')).toBe('ticket-0009');
    expect(resolveChannelName(panel('ticket-{number}'), 1234, 'Bob')).toBe('ticket-1234');
  });
  it('substitutes {category} (lowercased, sanitized) from the button tag', () => {
    expect(resolveChannelName(panel('{category}-{number}'), 9, 'Bob', 'Con')).toBe('con-0009');
    expect(resolveChannelName(panel('{category}-{number}'), 9, 'Bob', 'Bug Report!')).toBe('bugreport-0009');
  });
  it('falls back {category} to "ticket" when no tag', () => {
    expect(resolveChannelName(panel('{category}-{number}'), 9, 'Bob')).toBe('ticket-0009');
  });
  it('sanitizes {username}', () => {
    expect(resolveChannelName(panel('t-{username}'), 9, 'Raging Trucker!')).toBe('t-ragingtrucker');
  });
  it('caps the result at 100 chars', () => {
    expect(resolveChannelName(panel('x'.repeat(200) + '{number}'), 9, 'Bob').length).toBe(100);
  });
});

// ─── Business hours ────────────────────────────────────────────────────────────
describe('isWithinBusinessHours', () => {
  const bh = (over: Partial<BusinessHours> = {}): BusinessHours => ({
    enabled: true, timezone: 'UTC', openTime: '09:00', closeTime: '17:00', days: [1, 2, 3, 4, 5], ...over,
  });
  // Fixed instants (UTC): 2026-10-12 is a Monday.
  const monday10 = Date.parse('2026-10-12T10:00:00Z'); // Mon 10:00 UTC
  const monday20 = Date.parse('2026-10-12T20:00:00Z'); // Mon 20:00 UTC
  const sunday10 = Date.parse('2026-10-11T10:00:00Z'); // Sun 10:00 UTC

  it('is open during hours on an active day', () => {
    expect(isWithinBusinessHours(bh(), monday10)).toBe(true);
  });
  it('is closed outside hours', () => {
    expect(isWithinBusinessHours(bh(), monday20)).toBe(false);
  });
  it('is closed on an inactive day', () => {
    expect(isWithinBusinessHours(bh(), sunday10)).toBe(false);
  });
  it('handles an overnight window (close <= open)', () => {
    const overnight = bh({ openTime: '22:00', closeTime: '06:00', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(isWithinBusinessHours(overnight, Date.parse('2026-10-12T23:30:00Z'))).toBe(true);  // late night
    expect(isWithinBusinessHours(overnight, Date.parse('2026-10-12T05:00:00Z'))).toBe(true);  // early morning
    expect(isWithinBusinessHours(overnight, monday10)).toBe(false);                            // midday
  });
  it('fails open on a bad timezone', () => {
    expect(isWithinBusinessHours(bh({ timezone: 'Not/AZone' }), monday20)).toBe(true);
  });
});
