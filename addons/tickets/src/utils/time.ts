/**
 * time helpers for the tickets addon.
 */
import type { BusinessHours } from '../types.js';

/**
 * Whether a closed ticket is still within its panel's reopen window.
 * `reopenWindowHours` undefined or 0 means unlimited (always allowed) —
 * the feature is opt-in per panel, off by default. A ticket that was
 * never closed (no closedAt) is always allowed through here; callers are
 * expected to have already checked status === 'closed' before this.
 */
export function isReopenAllowed(reopenWindowHours: number | undefined, closedAt: string | undefined, nowMs: number): boolean {
  if (!reopenWindowHours || reopenWindowHours <= 0) return true;
  if (!closedAt) return true;
  const closedMs = new Date(closedAt).getTime();
  if (Number.isNaN(closedMs)) return true;
  return nowMs - closedMs < reopenWindowHours * 3600 * 1000;
}

export function isWithinBusinessHours(bh: BusinessHours, nowMs: number): boolean {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: bh.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));

    const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const wd = wdMap[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? -1;
    if (!(bh.days ?? []).includes(wd)) return false;

    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
    const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    const cur = hh * 60 + mm;

    const [oh, om] = (bh.openTime ?? '00:00').split(':').map((n) => parseInt(n, 10));
    const [ch, cm] = (bh.closeTime ?? '00:00').split(':').map((n) => parseInt(n, 10));
    const open = oh * 60 + om;
    const close = ch * 60 + cm;

    if (close <= open) return cur >= open || cur < close;
    return cur >= open && cur < close;
  } catch {
    return true;
  }
}
