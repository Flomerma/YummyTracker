/**
 * Calendar date arithmetic on `'YYYY-MM-DD'` strings.
 *
 * Why this exists: the domain layer never hands `Date` objects across a
 * function boundary (see `types.ts`). Internally we still need to add days and
 * count differences, and doing that by hand invites off-by-one bugs at month
 * ends and in leap years. So we go through `Date.UTC` — the *only* `Date`
 * entry point that has no timezone at all — and convert straight back to a
 * string. Nothing here ever reads the machine's local time or clock.
 *
 * All functions are total: invalid input yields `null` / `false` instead of
 * throwing, because these rules run inside batch jobs (the nightly digest)
 * where one malformed row must not take down the whole run.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Parses `'YYYY-MM-DD'` into a UTC epoch-millisecond value at midnight.
 * Returns `null` for anything that is not a real calendar date.
 *
 * Rejects overflow dates such as `'2026-02-30'` or `'2026-13-01'` by
 * round-tripping through `Date.UTC` and comparing the parts — `Date.UTC`
 * silently rolls 30 February over into 2 March, which would otherwise make
 * a typo look like a valid date.
 */
export function parseIsoDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ms = Date.UTC(year, month - 1, day);
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/** `true` when `value` is a well formed, real `'YYYY-MM-DD'` date. */
export function isIsoDate(value: unknown): value is string {
  return parseIsoDate(value) !== null;
}

/** Formats a UTC epoch-millisecond value back to `'YYYY-MM-DD'`. */
export function formatIsoDate(ms: number): string {
  const date = new Date(ms);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Adds (or, with a negative `days`, subtracts) whole calendar days.
 * Returns `null` when `date` is not a valid ISO date or `days` is not a
 * finite integer.
 */
export function addDays(date: string, days: number): string | null {
  const ms = parseIsoDate(date);
  if (ms === null) return null;
  if (!Number.isFinite(days) || !Number.isInteger(days)) return null;
  return formatIsoDate(ms + days * MS_PER_DAY);
}

/**
 * Whole calendar days from `from` to `to`; negative when `to` lies earlier.
 * Returns `null` if either side is not a valid ISO date.
 *
 * Because both sides are UTC midnights there is no DST hour to lose, so plain
 * division is exact.
 */
export function diffInDays(from: string, to: string): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_PER_DAY);
}
