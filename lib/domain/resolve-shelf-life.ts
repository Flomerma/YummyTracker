import type {
  ExpirySource,
  ResolveShelfLifeInput,
  ShelfLifeDays,
  ShelfLifeOrigin,
  ShelfLifeResult,
  ShelfLifeRule,
} from './types';

/**
 * `resolveShelfLife` — the fallback chain of section 4.3, as code.
 *
 *   household product rule  →  global product rule  →  category rule
 *
 * The concept stores the chain as data (`shelf_life_rules`) rather than as
 * `if`s. This function is therefore only a ranking: it scores every applicable
 * rule by precision and picks the best one.
 *
 * ## The interesting decision: a rule that hits but has no "opened" value
 *
 * A learned household rule often knows only one of the two numbers. Somebody
 * corrected the date of an unopened yoghurt twice, so `days_unopened` exists —
 * but nobody ever corrected an *opened* one, so `days_opened` is `null`.
 *
 * Three options were on the table:
 *
 *   (a) the rule wins outright; `daysOpened` becomes `null`
 *   (b) the rule is skipped entirely unless both values are present
 *   (c) the two values are resolved independently, each walking the chain
 *       on its own
 *
 * **We do (c).** Reasoning:
 *
 * - (a) destroys knowledge. The global catalogue knows that opened milk keeps
 *   three days. A household rule that only says "unopened: 10 days" would
 *   erase that and leave an opened milk with no date at all — the chain would
 *   have made the answer *worse* the more the app learned. That is the exact
 *   opposite of what a learning system should do.
 * - (b) throws away the good half. The household's own, twice-observed
 *   unopened value would be ignored because of a missing second field.
 * - (c) keeps both: the most precise rule that actually has a value for a
 *   given field wins that field. The two fields are independent facts about
 *   the product, and nothing about the data model ties them together.
 *
 * The price of (c) is that one result can carry two different origins — e.g.
 * `unopened` from a learned household rule, `opened` from the seed catalogue.
 * That is why `ShelfLifeDays` carries its own `origin` instead of the result
 * having one shared source field. The UI can then honestly say "10 Tage
 * (gelernt) / geöffnet 3 Tage (Katalog)".
 *
 * ## Precision ranking
 *
 * The concept names three levels. The data model also allows a *household*
 * category rule, so the full ranking is four levels wide; the concept's chain
 * is the subset of it that occurs in practice.
 *
 *   1. household + product   (learned)
 *   2. global   + product    (catalogue / AI)
 *   3. household + category
 *   4. global   + category   (safety net)
 *
 * Within one level, a rule that names the storage location explicitly beats a
 * rule that applies to any storage: "Rüebli im Kühlschrank" is a more precise
 * statement than "Rüebli".
 *
 * Remaining ties — two rules of exactly the same precision, which the data
 * model does not forbid — are broken deterministically: more observations
 * first (`sampleCount`), then the more recently updated rule, then the lower
 * `id`. A domain function must not depend on the order rows happened to come
 * back from Postgres.
 */

/** Ordered best-first, purely for documentation and testing. */
export const SHELF_LIFE_PRECISION = [
  'household-product',
  'global-product',
  'household-category',
  'global-category',
] as const;

export type ShelfLifePrecision = (typeof SHELF_LIFE_PRECISION)[number];

interface ScoredRule {
  readonly rule: ShelfLifeRule;
  readonly precision: number; // lower is better
  readonly storageExact: boolean;
}

/**
 * Which `expiry_source` an item inherits when this rule decides its date.
 *
 * A category rule always reports `'category'`, even when its own `source` is
 * `'ai'`: the field tells the user how *precise* the answer is, and "we used
 * the rule for the whole category" is the more important caveat than "a model
 * produced that number".
 */
function toExpirySource(
  rule: ShelfLifeRule,
): Extract<ExpirySource, 'learned' | 'catalog' | 'category' | 'ai'> {
  if (rule.scope === 'category') return 'category';
  if (rule.source === 'learned') return 'learned';
  if (rule.source === 'ai') return 'ai';
  return 'catalog';
}

/** A day count is usable if it is a whole number of days and not negative. */
function isUsableDays(days: unknown): days is number {
  return typeof days === 'number' && Number.isInteger(days) && days >= 0;
}

function toOrigin(scored: ScoredRule): ShelfLifeOrigin {
  const { rule } = scored;
  return {
    ruleId: rule.id,
    scope: rule.scope,
    ownership: rule.householdId === null ? 'global' : 'household',
    ruleSource: rule.source,
    storageMatch: scored.storageExact ? 'exact' : 'any',
    expirySource: toExpirySource(rule),
  };
}

/** Keeps only rules that could apply, and scores the ones that do. */
function scoreRules(input: ResolveShelfLifeInput): ScoredRule[] {
  const { productId, categoryId, householdId, storage, rules } = input;
  const scored: ScoredRule[] = [];

  for (const rule of rules ?? []) {
    if (!rule || typeof rule.id !== 'string') continue;

    // Another household's rule is never visible to us.
    const isHouseholdRule = rule.householdId !== null && rule.householdId !== undefined;
    if (isHouseholdRule && rule.householdId !== householdId) continue;

    // Subject must match.
    let scopeRank: number;
    if (rule.scope === 'product') {
      if (productId === null || rule.productId !== productId) continue;
      scopeRank = 0;
    } else if (rule.scope === 'category') {
      if (categoryId === null || rule.categoryId !== categoryId) continue;
      scopeRank = 2;
    } else {
      continue; // unknown scope — ignore rather than guess
    }

    // Storage must match. A rule with `storage: null` applies anywhere.
    // When the caller does not know the storage, only storage-agnostic rules
    // qualify: a freezer rule says nothing about an unknown location.
    const ruleStorage = rule.storage ?? null;
    let storageExact: boolean;
    if (ruleStorage === null) {
      storageExact = false;
    } else if (storage !== null && ruleStorage === storage) {
      storageExact = true;
    } else {
      continue;
    }

    const precision = scopeRank + (isHouseholdRule ? 0 : 1);
    scored.push({ rule, precision, storageExact });
  }

  scored.sort(compareScored);
  return scored;
}

/** Best first. Fully deterministic, including the tie breakers. */
function compareScored(a: ScoredRule, b: ScoredRule): number {
  if (a.precision !== b.precision) return a.precision - b.precision;
  if (a.storageExact !== b.storageExact) return a.storageExact ? -1 : 1;

  const sampleA = a.rule.sampleCount ?? 0;
  const sampleB = b.rule.sampleCount ?? 0;
  if (sampleA !== sampleB) return sampleB - sampleA; // more evidence first

  const updatedA = a.rule.updatedAt ?? '';
  const updatedB = b.rule.updatedAt ?? '';
  if (updatedA !== updatedB) return updatedA < updatedB ? 1 : -1; // newer first

  return a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0;
}

function pick(
  scored: readonly ScoredRule[],
  field: 'daysUnopened' | 'daysOpened',
): ShelfLifeDays | null {
  for (const candidate of scored) {
    const days = candidate.rule[field];
    if (isUsableDays(days)) {
      return { days, origin: toOrigin(candidate) };
    }
  }
  return null;
}

/**
 * Resolves how long a product keeps, unopened and opened.
 *
 * Returns `null` when no applicable rule supplies either value — the caller
 * (in stage 1: the AI estimate, which is then written back into the catalogue)
 * takes over from there. A result object with two `null` fields is never
 * returned; "nothing known" has exactly one representation.
 */
export function resolveShelfLife(
  input: ResolveShelfLifeInput,
): ShelfLifeResult | null {
  const scored = scoreRules(input);
  if (scored.length === 0) return null;

  const unopened = pick(scored, 'daysUnopened');
  const opened = pick(scored, 'daysOpened');

  if (unopened === null && opened === null) return null;
  return { unopened, opened };
}
