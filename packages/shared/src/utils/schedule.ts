/**
 * Timezone-aware scheduling helpers for repeating scheduled messages.
 *
 * A scheduled message stores its next fire time as a UTC `Date` plus an optional
 * IANA `timezone` (e.g. "Asia/Bangkok") and, for weekly repeats, an optional set
 * of `daysOfWeek` (0 = Sunday … 6 = Saturday). The wall-clock time-of-day is
 * derived from the stored instant interpreted in the timezone, so repeats land
 * on the same local time even across DST changes.
 *
 * Uses the runtime's Intl timezone database — no external date library.
 */

export type RepeatInterval = 'hourly' | 'daily' | 'weekly';

/** Wall-clock parts of a UTC instant, as observed in `timeZone`. */
export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sun … 6 = Sat
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Break a UTC instant into its wall-clock parts in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // some engines format midnight as 24
  return {
    year: parseInt(p.year, 10),
    month: parseInt(p.month, 10),
    day: parseInt(p.day, 10),
    hour,
    minute: parseInt(p.minute, 10),
    weekday: WEEKDAY[p.weekday as string] ?? 0,
  };
}

/** Offset (localTime − UTC) in ms for `timeZone` at the given instant. */
function offsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

/**
 * Convert a wall-clock time in `timeZone` to the corresponding UTC `Date`.
 * `month` is 1-12. Refines once to stay correct across DST offset changes.
 */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = naiveUtc - offsetMs(new Date(naiveUtc), timeZone);
  // Re-evaluate the offset at the computed instant (handles DST boundaries).
  utc = naiveUtc - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/**
 * Compute the next fire time after `base` for a repeating schedule, preserving
 * the wall-clock time-of-day in `timeZone`.
 *
 * @param base       The current (just-fired) fire time, in UTC.
 * @param repeat     Interval, or null for a one-shot (returns null).
 * @param timeZone   IANA timezone; defaults to UTC when null/empty.
 * @param daysOfWeek For weekly repeats, the allowed weekdays (0=Sun…6=Sat).
 *                   Empty falls back to "every 7 days".
 */
export function computeNextOccurrence(
  base: Date,
  repeat: string | null | undefined,
  timeZone?: string | null,
  daysOfWeek?: number[] | null,
): Date | null {
  if (!repeat) return null;
  const tz = timeZone && timeZone.length ? timeZone : 'UTC';

  if (repeat === 'hourly') {
    // Wall clock is irrelevant for hourly — just advance one hour.
    return new Date(base.getTime() + 60 * 60 * 1000);
  }

  const parts = getZonedParts(base, tz);
  const atLocal = (year: number, month: number, day: number): Date =>
    wallClockToUtc(year, month, day, parts.hour, parts.minute, tz);

  if (repeat === 'daily') {
    // Same wall-clock time, next calendar day in the timezone.
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
    return atLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  if (repeat === 'weekly') {
    const days = (daysOfWeek ?? []).filter((n) => n >= 0 && n <= 6);
    let inc = 7;
    if (days.length) {
      const set = new Set(days);
      for (let i = 1; i <= 7; i++) {
        if (set.has((parts.weekday + i) % 7)) {
          inc = i;
          break;
        }
      }
    }
    const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + inc));
    return atLocal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return null;
}
