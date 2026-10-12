/**
 * Scheduling math. `computeNextOccurrence` advances a recurring schedule to its next run with timezone-aware wall-clock handling. Pure, so it's covered by unit tests.
 */
export type RepeatInterval = 'hourly' | 'daily' | 'weekly';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

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
  if (hour === 24) hour = 0;
  return {
    year: parseInt(p.year, 10),
    month: parseInt(p.month, 10),
    day: parseInt(p.day, 10),
    hour,
    minute: parseInt(p.minute, 10),
    weekday: WEEKDAY[p.weekday as string] ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

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

  utc = naiveUtc - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

export function computeNextOccurrence(
  base: Date,
  repeat: string | null | undefined,
  timeZone?: string | null,
  daysOfWeek?: number[] | null,
): Date | null {
  if (!repeat) return null;
  const tz = timeZone && timeZone.length ? timeZone : 'UTC';

  if (repeat === 'hourly') {

    return new Date(base.getTime() + 60 * 60 * 1000);
  }

  const parts = getZonedParts(base, tz);
  const atLocal = (year: number, month: number, day: number): Date =>
    wallClockToUtc(year, month, day, parts.hour, parts.minute, tz);

  if (repeat === 'daily') {

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
