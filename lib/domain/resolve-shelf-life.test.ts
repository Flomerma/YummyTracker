import { describe, expect, it } from "vitest";

import { resolveShelfLife } from "./resolve-shelf-life";
import type { ResolveShelfLifeInput, ShelfLifeRule } from "./types";

const HOUSEHOLD = "hh-1";
const OTHER_HOUSEHOLD = "hh-2";
const MILK = "prod-milk";
const CHEESE = "prod-cheese";
const DAIRY = "cat-dairy";
const BAKERY = "cat-bakery";

function rule(
  overrides: Partial<ShelfLifeRule> & { id: string },
): ShelfLifeRule {
  return {
    scope: "product",
    productId: MILK,
    categoryId: null,
    storage: null,
    daysUnopened: null,
    daysOpened: null,
    householdId: null,
    source: "seed",
    sampleCount: null,
    updatedAt: null,
    ...overrides,
  };
}

function input(
  rules: readonly ShelfLifeRule[],
  overrides: Partial<ResolveShelfLifeInput> = {},
): ResolveShelfLifeInput {
  return {
    productId: MILK,
    categoryId: DAIRY,
    householdId: HOUSEHOLD,
    storage: "fridge",
    rules,
    ...overrides,
  };
}

describe("resolveShelfLife — the fallback chain", () => {
  const householdProduct = rule({
    id: "r-hh-product",
    householdId: HOUSEHOLD,
    source: "learned",
    daysUnopened: 10,
    daysOpened: 4,
  });
  const globalProduct = rule({
    id: "r-global-product",
    source: "seed",
    daysUnopened: 7,
    daysOpened: 3,
  });
  const globalCategory = rule({
    id: "r-global-category",
    scope: "category",
    productId: null,
    categoryId: DAIRY,
    source: "seed",
    daysUnopened: 5,
    daysOpened: 2,
  });

  it("prefers the household product rule over everything else", () => {
    const result = resolveShelfLife(
      input([globalCategory, globalProduct, householdProduct]),
    );
    expect(result?.unopened?.days).toBe(10);
    expect(result?.opened?.days).toBe(4);
    expect(result?.unopened?.origin.ruleId).toBe("r-hh-product");
    expect(result?.unopened?.origin.expirySource).toBe("learned");
  });

  it("falls back to the global product rule", () => {
    const result = resolveShelfLife(input([globalCategory, globalProduct]));
    expect(result?.unopened?.days).toBe(7);
    expect(result?.unopened?.origin.ruleId).toBe("r-global-product");
    expect(result?.unopened?.origin.expirySource).toBe("catalog");
  });

  it("falls back to the category rule", () => {
    const result = resolveShelfLife(input([globalCategory]));
    expect(result?.unopened?.days).toBe(5);
    expect(result?.opened?.days).toBe(2);
    expect(result?.unopened?.origin.expirySource).toBe("category");
  });

  it("is independent of the order the rules arrive in", () => {
    const all = [globalCategory, globalProduct, householdProduct];
    const forwards = resolveShelfLife(input(all));
    const backwards = resolveShelfLife(input([...all].reverse()));
    expect(backwards).toEqual(forwards);
  });

  it("returns null when nothing applies", () => {
    expect(resolveShelfLife(input([]))).toBeNull();
    expect(
      resolveShelfLife(
        input([globalProduct], { productId: CHEESE, categoryId: BAKERY }),
      ),
    ).toBeNull();
  });

  it("returns null when the only matching rule carries no usable numbers", () => {
    const empty = rule({ id: "r-empty", daysUnopened: null, daysOpened: null });
    expect(resolveShelfLife(input([empty]))).toBeNull();
  });
});

describe('resolveShelfLife — a rule with no "opened" value', () => {
  // The decision documented in the module: the two fields walk the chain
  // independently, so a half-filled learned rule cannot erase what the
  // catalogue already knows.
  const learnedUnopenedOnly = rule({
    id: "r-learned",
    householdId: HOUSEHOLD,
    source: "learned",
    daysUnopened: 10,
    daysOpened: null,
  });
  const catalogueBoth = rule({
    id: "r-catalog",
    source: "seed",
    daysUnopened: 7,
    daysOpened: 3,
  });

  it("keeps the precise unopened value AND the catalogue opened value", () => {
    const result = resolveShelfLife(
      input([learnedUnopenedOnly, catalogueBoth]),
    );
    expect(result?.unopened?.days).toBe(10);
    expect(result?.opened?.days).toBe(3);
  });

  it("reports a separate origin per field", () => {
    const result = resolveShelfLife(
      input([learnedUnopenedOnly, catalogueBoth]),
    );
    expect(result?.unopened?.origin.ruleId).toBe("r-learned");
    expect(result?.unopened?.origin.expirySource).toBe("learned");
    expect(result?.opened?.origin.ruleId).toBe("r-catalog");
    expect(result?.opened?.origin.expirySource).toBe("catalog");
  });

  it("does not make the answer worse the more the household learns", () => {
    const withoutLearning = resolveShelfLife(input([catalogueBoth]));
    const withLearning = resolveShelfLife(
      input([learnedUnopenedOnly, catalogueBoth]),
    );
    // Learning added information; it must not have removed any.
    expect(withoutLearning?.opened?.days).toBe(3);
    expect(withLearning?.opened?.days).toBe(3);
    expect(withLearning?.unopened?.days).toBe(10);
  });

  it("leaves the field null when no rule anywhere in the chain has a value", () => {
    const result = resolveShelfLife(input([learnedUnopenedOnly]));
    expect(result?.unopened?.days).toBe(10);
    expect(result?.opened).toBeNull();
  });

  it("can even take the opened value from a lower-precision category rule", () => {
    const categoryOpened = rule({
      id: "r-cat",
      scope: "category",
      productId: null,
      categoryId: DAIRY,
      daysUnopened: null,
      daysOpened: 2,
    });
    const result = resolveShelfLife(
      input([learnedUnopenedOnly, categoryOpened]),
    );
    expect(result?.unopened?.days).toBe(10);
    expect(result?.opened?.days).toBe(2);
    expect(result?.opened?.origin.expirySource).toBe("category");
  });
});

describe("resolveShelfLife — household isolation", () => {
  it("never uses another household’s rule", () => {
    const foreign = rule({
      id: "r-foreign",
      householdId: OTHER_HOUSEHOLD,
      source: "learned",
      daysUnopened: 99,
      daysOpened: 99,
    });
    const global = rule({ id: "r-global", daysUnopened: 7, daysOpened: 3 });

    const result = resolveShelfLife(input([foreign, global]));
    expect(result?.unopened?.days).toBe(7);
    expect(result?.unopened?.origin.ruleId).toBe("r-global");
  });

  it("ignores a foreign rule even when it is the only one", () => {
    const foreign = rule({
      id: "r-foreign",
      householdId: OTHER_HOUSEHOLD,
      daysUnopened: 99,
    });
    expect(resolveShelfLife(input([foreign]))).toBeNull();
  });

  it("treats a caller without a household as able to see global rules only", () => {
    const own = rule({ id: "r-own", householdId: HOUSEHOLD, daysUnopened: 10 });
    const global = rule({ id: "r-global", daysUnopened: 7 });
    const result = resolveShelfLife(
      input([own, global], { householdId: null }),
    );
    expect(result?.unopened?.days).toBe(7);
  });
});

describe("resolveShelfLife — storage", () => {
  const anyStorage = rule({ id: "r-any", storage: null, daysUnopened: 7 });
  const fridge = rule({ id: "r-fridge", storage: "fridge", daysUnopened: 10 });
  const freezer = rule({
    id: "r-freezer",
    storage: "freezer",
    daysUnopened: 180,
  });

  it("prefers the rule that names the storage explicitly", () => {
    const result = resolveShelfLife(input([anyStorage, fridge, freezer]));
    expect(result?.unopened?.days).toBe(10);
    expect(result?.unopened?.origin.storageMatch).toBe("exact");
  });

  it("uses the storage-agnostic rule when no rule names this storage", () => {
    const result = resolveShelfLife(
      input([anyStorage, freezer], { storage: "pantry" }),
    );
    expect(result?.unopened?.days).toBe(7);
    expect(result?.unopened?.origin.storageMatch).toBe("any");
  });

  it("never borrows a rule written for a different storage", () => {
    expect(
      resolveShelfLife(input([freezer], { storage: "fridge" })),
    ).toBeNull();
  });

  it("accepts only storage-agnostic rules when the storage is unknown", () => {
    // A freezer rule says nothing about an item whose location we do not know.
    const result = resolveShelfLife(
      input([anyStorage, freezer], { storage: null }),
    );
    expect(result?.unopened?.days).toBe(7);
    expect(resolveShelfLife(input([freezer], { storage: null }))).toBeNull();
  });

  it("ranks precision above storage exactness", () => {
    // A household product rule for "any storage" still beats a global
    // product rule that happens to name the fridge.
    const householdAny = rule({
      id: "r-hh-any",
      householdId: HOUSEHOLD,
      source: "learned",
      storage: null,
      daysUnopened: 12,
    });
    const globalFridge = rule({
      id: "r-global-fridge",
      storage: "fridge",
      daysUnopened: 7,
    });
    const result = resolveShelfLife(input([householdAny, globalFridge]));
    expect(result?.unopened?.days).toBe(12);
  });
});

describe("resolveShelfLife — ties between rules of equal precision", () => {
  const base = {
    householdId: HOUSEHOLD,
    source: "learned" as const,
    storage: "fridge" as const,
  };

  it("prefers the rule with more observations", () => {
    const few = rule({ id: "r-a", ...base, daysUnopened: 8, sampleCount: 2 });
    const many = rule({ id: "r-b", ...base, daysUnopened: 11, sampleCount: 9 });
    expect(resolveShelfLife(input([few, many]))?.unopened?.days).toBe(11);
    expect(resolveShelfLife(input([many, few]))?.unopened?.days).toBe(11);
  });

  it("prefers the more recently updated rule when the sample counts match", () => {
    const older = rule({
      id: "r-a",
      ...base,
      daysUnopened: 8,
      sampleCount: 3,
      updatedAt: "2026-01-01T10:00:00Z",
    });
    const newer = rule({
      id: "r-b",
      ...base,
      daysUnopened: 11,
      sampleCount: 3,
      updatedAt: "2026-09-01T10:00:00Z",
    });
    expect(resolveShelfLife(input([older, newer]))?.unopened?.days).toBe(11);
    expect(resolveShelfLife(input([newer, older]))?.unopened?.days).toBe(11);
  });

  it("falls back to the lower id so the result is never arbitrary", () => {
    const a = rule({ id: "r-aaa", ...base, daysUnopened: 8 });
    const b = rule({ id: "r-bbb", ...base, daysUnopened: 11 });
    expect(resolveShelfLife(input([a, b]))?.unopened?.origin.ruleId).toBe(
      "r-aaa",
    );
    expect(resolveShelfLife(input([b, a]))?.unopened?.origin.ruleId).toBe(
      "r-aaa",
    );
  });

  it("treats a missing sampleCount as zero rather than as unknown", () => {
    const withCount = rule({
      id: "r-a",
      ...base,
      daysUnopened: 11,
      sampleCount: 1,
    });
    const without = rule({ id: "r-b", ...base, daysUnopened: 8 });
    expect(resolveShelfLife(input([without, withCount]))?.unopened?.days).toBe(
      11,
    );
  });
});

describe("resolveShelfLife — expiry source mapping", () => {
  it('maps a learned product rule to "learned"', () => {
    const r = rule({
      id: "r",
      householdId: HOUSEHOLD,
      source: "learned",
      daysUnopened: 5,
    });
    expect(resolveShelfLife(input([r]))?.unopened?.origin.expirySource).toBe(
      "learned",
    );
  });

  it('maps a seeded product rule to "catalog"', () => {
    const r = rule({ id: "r", source: "seed", daysUnopened: 5 });
    expect(resolveShelfLife(input([r]))?.unopened?.origin.expirySource).toBe(
      "catalog",
    );
  });

  it('maps an AI product rule to "ai"', () => {
    const r = rule({ id: "r", source: "ai", daysUnopened: 5 });
    expect(resolveShelfLife(input([r]))?.unopened?.origin.expirySource).toBe(
      "ai",
    );
  });

  it('maps every category rule to "category", whatever produced it', () => {
    for (const source of ["seed", "ai", "learned"] as const) {
      const r = rule({
        id: `r-${source}`,
        scope: "category",
        productId: null,
        categoryId: DAIRY,
        source,
        daysUnopened: 5,
      });
      expect(resolveShelfLife(input([r]))?.unopened?.origin.expirySource).toBe(
        "category",
      );
    }
  });

  it("reports ownership and scope alongside the source", () => {
    const r = rule({
      id: "r",
      householdId: HOUSEHOLD,
      source: "learned",
      daysUnopened: 5,
    });
    const origin = resolveShelfLife(input([r]))?.unopened?.origin;
    expect(origin).toMatchObject({
      ruleId: "r",
      scope: "product",
      ownership: "household",
      ruleSource: "learned",
    });
  });
});

describe("resolveShelfLife — defensive handling of bad rule data", () => {
  it("skips negative, fractional and non-numeric day counts", () => {
    const broken = rule({
      id: "r-broken",
      householdId: HOUSEHOLD,
      daysUnopened: -3,
    });
    const fractional = rule({
      id: "r-frac",
      householdId: HOUSEHOLD,
      daysUnopened: 2.5,
    });
    const text = rule({
      id: "r-text",
      householdId: HOUSEHOLD,
      daysUnopened: "7" as unknown as number,
    });
    const good = rule({ id: "r-good", daysUnopened: 7 });

    const result = resolveShelfLife(input([broken, fractional, text, good]));
    expect(result?.unopened?.days).toBe(7);
    expect(result?.unopened?.origin.ruleId).toBe("r-good");
  });

  it('accepts zero days — "eat it today" is a legitimate rule', () => {
    const sameDay = rule({ id: "r-zero", daysUnopened: 0, daysOpened: 0 });
    const result = resolveShelfLife(input([sameDay]));
    expect(result?.unopened?.days).toBe(0);
    expect(result?.opened?.days).toBe(0);
  });

  it("ignores rules with an unknown scope instead of guessing", () => {
    const weird = rule({
      id: "r-weird",
      scope: "batch" as unknown as "product",
      daysUnopened: 99,
    });
    expect(resolveShelfLife(input([weird]))).toBeNull();
  });

  it("ignores a product rule when the item has no product", () => {
    const r = rule({ id: "r", daysUnopened: 7 });
    expect(resolveShelfLife(input([r], { productId: null }))).toBeNull();
  });

  it("ignores a category rule when the item has no category", () => {
    const r = rule({
      id: "r",
      scope: "category",
      productId: null,
      categoryId: DAIRY,
      daysUnopened: 7,
    });
    expect(
      resolveShelfLife(input([r], { productId: null, categoryId: null })),
    ).toBeNull();
  });

  it("survives null entries in the rule list", () => {
    const good = rule({ id: "r-good", daysUnopened: 7 });
    const rules = [null as unknown as ShelfLifeRule, good];
    expect(resolveShelfLife(input(rules))?.unopened?.days).toBe(7);
  });

  it("does not mutate the rules it was given", () => {
    const rules = [
      rule({ id: "r-b", daysUnopened: 5 }),
      rule({ id: "r-a", householdId: HOUSEHOLD, daysUnopened: 9 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rules));
    resolveShelfLife(input(rules));
    expect(rules.map((r) => r.id)).toEqual(["r-b", "r-a"]);
    expect(rules).toEqual(snapshot);
  });
});
