import { describe, it, expect } from 'vitest';
import { applyCannedVars, pickEmoji } from '../../addons/tickets/src/utils/format.js';
import { resolveChannelName } from '../../addons/tickets/src/utils/channel.js';
import { isWithinBusinessHours, isReopenAllowed } from '../../addons/tickets/src/utils/time.js';
import { pickLeastLoadedAssignee } from '../../addons/tickets/src/utils/assign.js';
import type { TicketPanel, BusinessHours } from '../../addons/tickets/src/types.js';

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

describe('isWithinBusinessHours', () => {
  const bh = (over: Partial<BusinessHours> = {}): BusinessHours => ({
    enabled: true, timezone: 'UTC', openTime: '09:00', closeTime: '17:00', days: [1, 2, 3, 4, 5], ...over,
  });

  const monday10 = Date.parse('2026-10-12T10:00:00Z');
  const monday20 = Date.parse('2026-10-12T20:00:00Z');
  const sunday10 = Date.parse('2026-10-11T10:00:00Z');

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
    expect(isWithinBusinessHours(overnight, Date.parse('2026-10-12T23:30:00Z'))).toBe(true);
    expect(isWithinBusinessHours(overnight, Date.parse('2026-10-12T05:00:00Z'))).toBe(true);
    expect(isWithinBusinessHours(overnight, monday10)).toBe(false);
  });
  it('fails open on a bad timezone', () => {
    expect(isWithinBusinessHours(bh({ timezone: 'Not/AZone' }), monday20)).toBe(true);
  });
});

describe('pickLeastLoadedAssignee', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('returns null for an empty candidate list', () => {
    expect(pickLeastLoadedAssignee([], new Map(), 0)).toBeNull();
  });

  it('picks the single candidate when there is only one', () => {
    const result = pickLeastLoadedAssignee([a], new Map(), 0);
    expect(result?.assignee).toBe(a);
    expect(result?.nextIndex).toBe(0);
  });

  it('picks whoever has the fewest open tickets, ignoring round-robin index', () => {
    const load = new Map([['a', 3], ['b', 0], ['c', 1]]);
    const result = pickLeastLoadedAssignee([a, b, c], load, 5);
    expect(result?.assignee).toBe(b);
  });

  it('treats an unlisted candidate as load 0', () => {
    const load = new Map([['a', 2]]);
    const result = pickLeastLoadedAssignee([a, b], load, 0);
    expect(result?.assignee).toBe(b);
  });

  it('breaks ties by round-robin order and advances the index within the tied group', () => {
    const load = new Map([['a', 0], ['b', 0], ['c', 5]]);
    const first = pickLeastLoadedAssignee([a, b, c], load, 0);
    expect(first?.assignee).toBe(a);
    expect(first?.nextIndex).toBe(1);

    const second = pickLeastLoadedAssignee([a, b, c], load, first!.nextIndex);
    expect(second?.assignee).toBe(b);
    expect(second?.nextIndex).toBe(0);
  });

  it('wraps the round-robin index back into range as the tied group shrinks', () => {
    // index was valid for a larger tied group last time; now only 1 is tied for least-loaded.
    const load = new Map([['a', 0], ['b', 9], ['c', 9]]);
    const result = pickLeastLoadedAssignee([a, b, c], load, 2);
    expect(result?.assignee).toBe(a);
    expect(result?.nextIndex).toBe(0);
  });
});

describe('isReopenAllowed', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const closedRecently = new Date(now - 2 * 3600 * 1000).toISOString();
  const closedLongAgo = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

  it('allows reopening when the window is unset (unlimited, the default)', () => {
    expect(isReopenAllowed(undefined, closedLongAgo, now)).toBe(true);
  });

  it('allows reopening when the window is 0 (explicitly unlimited)', () => {
    expect(isReopenAllowed(0, closedLongAgo, now)).toBe(true);
  });

  it('allows reopening within the window', () => {
    expect(isReopenAllowed(24, closedRecently, now)).toBe(true);
  });

  it('blocks reopening past the window', () => {
    expect(isReopenAllowed(24, closedLongAgo, now)).toBe(false);
  });

  it('allows reopening right at the boundary (strictly less-than, not less-or-equal)', () => {
    const exactlyAtLimit = new Date(now - 24 * 3600 * 1000).toISOString();
    expect(isReopenAllowed(24, exactlyAtLimit, now)).toBe(false);
    const justInside = new Date(now - 24 * 3600 * 1000 + 1000).toISOString();
    expect(isReopenAllowed(24, justInside, now)).toBe(true);
  });

  it('fails open when closedAt is missing or unparseable', () => {
    expect(isReopenAllowed(24, undefined, now)).toBe(true);
    expect(isReopenAllowed(24, 'not-a-date', now)).toBe(true);
  });
});
