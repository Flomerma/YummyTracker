import { bucketUrgency } from "./bucket-urgency";
import { diffInDays, isIsoDate } from "./date";
import type {
  BuildDigestInput,
  DigestCandidateItem,
  DigestEntry,
  DigestResult,
} from "./types";

/**
 * `buildDigest` — decides what goes into today's mail.
 *
 * Three questions, in this order:
 *
 * 1. **Is the item eligible at all?** It must be active, have a usable date,
 *    and not already have been asked about (`digest_log`). Asking twice about
 *    the same yoghurt is exactly how a daily mail gets filtered away.
 * 2. **Is it due today?** Within `leadDays` of expiring — with the one day
 *    grace period for estimated dates described below.
 * 3. **How bad is it?** `urgent` for expired / today / tomorrow, `soon` for
 *    everything else still inside the lead time.
 *
 * ## The one day grace period for estimated dates
 *
 * Section 14 of the concept: an item whose `expiry_source` is not `'label'`
 * triggers its question one day *later* than one whose date was read off the
 * package. The catalogue says the yoghurt keeps ten days; that is a guess, and
 * warning about a guess as loudly as about a printed date trains people to
 * ignore the mail.
 *
 * Implemented as an offset on the eligibility test only:
 *
 *     effectiveDaysLeft = daysLeft + (estimated ? 1 : 0)
 *     eligible          = effectiveDaysLeft <= leadDays
 *
 * The *bucket* still uses the real `daysLeft`, because that is the number the
 * reader sees. An estimated item therefore appears one calendar day later than
 * a label item would, and then shows its true urgency.
 *
 * `'manual'` counts as estimated here, because the concept's rule is literally
 * "`expiry_source` is not `label`". Arguably a hand-typed date deserves the
 * same trust as a printed one — see the note in the task summary; changing it
 * is a one-line change to `isEstimated`.
 *
 * ## Ordering and determinism
 *
 * Both groups are sorted by date, then by display name, then by id. String
 * comparison is used rather than `localeCompare`, so the order cannot change
 * with the locale of the machine that runs the nightly job.
 *
 * `today` is a parameter. This function never reads the clock, so a missed
 * nightly run can be replayed for the day it should have covered.
 */

/** Household default for "Vorwarnzeit" when nothing else is configured. */
export const DEFAULT_LEAD_DAYS = 3;

/** An item whose date was not read off the package warns a day later. */
export const ESTIMATED_GRACE_DAYS = 1;

export function buildDigest(input: BuildDigestInput): DigestResult {
  const today = input?.today;
  if (!isIsoDate(today)) return { urgent: [], soon: [] };

  const leadDays = normalizeLeadDays(input?.leadDays);
  const alreadyNotified = new Set(
    (input?.alreadyNotifiedItemIds ?? []).filter(
      (id): id is string => typeof id === "string",
    ),
  );

  const urgent: DigestEntry[] = [];
  const soon: DigestEntry[] = [];

  for (const item of input?.items ?? []) {
    const entry = toEntry(item, today, leadDays, alreadyNotified);
    if (entry === null) continue;
    if (
      entry.urgency === "expired" ||
      entry.urgency === "today" ||
      entry.urgency === "tomorrow"
    ) {
      urgent.push(entry);
    } else {
      soon.push(entry);
    }
  }

  urgent.sort(compareEntries);
  soon.sort(compareEntries);
  return { urgent, soon };
}

/** `true` when the date is a guess rather than something read off the package. */
export function isEstimated(
  item: Pick<DigestCandidateItem, "expirySource">,
): boolean {
  return item.expirySource !== "label";
}

function normalizeLeadDays(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return DEFAULT_LEAD_DAYS;
  }
  return value;
}

function toEntry(
  item: DigestCandidateItem | null | undefined,
  today: string,
  leadDays: number,
  alreadyNotified: ReadonlySet<string>,
): DigestEntry | null {
  if (!item || typeof item.id !== "string") return null;

  // `status` is optional so callers may pass a pre-filtered active list; when
  // it is present it must say `active`.
  if (item.status !== undefined && item.status !== "active") return null;

  if (alreadyNotified.has(item.id)) return null;

  const expiresAt = item.expiresAt;
  if (!isIsoDate(expiresAt)) return null; // no date → never a question

  const daysLeft = diffInDays(today, expiresAt);
  if (daysLeft === null) return null;

  const estimated = isEstimated(item);
  const effectiveDaysLeft = daysLeft + (estimated ? ESTIMATED_GRACE_DAYS : 0);
  if (effectiveDaysLeft > leadDays) return null;

  return {
    itemId: item.id,
    displayName: typeof item.displayName === "string" ? item.displayName : "",
    expiresAt,
    expirySource: item.expirySource,
    daysLeft,
    urgency: bucketUrgency(expiresAt, today),
    estimated,
  };
}

function compareEntries(a: DigestEntry, b: DigestEntry): number {
  if (a.expiresAt !== b.expiresAt) return a.expiresAt < b.expiresAt ? -1 : 1;
  if (a.displayName !== b.displayName)
    return a.displayName < b.displayName ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}
