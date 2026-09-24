import { addDays, isIsoDate, parseIsoDate } from "./date";
import type {
  ComputeExpiryInput,
  ComputeExpiryResult,
  ExpirySource,
} from "./types";

/**
 * `computeExpiry` — turns what we know about an item into one date plus its
 * provenance.
 *
 * Inputs, in order of authority:
 *
 *   1. `manualDate`  — a human typed it in. Nothing overrules a human.
 *   2. `labelDate`   — printed on the package.
 *   3. `openedOn + shelfLife.opened`   — the item is open and we know how
 *      long an open one keeps.
 *   4. `addedOn + shelfLife.unopened`  — the item is sealed (or we have no
 *      "opened" rule) and we know how long a sealed one keeps.
 *
 * ## The rule that matters: opened AND printed
 *
 * When an item is open *and* carries a printed date, **the earlier of the two
 * wins.** An opened milk does not last until the best-before date just because
 * the carton says so, and a milk opened today does not magically gain three
 * days past a best-before date that has already passed. Both are upper bounds;
 * the binding one is the smaller.
 *
 * The provenance then follows the date that won. On an exact tie we report
 * `'label'`, because the label is the stronger claim and because stage 2 warns
 * one day *earlier* for label dates — on a tie, warning earlier is the safe
 * side.
 *
 * ## What happens when the item is open but we have no "opened" rule
 *
 * We fall back to the *unopened* estimate rather than giving up. It is the
 * only information left, and an approximate date that can be corrected beats
 * no date at all — an item without a date never triggers a question and
 * therefore silently rots. The `expiry_source` makes the softness visible.
 *
 * ## Dates in, dates out
 *
 * Everything is a `'YYYY-MM-DD'` string. Malformed or impossible dates
 * (`'2026-02-30'`) are treated as absent rather than raising: this function
 * runs inside the nightly digest over every row of every household, and one
 * bad row must not abort the run.
 */

export function computeExpiry(input: ComputeExpiryInput): ComputeExpiryResult {
  const manualDate = normalizeDate(input?.manualDate);
  const labelDate = normalizeDate(input?.labelDate);
  const addedOn = normalizeDate(input?.addedOn);
  const openedOn = normalizeDate(input?.openedOn);
  const shelfLife = input?.shelfLife ?? null;

  // 1. A hand-typed date is the final word.
  if (manualDate !== null) {
    return { expiresAt: manualDate, source: "manual" };
  }

  const isOpened = openedOn !== null;

  // The estimate for an opened item, counted from the day it was opened.
  const openedEstimate =
    isOpened && shelfLife?.opened
      ? make(
          addDays(openedOn, shelfLife.opened.days),
          shelfLife.opened.origin.expirySource,
        )
      : null;

  // The estimate for a sealed item, counted from the day it entered the house.
  const unopenedEstimate =
    addedOn !== null && shelfLife?.unopened
      ? make(
          addDays(addedOn, shelfLife.unopened.days),
          shelfLife.unopened.origin.expirySource,
        )
      : null;

  const labelCandidate = labelDate !== null ? make(labelDate, "label") : null;

  if (isOpened) {
    // The rule from the concept: the earlier of printed date and opened
    // estimate. Ties go to the label.
    if (labelCandidate !== null && openedEstimate !== null) {
      return earlier(labelCandidate, openedEstimate);
    }
    // Only one of the two is available — take it.
    if (labelCandidate !== null) return labelCandidate;
    if (openedEstimate !== null) return openedEstimate;
    // Neither: the sealed estimate is all we have left.
    if (unopenedEstimate !== null) return unopenedEstimate;
    return NOTHING;
  }

  // Sealed: the printed date is exact, so nothing needs to be estimated.
  if (labelCandidate !== null) return labelCandidate;
  if (unopenedEstimate !== null) return unopenedEstimate;
  return NOTHING;
}

const NOTHING: ComputeExpiryResult = { expiresAt: null, source: "none" };

function normalizeDate(value: string | null | undefined): string | null {
  return isIsoDate(value) ? value : null;
}

function make(
  date: string | null,
  source: ExpirySource,
): ComputeExpiryResult | null {
  return date === null ? null : { expiresAt: date, source };
}

/**
 * The earlier of two results. On an equal date the *first* argument wins;
 * callers pass the label first so that a tie is reported as `'label'`.
 */
function earlier(
  a: ComputeExpiryResult,
  b: ComputeExpiryResult,
): ComputeExpiryResult {
  const msA = parseIsoDate(a.expiresAt);
  const msB = parseIsoDate(b.expiresAt);
  if (msA === null) return b;
  if (msB === null) return a;
  return msB < msA ? b : a;
}
