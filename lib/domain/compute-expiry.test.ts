import { describe, expect, it } from "vitest";

import { computeExpiry } from "./compute-expiry";
import type { ExpirySource, ShelfLifeResult } from "./types";

function shelfLife(
  unopenedDays: number | null,
  openedDays: number | null,
  unopenedSource: ExpirySource = "catalog",
  openedSource: ExpirySource = "catalog",
): ShelfLifeResult {
  const origin = (source: ExpirySource) => ({
    ruleId: `rule-${source}`,
    scope: "product" as const,
    ownership: "global" as const,
    ruleSource: "seed" as const,
    storageMatch: "any" as const,
    expirySource: source as "learned" | "catalog" | "category" | "ai",
  });

  return {
    unopened:
      unopenedDays === null
        ? null
        : { days: unopenedDays, origin: origin(unopenedSource) },
    opened:
      openedDays === null
        ? null
        : { days: openedDays, origin: origin(openedSource) },
  };
}

describe("computeExpiry — sealed items", () => {
  it("uses the printed date when there is one", () => {
    expect(
      computeExpiry({
        labelDate: "2026-10-05",
        addedOn: "2026-09-23",
        shelfLife: shelfLife(7, 3),
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });

  it("counts the unopened shelf life from the day of arrival", () => {
    expect(
      computeExpiry({
        labelDate: null,
        addedOn: "2026-09-23",
        shelfLife: shelfLife(7, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-30", source: "catalog" });
  });

  it("reports the shelf life origin as the expiry source", () => {
    expect(
      computeExpiry({
        addedOn: "2026-09-23",
        shelfLife: shelfLife(10, 3, "learned"),
      }).source,
    ).toBe("learned");
    expect(
      computeExpiry({
        addedOn: "2026-09-23",
        shelfLife: shelfLife(10, 3, "category"),
      }).source,
    ).toBe("category");
    expect(
      computeExpiry({
        addedOn: "2026-09-23",
        shelfLife: shelfLife(10, 3, "ai"),
      }).source,
    ).toBe("ai");
  });

  it("returns nothing when neither a label nor a rule is available", () => {
    expect(computeExpiry({ addedOn: "2026-09-23", shelfLife: null })).toEqual({
      expiresAt: null,
      source: "none",
    });
    expect(
      computeExpiry({ addedOn: "2026-09-23", shelfLife: shelfLife(null, 3) }),
    ).toEqual({ expiresAt: null, source: "none" });
  });

  it("handles a shelf life of zero days", () => {
    expect(
      computeExpiry({ addedOn: "2026-09-23", shelfLife: shelfLife(0, null) }),
    ).toEqual({ expiresAt: "2026-09-23", source: "catalog" });
  });

  it("keeps a printed date that already lies in the past", () => {
    // Reduced-price goods on the last day, or an item entered late. The label
    // is still the truth; inventing a later date would hide the problem.
    expect(
      computeExpiry({
        labelDate: "2026-09-20",
        addedOn: "2026-09-23",
        shelfLife: shelfLife(30, null),
      }),
    ).toEqual({ expiresAt: "2026-09-20", source: "label" });
  });

  it("does not shorten a printed date by the unopened estimate", () => {
    // The label IS the unopened statement, so the estimate must not compete
    // with it. Only OPENING introduces a second, independent upper bound.
    expect(
      computeExpiry({
        labelDate: "2026-10-05",
        addedOn: "2026-09-20",
        shelfLife: shelfLife(3, null), // would give 2026-09-23, much earlier
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });
});

describe("computeExpiry — opened items", () => {
  it("counts the opened shelf life from the day of opening, not of arrival", () => {
    expect(
      computeExpiry({
        labelDate: null,
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-26", source: "catalog" });
  });

  it("takes the EARLIER date when the item is opened and printed", () => {
    // Opened milk does not keep until the best-before date.
    expect(
      computeExpiry({
        labelDate: "2026-10-05",
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-26", source: "catalog" });
  });

  it("takes the printed date when that one is earlier", () => {
    // Opened on the last day before the best-before date: the three "opened"
    // days must not push the item past the printed date.
    expect(
      computeExpiry({
        labelDate: "2026-09-24",
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-24", source: "label" });
  });

  it('reports "label" when both dates land on the same day', () => {
    // A tie is resolved towards the stronger claim, and towards warning
    // earlier (stage 2 delays the question for estimated dates by a day).
    expect(
      computeExpiry({
        labelDate: "2026-09-26",
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-26", source: "label" });
  });

  it("respects a printed date that has already passed at opening time", () => {
    expect(
      computeExpiry({
        labelDate: "2026-09-15",
        addedOn: "2026-09-01",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(30, 5),
      }),
    ).toEqual({ expiresAt: "2026-09-15", source: "label" });
  });

  it('uses the printed date when no "opened" rule exists', () => {
    expect(
      computeExpiry({
        labelDate: "2026-10-05",
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, null),
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });

  it("falls back to the sealed estimate when neither label nor opened rule exists", () => {
    // A rough date that can be corrected beats no date: an item without a
    // date never triggers a question and therefore rots unnoticed.
    expect(
      computeExpiry({
        labelDate: null,
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, null),
      }),
    ).toEqual({ expiresAt: "2026-10-04", source: "catalog" });
  });

  it("returns nothing when the item is open and nothing at all is known", () => {
    expect(
      computeExpiry({
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: null,
      }),
    ).toEqual({ expiresAt: null, source: "none" });
  });

  it("handles an item opened on the very day it arrived", () => {
    expect(
      computeExpiry({
        addedOn: "2026-09-23",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-26", source: "catalog" });
  });

  it("accepts an opening date before the arrival date without inventing a date", () => {
    // Contradictory input (somebody fixed the arrival date afterwards). We do
    // not second-guess it: the opened rule still counts from openedOn.
    expect(
      computeExpiry({
        addedOn: "2026-09-23",
        openedOn: "2026-09-20",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-09-23", source: "catalog" });
  });
});

describe("computeExpiry — manual override", () => {
  it("beats the printed date", () => {
    expect(
      computeExpiry({
        manualDate: "2026-11-01",
        labelDate: "2026-10-05",
        addedOn: "2026-09-23",
        shelfLife: shelfLife(7, 3),
      }),
    ).toEqual({ expiresAt: "2026-11-01", source: "manual" });
  });

  it("beats the opened estimate, even when it is later", () => {
    expect(
      computeExpiry({
        manualDate: "2026-12-24",
        labelDate: "2026-10-05",
        addedOn: "2026-09-20",
        openedOn: "2026-09-23",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-12-24", source: "manual" });
  });

  it("is ignored when malformed, so the chain still produces a date", () => {
    expect(
      computeExpiry({
        manualDate: "24.12.2026",
        labelDate: "2026-10-05",
        addedOn: "2026-09-23",
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });
});

describe("computeExpiry — calendar edge cases", () => {
  it("crosses a month boundary", () => {
    expect(
      computeExpiry({ addedOn: "2026-09-28", shelfLife: shelfLife(5, null) })
        .expiresAt,
    ).toBe("2026-10-03");
  });

  it("crosses a year boundary", () => {
    expect(
      computeExpiry({ addedOn: "2026-12-28", shelfLife: shelfLife(7, null) })
        .expiresAt,
    ).toBe("2027-01-04");
  });

  it("counts a leap day", () => {
    expect(
      computeExpiry({ addedOn: "2024-02-27", shelfLife: shelfLife(3, null) })
        .expiresAt,
    ).toBe("2024-03-01");
    // 2026 has no 29 February, so the same span lands a day earlier.
    expect(
      computeExpiry({ addedOn: "2026-02-27", shelfLife: shelfLife(3, null) })
        .expiresAt,
    ).toBe("2026-03-02");
  });

  it("handles a long freezer shelf life", () => {
    expect(
      computeExpiry({ addedOn: "2026-09-23", shelfLife: shelfLife(365, null) })
        .expiresAt,
    ).toBe("2027-09-23");
  });

  it("is unaffected by the timezone of the machine it runs on", () => {
    // Nothing in this function touches the local clock, so the same input
    // must produce the same output regardless of TZ. Recorded as an explicit
    // expectation because this is the bug the string convention prevents.
    const result = computeExpiry({
      addedOn: "2026-03-28",
      shelfLife: shelfLife(1, null),
    });
    expect(result.expiresAt).toBe("2026-03-29"); // the Swiss DST switch day
  });
});

describe("computeExpiry — malformed input", () => {
  it("treats an impossible label date as missing", () => {
    expect(
      computeExpiry({
        labelDate: "2026-02-30",
        addedOn: "2026-09-23",
        shelfLife: shelfLife(7, null),
      }),
    ).toEqual({ expiresAt: "2026-09-30", source: "catalog" });
  });

  it("treats a malformed arrival date as missing rather than throwing", () => {
    expect(
      computeExpiry({ addedOn: "gestern", shelfLife: shelfLife(7, null) }),
    ).toEqual({ expiresAt: null, source: "none" });
    expect(
      computeExpiry({
        addedOn: "",
        labelDate: "2026-10-05",
        shelfLife: shelfLife(7, 3),
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });

  it('treats a malformed opening date as "not opened"', () => {
    expect(
      computeExpiry({
        labelDate: "2026-10-05",
        addedOn: "2026-09-20",
        openedOn: "irgendwann",
        shelfLife: shelfLife(14, 3),
      }),
    ).toEqual({ expiresAt: "2026-10-05", source: "label" });
  });

  it("rejects a timestamp — this layer only speaks YYYY-MM-DD", () => {
    expect(
      computeExpiry({
        labelDate: "2026-10-05T00:00:00.000Z",
        addedOn: "2026-09-23",
        shelfLife: shelfLife(7, null),
      }),
    ).toEqual({ expiresAt: "2026-09-30", source: "catalog" });
  });

  it("survives a completely empty input object", () => {
    expect(computeExpiry({ addedOn: undefined as unknown as string })).toEqual({
      expiresAt: null,
      source: "none",
    });
  });
});
