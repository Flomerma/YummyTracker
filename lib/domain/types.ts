/**
 * Shared types of the domain layer.
 *
 * This module is deliberately free of any database, React or network concern.
 * It only describes the *shapes* the pure rules in `lib/domain/` operate on.
 *
 * Date convention (important): every calendar date in this layer is a plain
 * `'YYYY-MM-DD'` string, never a `Date` object. Dates in this application are
 * calendar facts ("best before 5 March"), not instants in time. Passing `Date`
 * around would silently drag the runtime's timezone into the rules and make
 * `new Date('2026-03-05')` mean 4 March in Zurich as soon as anything formats
 * it locally. Strings make that class of bug impossible at the boundary.
 */

/** Canonical units. Everything else is folded into one of these three. */
export type Unit = 'piece' | 'g' | 'ml';

/**
 * Where an item is kept.
 *
 * NOTE: the concept document names a `storage` column on `products`,
 * `inventory_items`, `intake_lines` and `shelf_life_rules` but never
 * enumerates its values. These three are the assumption of this layer.
 */
export type StorageLocation = 'pantry' | 'fridge' | 'freezer';

/** Provenance of an expiry date — mirrors `inventory_items.expiry_source`. */
export type ExpirySource =
  | 'label'
  | 'learned'
  | 'catalog'
  | 'category'
  | 'ai'
  | 'manual'
  | 'none';

/** Provenance of a shelf life rule — mirrors `shelf_life_rules.source`. */
export type ShelfLifeRuleSource = 'seed' | 'ai' | 'learned';

/** Precision level of a shelf life rule — mirrors `shelf_life_rules.scope`. */
export type ShelfLifeScope = 'product' | 'category';

/** Urgency buckets used by the inventory view and the daily digest. */
export type Urgency =
  | 'expired'
  | 'today'
  | 'tomorrow'
  | 'thisWeek'
  | 'ok'
  | 'unknown';

/** Lifecycle of an inventory item — mirrors `inventory_items.status`. */
export type InventoryStatus = 'active' | 'consumed' | 'discarded';

/** Lifecycle of a shopping list row — mirrors `shopping_list_items.status`. */
export type ShoppingListStatus = 'open' | 'checked' | 'cancelled';

/* -------------------------------------------------------------------------
 * resolveShelfLife
 * ---------------------------------------------------------------------- */

/** One row of `shelf_life_rules`, reduced to the fields the rule engine needs. */
export interface ShelfLifeRule {
  readonly id: string;
  readonly scope: ShelfLifeScope;
  /** Set when `scope === 'product'`. */
  readonly productId: string | null;
  /** Set when `scope === 'category'`. */
  readonly categoryId: string | null;
  /** `null` means the rule applies to every storage location. */
  readonly storage: StorageLocation | null;
  readonly daysUnopened: number | null;
  readonly daysOpened: number | null;
  /** `null` means a global rule; otherwise the owning household. */
  readonly householdId: string | null;
  readonly source: ShelfLifeRuleSource;
  /** Number of observations behind a learned rule. */
  readonly sampleCount?: number | null;
  /** ISO timestamp; used only as a tie breaker. */
  readonly updatedAt?: string | null;
}

export interface ResolveShelfLifeInput {
  /** The product we want a shelf life for; `null` for free text entries. */
  readonly productId: string | null;
  /** The product's category; used by the category fallback. */
  readonly categoryId: string | null;
  /** The asking household. Rules of other households are ignored. */
  readonly householdId: string | null;
  /** Where the item will be kept. `null` = unknown. */
  readonly storage: StorageLocation | null;
  /** Candidate rules; unordered, typically everything matching product/category. */
  readonly rules: readonly ShelfLifeRule[];
}

/** Which rule supplied a value, and how precise that makes the answer. */
export interface ShelfLifeOrigin {
  readonly ruleId: string;
  readonly scope: ShelfLifeScope;
  readonly ownership: 'household' | 'global';
  readonly ruleSource: ShelfLifeRuleSource;
  /** Whether the rule named the storage explicitly or applies to any storage. */
  readonly storageMatch: 'exact' | 'any';
  /** The `expiry_source` an item gets when this rule determines its date. */
  readonly expirySource: Extract<
    ExpirySource,
    'learned' | 'catalog' | 'category' | 'ai'
  >;
}

/** A resolved number of days plus where it came from. */
export interface ShelfLifeDays {
  readonly days: number;
  readonly origin: ShelfLifeOrigin;
}

/**
 * Result of the fallback chain. The two fields are resolved *independently*,
 * so an incomplete high precision rule does not hide a complete lower one.
 */
export interface ShelfLifeResult {
  readonly unopened: ShelfLifeDays | null;
  readonly opened: ShelfLifeDays | null;
}

/* -------------------------------------------------------------------------
 * computeExpiry
 * ---------------------------------------------------------------------- */

export interface ComputeExpiryInput {
  /** Date printed on the package ('YYYY-MM-DD') or `null`. */
  readonly labelDate?: string | null;
  /** Date the item entered the household ('YYYY-MM-DD'). */
  readonly addedOn: string;
  /** Date the item was opened ('YYYY-MM-DD') or `null` if still sealed. */
  readonly openedOn?: string | null;
  /** Result of `resolveShelfLife`, or `null` when nothing is known. */
  readonly shelfLife?: ShelfLifeResult | null;
  /** A date a human typed in by hand. Overrides everything else. */
  readonly manualDate?: string | null;
}

export interface ComputeExpiryResult {
  readonly expiresAt: string | null;
  readonly source: ExpirySource;
}

/* -------------------------------------------------------------------------
 * matchProduct
 * ---------------------------------------------------------------------- */

/** A catalogue entry a receipt line may refer to. */
export interface ProductCandidate {
  /** `products.id`. */
  readonly id: string;
  readonly name: string;
  /**
   * `products.normalized_name` if already stored. When absent or empty the
   * matcher normalizes `name` itself, so callers may pass raw rows.
   */
  readonly normalizedName?: string | null;
}

export interface ProductMatch {
  readonly productId: string;
  /** 0 … 1, rounded to three decimals. `1` means the normalized names are equal. */
  readonly confidence: number;
}

/* -------------------------------------------------------------------------
 * detectDuplicate
 * ---------------------------------------------------------------------- */

/** The row a member is about to add to the shopping list. */
export interface DuplicateCandidate {
  readonly productId?: string | null;
  readonly freeText?: string | null;
  /** Set when an existing list row is being edited, so it never matches itself. */
  readonly id?: string | null;
}

/** An active inventory item, reduced to what the duplicate check needs. */
export interface DuplicateInventoryItem {
  readonly id: string;
  readonly productId?: string | null;
  readonly displayName: string;
  readonly quantity?: number | null;
  readonly unit?: Unit | null;
  readonly storage?: StorageLocation | null;
  readonly status: InventoryStatus;
}

/** A shopping list row, reduced to what the duplicate check needs. */
export interface DuplicateListItem {
  readonly id: string;
  readonly productId?: string | null;
  readonly freeText?: string | null;
  readonly quantity?: number | null;
  readonly unit?: Unit | null;
  readonly status: ShoppingListStatus;
}

export interface DuplicateMatch {
  readonly id: string;
  readonly label: string;
  readonly quantity: number | null;
  readonly unit: Unit | null;
  /** How the two rows were linked. */
  readonly via: 'productId' | 'normalizedName';
}

export interface DuplicateWarning {
  readonly kind: 'in_stock' | 'already_on_list';
  readonly items: readonly DuplicateMatch[];
}

/* -------------------------------------------------------------------------
 * buildDigest
 * ---------------------------------------------------------------------- */

/** An active inventory item as the digest builder sees it. */
export interface DigestCandidateItem {
  readonly id: string;
  readonly displayName: string;
  readonly expiresAt: string | null;
  readonly expirySource: ExpirySource;
  readonly quantity?: number | null;
  readonly unit?: Unit | null;
  readonly storage?: StorageLocation | null;
  readonly status?: InventoryStatus;
}

export interface BuildDigestInput {
  /** The day the digest is being built for ('YYYY-MM-DD'). */
  readonly today: string;
  readonly items: readonly DigestCandidateItem[];
  /** Item ids already covered by an earlier mail (from `digest_log`). */
  readonly alreadyNotifiedItemIds?: readonly string[];
  /** Household setting "Vorwarnzeit"; defaults to 3 days. */
  readonly leadDays?: number;
}

export interface DigestEntry {
  readonly itemId: string;
  readonly displayName: string;
  readonly expiresAt: string;
  readonly expirySource: ExpirySource;
  /** Calendar days from `today` to `expiresAt`; negative when overdue. */
  readonly daysLeft: number;
  readonly urgency: Urgency;
  /** `true` when `expirySource !== 'label'`, i.e. the date is an estimate. */
  readonly estimated: boolean;
}

export interface DigestResult {
  readonly urgent: readonly DigestEntry[];
  readonly soon: readonly DigestEntry[];
}
