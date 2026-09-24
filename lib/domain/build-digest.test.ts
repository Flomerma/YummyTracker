import { describe, expect, it } from "vitest";

import { DEFAULT_LEAD_DAYS, buildDigest, isEstimated } from "./build-digest";
import { addDays } from "./date";
import type { DigestCandidateItem, ExpirySource } from "./types";

const TODAY = "2026-09-23";

function item(
  overrides: Partial<DigestCandidateItem> & { id: string },
): DigestCandidateItem {
  return {
    displayName: overrides.id,
    expiresAt: null,
    expirySource: "label",
    status: "active",
    ...overrides,
  };
}

/** An item that expires `offset` days from TODAY. */
function inDays(
  id: string,
  offset: number,
  expirySource: ExpirySource = "label",
): DigestCandidateItem {
  return item({ id, expiresAt: addDays(TODAY, offset), expirySource });
}

function idsOf(entries: readonly { itemId: string }[]): string[] {
  return entries.map((e) => e.itemId);
}

describe("buildDigest — the two groups", () => {
  it('puts expired, today and tomorrow into "urgent"', () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("expired", -2), inDays("today", 0), inDays("tomorrow", 1)],
    });
    expect(idsOf(result.urgent)).toEqual(["expired", "today", "tomorrow"]);
    expect(result.soon).toEqual([]);
  });

  it('puts the rest of the lead time into "soon"', () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("in2", 2), inDays("in3", 3)],
    });
    expect(idsOf(result.soon)).toEqual(["in2", "in3"]);
    expect(result.urgent).toEqual([]);
  });

  it("leaves out anything beyond the lead time", () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("in4", 4), inDays("in30", 30)],
    });
    expect(result).toEqual({ urgent: [], soon: [] });
  });

  it("reports the urgency bucket and the real days left per entry", () => {
    const result = buildDigest({ today: TODAY, items: [inDays("x", -1)] });
    expect(result.urgent[0]).toEqual({
      itemId: "x",
      displayName: "x",
      expiresAt: "2026-09-22",
      expirySource: "label",
      daysLeft: -1,
      urgency: "expired",
      estimated: false,
    });
  });

  it("returns two empty groups when nothing is due", () => {
    expect(buildDigest({ today: TODAY, items: [] })).toEqual({
      urgent: [],
      soon: [],
    });
  });
});

describe("buildDigest — estimated dates warn one day later", () => {
  it("holds an estimated item back on the day a label item would appear", () => {
    const result = buildDigest({
      today: TODAY,
      leadDays: 3,
      items: [inDays("label", 3, "label"), inDays("guess", 3, "catalog")],
    });
    expect(idsOf(result.soon)).toEqual(["label"]);
  });

  it("lets the same estimated item through exactly one day later", () => {
    const tomorrow = "2026-09-24";
    const guess = inDays("guess", 3, "catalog"); // expires 2026-09-26
    expect(
      idsOf(buildDigest({ today: TODAY, leadDays: 3, items: [guess] }).soon),
    ).toEqual([]);
    expect(
      idsOf(buildDigest({ today: tomorrow, leadDays: 3, items: [guess] }).soon),
    ).toEqual(["guess"]);
  });

  it("applies the grace period to every non-label source", () => {
    const sources: ExpirySource[] = [
      "learned",
      "catalog",
      "category",
      "ai",
      "manual",
      "none",
    ];
    for (const source of sources) {
      const result = buildDigest({
        today: TODAY,
        leadDays: 3,
        items: [inDays(`x-${source}`, 3, source)],
      });
      expect(result.soon, `source: ${source}`).toEqual([]);
    }
  });

  it("never delays an item that is already urgent", () => {
    // The grace period shifts the entry date, not the urgency itself.
    const result = buildDigest({
      today: TODAY,
      leadDays: 3,
      items: [
        inDays("guess-today", 0, "catalog"),
        inDays("guess-gone", -5, "ai"),
      ],
    });
    expect(idsOf(result.urgent)).toEqual(["guess-gone", "guess-today"]);
  });

  it("marks each entry so the mail can say the date is an estimate", () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("a", 0, "label"), inDays("b", 0, "category")],
    });
    expect(result.urgent.map((e) => [e.itemId, e.estimated])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it('isEstimated treats only "label" as read off the package', () => {
    expect(isEstimated({ expirySource: "label" })).toBe(false);
    for (const source of [
      "learned",
      "catalog",
      "category",
      "ai",
      "manual",
      "none",
    ] as const) {
      expect(isEstimated({ expirySource: source }), source).toBe(true);
    }
  });
});

describe("buildDigest — items that were already asked about", () => {
  it("skips an item listed in the digest log", () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("a", 1), inDays("b", 1)],
      alreadyNotifiedItemIds: ["a"],
    });
    expect(idsOf(result.urgent)).toEqual(["b"]);
  });

  it("does not resurrect an expired item day after day", () => {
    const expired = inDays("old", -10);
    expect(
      idsOf(buildDigest({ today: TODAY, items: [expired] }).urgent),
    ).toEqual(["old"]);
    expect(
      buildDigest({
        today: TODAY,
        items: [expired],
        alreadyNotifiedItemIds: ["old"],
      }),
    ).toEqual({ urgent: [], soon: [] });
  });

  it("ignores unknown ids and non-strings in the log", () => {
    const result = buildDigest({
      today: TODAY,
      items: [inDays("a", 1)],
      alreadyNotifiedItemIds: ["does-not-exist", null as unknown as string],
    });
    expect(idsOf(result.urgent)).toEqual(["a"]);
  });
});

describe("buildDigest — lead time", () => {
  it("defaults to three days", () => {
    expect(DEFAULT_LEAD_DAYS).toBe(3);
    const result = buildDigest({
      today: TODAY,
      items: [inDays("in3", 3), inDays("in4", 4)],
    });
    expect(idsOf(result.soon)).toEqual(["in3"]);
  });

  it("honours a longer household setting", () => {
    const result = buildDigest({
      today: TODAY,
      leadDays: 7,
      items: [inDays("in5", 5), inDays("in7", 7), inDays("in8", 8)],
    });
    expect(idsOf(result.soon)).toEqual(["in5", "in7"]);
  });

  it("with a lead time of zero, only today and overdue items appear", () => {
    const result = buildDigest({
      today: TODAY,
      leadDays: 0,
      items: [inDays("gone", -1), inDays("today", 0), inDays("tomorrow", 1)],
    });
    expect(idsOf(result.urgent)).toEqual(["gone", "today"]);
    expect(result.soon).toEqual([]);
  });

  it("with a lead time of zero, an estimated item due today still waits a day", () => {
    const result = buildDigest({
      today: TODAY,
      leadDays: 0,
      items: [inDays("guess", 0, "catalog")],
    });
    expect(result).toEqual({ urgent: [], soon: [] });
  });

  it("falls back to the default for a nonsensical lead time", () => {
    for (const leadDays of [-1, 2.5, Number.NaN, "drei" as unknown as number]) {
      const result = buildDigest({
        today: TODAY,
        leadDays,
        items: [inDays("in3", 3), inDays("in4", 4)],
      });
      expect(idsOf(result.soon), `leadDays: ${String(leadDays)}`).toEqual([
        "in3",
      ]);
    }
  });
});

describe("buildDigest — what never makes it into the mail", () => {
  it("skips items without a date", () => {
    expect(
      buildDigest({
        today: TODAY,
        items: [item({ id: "a", expiresAt: null })],
      }),
    ).toEqual({ urgent: [], soon: [] });
  });

  it("skips items with a malformed date instead of guessing", () => {
    const bad = [
      item({ id: "a", expiresAt: "23.09.2026" }),
      item({ id: "b", expiresAt: "2026-02-30" }),
      item({ id: "c", expiresAt: "2026-09-23T00:00:00Z" }),
    ];
    expect(buildDigest({ today: TODAY, items: bad })).toEqual({
      urgent: [],
      soon: [],
    });
  });

  it("skips items that are no longer active", () => {
    const result = buildDigest({
      today: TODAY,
      items: [
        item({ id: "a", expiresAt: TODAY, status: "consumed" }),
        item({ id: "b", expiresAt: TODAY, status: "discarded" }),
        item({ id: "c", expiresAt: TODAY, status: "active" }),
      ],
    });
    expect(idsOf(result.urgent)).toEqual(["c"]);
  });

  it("accepts items whose status was already filtered out by the caller", () => {
    const result = buildDigest({
      today: TODAY,
      items: [
        {
          id: "a",
          displayName: "Milch",
          expiresAt: TODAY,
          expirySource: "label",
        },
      ],
    });
    expect(idsOf(result.urgent)).toEqual(["a"]);
  });

  it('returns empty groups when "today" is missing or malformed', () => {
    const items = [inDays("a", 0)];
    expect(buildDigest({ today: "heute", items })).toEqual({
      urgent: [],
      soon: [],
    });
    expect(buildDigest({ today: "", items })).toEqual({ urgent: [], soon: [] });
    expect(
      buildDigest({ today: undefined as unknown as string, items }),
    ).toEqual({ urgent: [], soon: [] });
  });

  it("survives malformed item rows", () => {
    const items = [
      null as unknown as DigestCandidateItem,
      { expiresAt: TODAY } as unknown as DigestCandidateItem, // no id
      inDays("good", 0),
    ];
    expect(idsOf(buildDigest({ today: TODAY, items }).urgent)).toEqual([
      "good",
    ]);
  });
});

describe("buildDigest — calendar edge cases", () => {
  it("works across a month boundary", () => {
    const result = buildDigest({
      today: "2026-09-30",
      items: [
        item({ id: "tomorrow", expiresAt: "2026-10-01" }),
        item({ id: "in3", expiresAt: "2026-10-03" }),
        item({ id: "in4", expiresAt: "2026-10-04" }),
      ],
    });
    expect(idsOf(result.urgent)).toEqual(["tomorrow"]);
    expect(idsOf(result.soon)).toEqual(["in3"]);
  });

  it("works across a year boundary", () => {
    const result = buildDigest({
      today: "2026-12-31",
      items: [
        item({ id: "today", expiresAt: "2026-12-31" }),
        item({ id: "newyear", expiresAt: "2027-01-01" }),
        item({ id: "in3", expiresAt: "2027-01-03" }),
        item({ id: "in4", expiresAt: "2027-01-04" }),
      ],
    });
    expect(idsOf(result.urgent)).toEqual(["today", "newyear"]);
    expect(idsOf(result.soon)).toEqual(["in3"]);
  });

  it("counts the leap day", () => {
    const result = buildDigest({
      today: "2024-02-27",
      items: [
        item({ id: "leapday", expiresAt: "2024-02-29" }),
        item({ id: "march", expiresAt: "2024-03-01" }),
        item({ id: "toolate", expiresAt: "2024-03-02" }),
      ],
    });
    // 29 Feb is 2 days away, 1 Mar is 3 days away, 2 Mar is 4 and drops out.
    expect(idsOf(result.soon)).toEqual(["leapday", "march"]);
  });

  it("is not shifted by the daylight saving switch", () => {
    const result = buildDigest({
      today: "2026-03-28",
      items: [item({ id: "dst", expiresAt: "2026-03-29" })],
    });
    expect(result.urgent[0]?.urgency).toBe("tomorrow");
    expect(result.urgent[0]?.daysLeft).toBe(1);
  });
});

describe("buildDigest — ordering and determinism", () => {
  it("sorts each group by date, then name, then id", () => {
    const items = [
      item({ id: "z", displayName: "Zucchini", expiresAt: "2026-09-25" }),
      item({ id: "a", displayName: "Apfel", expiresAt: "2026-09-25" }),
      item({ id: "m", displayName: "Milch", expiresAt: "2026-09-24" }),
    ];
    const result = buildDigest({ today: TODAY, items });
    expect(idsOf(result.urgent)).toEqual(["m"]); // 24th = tomorrow
    expect(idsOf(result.soon)).toEqual(["a", "z"]); // 25th, alphabetical
  });

  it("breaks a full tie by id so the mail never reshuffles itself", () => {
    const items = [
      item({ id: "b", displayName: "Milch", expiresAt: "2026-09-25" }),
      item({ id: "a", displayName: "Milch", expiresAt: "2026-09-25" }),
    ];
    expect(idsOf(buildDigest({ today: TODAY, items }).soon)).toEqual([
      "a",
      "b",
    ]);
  });

  it("gives the same result whatever order the rows arrive in", () => {
    const items = [
      inDays("a", -1),
      inDays("b", 0),
      inDays("c", 2),
      inDays("d", 3),
      inDays("e", 9),
    ];
    const forwards = buildDigest({ today: TODAY, items });
    const backwards = buildDigest({
      today: TODAY,
      items: [...items].reverse(),
    });
    expect(backwards).toEqual(forwards);
  });

  it("does not mutate the items it was given", () => {
    const items = [inDays("b", 1), inDays("a", 1)];
    const snapshot = JSON.parse(JSON.stringify(items));
    buildDigest({ today: TODAY, items });
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(items).toEqual(snapshot);
  });
});

describe("buildDigest — a realistic day", () => {
  it("assembles the mail for a household with a mixed pantry", () => {
    const result = buildDigest({
      today: TODAY,
      leadDays: 3,
      alreadyNotifiedItemIds: ["i-joghurt"],
      items: [
        item({
          id: "i-milch",
          displayName: "Vollmilch",
          expiresAt: "2026-09-22",
          expirySource: "label",
        }),
        item({
          id: "i-salat",
          displayName: "Gemischter Salat",
          expiresAt: TODAY,
          expirySource: "label",
        }),
        item({
          id: "i-poulet",
          displayName: "Pouletbrust",
          expiresAt: "2026-09-25",
          expirySource: "label",
        }),
        item({
          id: "i-rahm",
          displayName: "Halbrahm",
          expiresAt: "2026-09-26",
          expirySource: "catalog",
        }),
        item({
          id: "i-joghurt",
          displayName: "Joghurt Natur",
          expiresAt: TODAY,
          expirySource: "label",
        }),
        item({
          id: "i-mehl",
          displayName: "Mehl",
          expiresAt: "2027-03-01",
          expirySource: "category",
        }),
        item({
          id: "i-brot",
          displayName: "Brot",
          expiresAt: null,
          expirySource: "none",
        }),
        item({
          id: "i-gegessen",
          displayName: "Butter",
          expiresAt: TODAY,
          status: "consumed",
        }),
      ],
    });

    // Overdue milk and today's salad; the yoghurt was already asked about.
    expect(idsOf(result.urgent)).toEqual(["i-milch", "i-salat"]);
    // The chicken is two days out. The cream is three days out but its date is
    // an estimate, so it waits until tomorrow.
    expect(idsOf(result.soon)).toEqual(["i-poulet"]);
  });
});
