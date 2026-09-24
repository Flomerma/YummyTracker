import { normalizeName } from "./normalize-name";
import type { ProductCandidate, ProductMatch } from "./types";

/**
 * `matchProduct` — fuzzy match of one receipt line against catalogue
 * candidates.
 *
 * ## Why this algorithm and no library
 *
 * The obvious choices would be `fuse.js` or `string-similarity`. Neither is
 * worth a dependency here, and more importantly neither is tuned for the shape
 * of the data:
 *
 * - Receipt lines are **abbreviated**: "POULET GESCHN." for
 *   "Pouletgeschnetzeltes", "HALBRAHM UHT" for "Halbrahm".
 * - German **glues words together**: one token in the catalogue can be two on
 *   the receipt and vice versa.
 * - Word **order varies**: "SALAT GEMISCHT" vs "Gemischter Salat".
 * - The strings are **short** (two to four tokens), so the O(n·m) cost of edit
 *   distance is irrelevant at a few hundred candidates.
 *
 * So the score combines two views of the same pair, each covering the other's
 * blind spot:
 *
 * **1. Token F1 (weight 0.7).** Every token of the receipt line is matched to
 * its best partner among the candidate's tokens, and vice versa. The two
 * directions are combined with a harmonic mean, so extra words on *either*
 * side cost something. This is what makes word order irrelevant and what
 * handles abbreviations, because a token pair scores on prefix and containment
 * before falling back to edit distance.
 *
 * **2. Character bigram Dice coefficient (weight 0.3).** Computed over the
 * pooled bigrams of all tokens, so it ignores word boundaries entirely. This
 * is the part that rescues the German compound case: "pouletgeschnetzeltes"
 * against "poulet geschnetzelt" shares almost every bigram while the token F1
 * sees two mismatched token counts.
 *
 * A pure edit distance on the whole string was tried on paper and rejected:
 * "SALAT GEMISCHT" vs "Gemischter Salat" is a near-total rewrite by edit
 * distance (score ≈ 0.2) although it is obviously the same product.
 *
 * ## Confidence
 *
 * `1` is reserved for an exact match of the normalized names — that is the
 * case `intake_lines.match_confidence` should let the UI auto-accept. Anything
 * below `MATCH_CONFIDENCE_FLOOR` is dropped rather than returned with a tiny
 * number: a list of near-zero matches is noise, and "no match" is a useful
 * answer on its own (it means: offer to create a product).
 */

/** Matches below this score are not returned at all. */
export const MATCH_CONFIDENCE_FLOOR = 0.3;

/** Weight of the token-level score against the character-level score. */
const TOKEN_WEIGHT = 0.7;
const BIGRAM_WEIGHT = 1 - TOKEN_WEIGHT;

/** Below this normalized edit-distance similarity, two tokens count as unrelated. */
const TOKEN_EDIT_FLOOR = 0.75;

/** Shortest token that may match by prefix or containment. */
const MIN_AFFIX_LENGTH = 3;

/**
 * Levenshtein distance, two-row variant.
 *
 * Only ever called on single tokens (a handful of characters), so the naive
 * implementation is more than fast enough and needs no dependency.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single rolling row plus two scalars, so one allocation per call instead
  // of a full (n+1)×(m+1) matrix. `?? 0` is only there to satisfy
  // `noUncheckedIndexedAccess`; every index below is provably in bounds.
  const width = b.length + 1;
  const row = new Uint32Array(width);
  for (let j = 0; j < width; j += 1) row[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    const charA = a.charCodeAt(i - 1);
    let diagonal = i - 1; // row[j-1] as it was before this pass
    let left = i; // the cell we just wrote
    row[0] = i;

    for (let j = 1; j < width; j += 1) {
      const above = row[j] ?? 0;
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      const value = Math.min(
        left + 1, // insertion
        above + 1, // deletion
        diagonal + cost, // substitution
      );
      row[j] = value;
      diagonal = above;
      left = value;
    }
  }
  return row[b.length] ?? 0;
}

/** Similarity of two single tokens, 0 … 1. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];

  // Abbreviation: "geschn" for "geschnetzelt".
  if (short.length >= MIN_AFFIX_LENGTH && long.startsWith(short)) return 0.9;

  // German compound: "poulet" inside "pouletbrust".
  if (short.length >= MIN_AFFIX_LENGTH + 1 && long.includes(short)) return 0.8;

  const similarity = 1 - levenshtein(a, b) / long.length;
  return similarity >= TOKEN_EDIT_FLOOR ? similarity : 0;
}

/** Character bigrams of a token, as a multiset. Single characters count as themselves. */
function bigrams(token: string): string[] {
  if (token.length < 2) return [token];
  const result: string[] = [];
  for (let i = 0; i < token.length - 1; i += 1) {
    result.push(token.slice(i, i + 2));
  }
  return result;
}

/** Sørensen–Dice coefficient over the pooled bigrams of all tokens. */
export function bigramDice(
  tokensA: readonly string[],
  tokensB: readonly string[],
): number {
  const a = tokensA.flatMap(bigrams);
  const b = tokensB.flatMap(bigrams);
  if (a.length === 0 || b.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const gram of a) pool.set(gram, (pool.get(gram) ?? 0) + 1);

  let shared = 0;
  for (const gram of b) {
    const left = pool.get(gram) ?? 0;
    if (left > 0) {
      pool.set(gram, left - 1);
      shared += 1;
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/** Mean best-partner similarity, in one direction. */
function directedCoverage(
  from: readonly string[],
  to: readonly string[],
): number {
  if (from.length === 0) return 0;
  let total = 0;
  for (const token of from) {
    let best = 0;
    for (const other of to) {
      const similarity = tokenSimilarity(token, other);
      if (similarity > best) best = similarity;
      if (best === 1) break;
    }
    total += best;
  }
  return total / from.length;
}

/** Harmonic mean of the two directions, so extra words on either side cost. */
export function tokenF1(a: readonly string[], b: readonly string[]): number {
  const precision = directedCoverage(a, b);
  const recall = directedCoverage(b, a);
  if (precision === 0 || recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function tokenize(normalized: string): string[] {
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Scores one normalized pair. Exported so the weighting can be inspected and
 * tested on its own rather than only through `matchProduct`.
 */
export function scoreNames(normalizedA: string, normalizedB: string): number {
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0;
  if (normalizedA === normalizedB) return 1;

  const tokensA = tokenize(normalizedA);
  const tokensB = tokenize(normalizedB);

  const score =
    TOKEN_WEIGHT * tokenF1(tokensA, tokensB) +
    BIGRAM_WEIGHT * bigramDice(tokensA, tokensB);

  // Never let a non-identical pair reach 1.0; that value means "certain".
  return Math.min(round3(score), 0.999);
}

/**
 * Matches a raw receipt line against catalogue candidates.
 *
 * Returns the candidates that score at least `MATCH_CONFIDENCE_FLOOR`, best
 * first. Ties are broken by the shorter candidate name and then by id, so the
 * order never depends on how the rows came out of the database.
 */
export function matchProduct(
  rawText: string,
  candidates: readonly ProductCandidate[],
): ProductMatch[] {
  const query = normalizeName(rawText);
  if (query.length === 0 || !Array.isArray(candidates)) return [];

  const scored: { match: ProductMatch; normalized: string }[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string") continue;

    // Prefer the stored normalized_name, but re-normalize it so a stale row
    // written by an older version of normalizeName cannot poison the score.
    const stored =
      typeof candidate.normalizedName === "string" &&
      candidate.normalizedName.length > 0
        ? candidate.normalizedName
        : candidate.name;
    const normalized = normalizeName(typeof stored === "string" ? stored : "");
    if (normalized.length === 0) continue;

    const confidence = scoreNames(query, normalized);
    if (confidence < MATCH_CONFIDENCE_FLOOR) continue;

    scored.push({ match: { productId: candidate.id, confidence }, normalized });
  }

  scored.sort((a, b) => {
    if (a.match.confidence !== b.match.confidence) {
      return b.match.confidence - a.match.confidence;
    }
    if (a.normalized.length !== b.normalized.length) {
      return a.normalized.length - b.normalized.length;
    }
    return a.match.productId < b.match.productId
      ? -1
      : a.match.productId > b.match.productId
        ? 1
        : 0;
  });

  return scored.map((entry) => entry.match);
}
