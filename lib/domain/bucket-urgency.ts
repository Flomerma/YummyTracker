import { diffInDays } from "./date";
import type { Urgency } from "./types";

/**
 * `bucketUrgency` — sorts an item into the bucket the inventory list and the
 * daily mail are built from.
 *
 *   | days from today | bucket       |
 *   |-----------------|--------------|
 *   | no date         | `'unknown'`  |
 *   | negative        | `'expired'`  |
 *   | 0               | `'today'`    |
 *   | 1               | `'tomorrow'` |
 *   | 2 … 7           | `'thisWeek'` |
 *   | 8 and more      | `'ok'`       |
 *
 * "Innert 7 Tagen" is read inclusively: an item that expires exactly seven
 * days from today still belongs to this week. Day eight is `'ok'`.
 *
 * The comparison is a plain calendar-day difference, not an elapsed-time
 * difference — 23:59 today and 00:01 tomorrow are a full bucket apart, which
 * is exactly how a person reads a best-before date.
 *
 * `today` is a parameter, never `new Date()`. The function stays pure, tests
 * need no clock faking, and the nightly job can build yesterday's digest by
 * passing yesterday.
 *
 * A malformed date on either side yields `'unknown'`: the honest answer is "we
 * do not know", and it keeps a broken row out of the mail instead of putting a
 * nonsense warning into it.
 */
export function bucketUrgency(
  expiresAt: string | null,
  today: string,
): Urgency {
  if (expiresAt === null || expiresAt === undefined) return "unknown";

  const days = diffInDays(today, expiresAt);
  if (days === null) return "unknown";

  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "thisWeek";
  return "ok";
}

/** Buckets that mean "act now", in the order the UI shows them. */
export const URGENT_BUCKETS: readonly Urgency[] = [
  "expired",
  "today",
  "tomorrow",
];

/**
 * Sort weight for the inventory view, which orders by urgency rather than
 * alphabetically. Lower sorts first.
 */
export const URGENCY_ORDER: Readonly<Record<Urgency, number>> = {
  expired: 0,
  today: 1,
  tomorrow: 2,
  thisWeek: 3,
  ok: 4,
  unknown: 5,
};
