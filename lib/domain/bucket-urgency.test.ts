import { describe, expect, it } from "vitest";

import { URGENCY_ORDER, URGENT_BUCKETS, bucketUrgency } from "./bucket-urgency";
import { addDays } from "./date";
import type { Urgency } from "./types";

const TODAY = "2026-09-23";

describe("bucketUrgency — the six buckets", () => {
  const cases: readonly [number | null, Urgency][] = [
    [null, "unknown"],
    [-365, "expired"],
    [-2, "expired"],
    [-1, "expired"],
    [0, "today"],
    [1, "tomorrow"],
    [2, "thisWeek"],
    [6, "thisWeek"],
    [7, "thisWeek"],
    [8, "ok"],
    [30, "ok"],
    [365, "ok"],
  ];

  for (const [offset, expected] of cases) {
    const label = offset === null ? "no date" : `${offset} day(s) from today`;
    it(`${label} → ${expected}`, () => {
      const date = offset === null ? null : addDays(TODAY, offset);
      expect(bucketUrgency(date, TODAY)).toBe(expected);
    });
  }
});

describe("bucketUrgency — the boundaries", () => {
  it("yesterday is expired, today is today", () => {
    expect(bucketUrgency("2026-09-22", TODAY)).toBe("expired");
    expect(bucketUrgency("2026-09-23", TODAY)).toBe("today");
  });

  it("day 7 is still this week, day 8 is not", () => {
    expect(bucketUrgency("2026-09-30", TODAY)).toBe("thisWeek");
    expect(bucketUrgency("2026-10-01", TODAY)).toBe("ok");
  });

  it("the tomorrow/thisWeek boundary sits between day 1 and day 2", () => {
    expect(bucketUrgency("2026-09-24", TODAY)).toBe("tomorrow");
    expect(bucketUrgency("2026-09-25", TODAY)).toBe("thisWeek");
  });
});

describe("bucketUrgency — calendar edge cases", () => {
  it("works across a month boundary", () => {
    expect(bucketUrgency("2026-10-01", "2026-09-30")).toBe("tomorrow");
    expect(bucketUrgency("2026-09-30", "2026-10-01")).toBe("expired");
  });

  it("works across a year boundary", () => {
    expect(bucketUrgency("2027-01-01", "2026-12-31")).toBe("tomorrow");
    expect(bucketUrgency("2027-01-07", "2026-12-31")).toBe("thisWeek");
    expect(bucketUrgency("2027-01-08", "2026-12-31")).toBe("ok");
  });

  it("counts the leap day as a day", () => {
    expect(bucketUrgency("2024-03-01", "2024-02-28")).toBe("thisWeek"); // 2 days
    expect(bucketUrgency("2024-02-29", "2024-02-28")).toBe("tomorrow");
    expect(bucketUrgency("2026-03-01", "2026-02-28")).toBe("tomorrow"); // no 29th
  });

  it("is not thrown off by the daylight saving switch", () => {
    // Swiss clocks jump forward on 2026-03-29 and back on 2026-10-25.
    expect(bucketUrgency("2026-03-29", "2026-03-28")).toBe("tomorrow");
    expect(bucketUrgency("2026-10-25", "2026-10-24")).toBe("tomorrow");
    expect(bucketUrgency("2026-04-04", "2026-03-28")).toBe("thisWeek"); // exactly 7
  });
});

describe("bucketUrgency — unknown and malformed input", () => {
  it("reports unknown for a missing date", () => {
    expect(bucketUrgency(null, TODAY)).toBe("unknown");
    expect(bucketUrgency(undefined as unknown as null, TODAY)).toBe("unknown");
  });

  it("reports unknown rather than guessing at a malformed date", () => {
    expect(bucketUrgency("23.09.2026", TODAY)).toBe("unknown");
    expect(bucketUrgency("2026-02-30", TODAY)).toBe("unknown");
    expect(bucketUrgency("2026-09-23T12:00:00Z", TODAY)).toBe("unknown");
    expect(bucketUrgency("", TODAY)).toBe("unknown");
  });

  it('reports unknown when "today" itself is malformed', () => {
    expect(bucketUrgency("2026-09-23", "heute")).toBe("unknown");
    expect(bucketUrgency("2026-09-23", "")).toBe("unknown");
  });
});

describe("bucketUrgency — purity", () => {
  it("does not read the system clock", () => {
    // Same arguments, wildly different "today" values: the result must follow
    // the argument, not the machine.
    expect(bucketUrgency("2030-01-01", "2029-12-31")).toBe("tomorrow");
    expect(bucketUrgency("1999-01-01", "2026-09-23")).toBe("expired");
  });

  it("is a total function over its declared input", () => {
    const buckets: readonly Urgency[] = [
      "expired",
      "today",
      "tomorrow",
      "thisWeek",
      "ok",
      "unknown",
    ];
    for (const offset of [-10, -1, 0, 1, 2, 7, 8, 100]) {
      expect(buckets).toContain(bucketUrgency(addDays(TODAY, offset), TODAY));
    }
  });
});

describe("urgency helpers", () => {
  it("URGENT_BUCKETS covers exactly the act-now cases", () => {
    expect(URGENT_BUCKETS).toEqual(["expired", "today", "tomorrow"]);
  });

  it("URGENCY_ORDER sorts the most pressing bucket first and unknown last", () => {
    const sorted = (
      ["ok", "unknown", "expired", "thisWeek", "today", "tomorrow"] as const
    )
      .slice()
      .sort((a, b) => URGENCY_ORDER[a] - URGENCY_ORDER[b]);
    expect(sorted).toEqual([
      "expired",
      "today",
      "tomorrow",
      "thisWeek",
      "ok",
      "unknown",
    ]);
  });

  it("every bucket has a sort weight", () => {
    const buckets: readonly Urgency[] = [
      "expired",
      "today",
      "tomorrow",
      "thisWeek",
      "ok",
      "unknown",
    ];
    for (const bucket of buckets) {
      expect(typeof URGENCY_ORDER[bucket]).toBe("number");
    }
  });
});
