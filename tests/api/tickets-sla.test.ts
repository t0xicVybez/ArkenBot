import { describe, it, expect } from 'vitest';
import { computeSlaBreach, computeSlaMissed, slaThresholdHours } from '../../packages/api/src/routes/addon-tickets.js';

const HOUR = 60 * 60 * 1000;
const now = Date.parse('2026-10-19T12:00:00Z');

function ticket(over: Record<string, unknown> = {}) {
  return {
    status: 'open',
    createdAt: new Date(now - 3 * HOUR).toISOString(),
    ...over,
  } as never;
}

describe('slaThresholdHours', () => {
  it('returns null when nothing is configured', () => {
    expect(slaThresholdHours({ blacklistedUsers: [] } as never)).toBeNull();
  });
  it('uses the legacy single slaHours when no tiers exist', () => {
    expect(slaThresholdHours({ blacklistedUsers: [], slaHours: 4 } as never)).toBe(4);
  });
  it('ignores slaHours of 0', () => {
    expect(slaThresholdHours({ blacklistedUsers: [], slaHours: 0 } as never)).toBeNull();
  });
  it('prefers the lowest tiered slaLevel over the legacy slaHours', () => {
    const config = { blacklistedUsers: [], slaHours: 24, slaLevels: [{ hours: 8 }, { hours: 2 }, { hours: 16 }] } as never;
    expect(slaThresholdHours(config)).toBe(2);
  });
});

describe('computeSlaBreach (live, open tickets only)', () => {
  const config = { blacklistedUsers: [], slaHours: 2 } as never;

  it('is false with no SLA configured', () => {
    expect(computeSlaBreach(ticket(), { blacklistedUsers: [] } as never, now)).toBe(false);
  });
  it('is false once the ticket has a first response', () => {
    expect(computeSlaBreach(ticket({ firstResponseAt: new Date(now - HOUR).toISOString() }), config, now)).toBe(false);
  });
  it('is false once the ticket is closed', () => {
    expect(computeSlaBreach(ticket({ status: 'closed' }), config, now)).toBe(false);
  });
  it('is true when still open, unanswered, and past the threshold', () => {
    expect(computeSlaBreach(ticket({ createdAt: new Date(now - 3 * HOUR).toISOString() }), config, now)).toBe(true);
  });
  it('is false when still within the threshold', () => {
    expect(computeSlaBreach(ticket({ createdAt: new Date(now - HOUR).toISOString() }), config, now)).toBe(false);
  });
});

describe('computeSlaMissed (retrospective, for per-staff adherence)', () => {
  const config = { blacklistedUsers: [], slaHours: 2 } as never;

  it('is false with no SLA configured', () => {
    expect(computeSlaMissed(ticket(), { blacklistedUsers: [] } as never, now)).toBe(false);
  });
  it('is false when the first response came within the threshold, even though the ticket is closed', () => {
    const t = ticket({
      status: 'closed',
      createdAt: new Date(now - 5 * HOUR).toISOString(),
      firstResponseAt: new Date(now - 4.5 * HOUR).toISOString(),
    });
    expect(computeSlaMissed(t, config, now)).toBe(false);
  });
  it('is true when the first response came after the threshold, even though the ticket is closed', () => {
    const t = ticket({
      status: 'closed',
      createdAt: new Date(now - 5 * HOUR).toISOString(),
      firstResponseAt: new Date(now - HOUR).toISOString(),
    });
    expect(computeSlaMissed(t, config, now)).toBe(true);
  });
  it('is true for a still-open ticket with no response past the threshold (unlike computeSlaBreach, status does not matter here)', () => {
    expect(computeSlaMissed(ticket({ createdAt: new Date(now - 3 * HOUR).toISOString() }), config, now)).toBe(true);
  });
  it('is false for a still-open ticket with no response within the threshold', () => {
    expect(computeSlaMissed(ticket({ createdAt: new Date(now - HOUR).toISOString() }), config, now)).toBe(false);
  });
});
