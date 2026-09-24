import { describe, expect, it } from "vitest";

import {
  addDays,
  diffInDays,
  formatIsoDate,
  isIsoDate,
  parseIsoDate,
} from "./date";

describe("parseIsoDate", () => {
  it("accepts a well formed date", () => {
    expect(parseIsoDate("2026-09-23")).toBe(Date.UTC(2026, 8, 23));
  });

  it("rejects dates that do not exist in the calendar", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-02-29")).toBeNull(); // 2026 is not a leap year
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-10")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
  });

  it("accepts 29 February in a leap year and rejects it in a century non-leap year", () => {
    expect(parseIsoDate("2024-02-29")).not.toBeNull();
    expect(parseIsoDate("2000-02-29")).not.toBeNull(); // divisible by 400
    expect(parseIsoDate("1900-02-29")).toBeNull(); // divisible by 100, not 400
  });

  it("rejects anything that is not exactly YYYY-MM-DD", () => {
    expect(parseIsoDate("2026-9-23")).toBeNull();
    expect(parseIsoDate("23.09.2026")).toBeNull();
    expect(parseIsoDate("2026-09-23T10:00:00Z")).toBeNull();
    expect(parseIsoDate(" 2026-09-23")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate(20260923)).toBeNull();
  });
});

describe("isIsoDate", () => {
  it("narrows valid strings and refuses invalid ones", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate(42)).toBe(false);
  });
});

describe("addDays", () => {
  it("adds inside a month", () => {
    expect(addDays("2026-09-23", 3)).toBe("2026-09-26");
  });

  it("crosses a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses a year boundary in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles February in a leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("handles February in a non-leap year", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("is unaffected by the DST switch (Swiss clocks change on 2026-03-29)", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 3)).toBe("2026-10-27");
  });

  it("adding zero days is the identity", () => {
    expect(addDays("2026-09-23", 0)).toBe("2026-09-23");
  });

  it("handles long spans", () => {
    expect(addDays("2026-09-23", 365)).toBe("2027-09-23");
    expect(addDays("2024-01-01", 366)).toBe("2025-01-01"); // 2024 is a leap year
  });

  it("returns null for invalid input", () => {
    expect(addDays("nope", 1)).toBeNull();
    expect(addDays("2026-02-30", 1)).toBeNull();
    expect(addDays("2026-09-23", 1.5)).toBeNull();
    expect(addDays("2026-09-23", Number.NaN)).toBeNull();
    expect(addDays("2026-09-23", Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("diffInDays", () => {
  it("counts forwards and backwards", () => {
    expect(diffInDays("2026-09-23", "2026-09-26")).toBe(3);
    expect(diffInDays("2026-09-26", "2026-09-23")).toBe(-3);
    expect(diffInDays("2026-09-23", "2026-09-23")).toBe(0);
  });

  it("counts across a month and a year boundary", () => {
    expect(diffInDays("2026-01-31", "2026-02-01")).toBe(1);
    expect(diffInDays("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("counts a leap day as a real day", () => {
    expect(diffInDays("2024-02-28", "2024-03-01")).toBe(2);
    expect(diffInDays("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("is exact across the DST switch", () => {
    // If this went through local time, one of these would be 0.9583… days.
    expect(diffInDays("2026-03-28", "2026-03-30")).toBe(2);
    expect(diffInDays("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("returns null when either side is invalid", () => {
    expect(diffInDays("2026-09-23", "x")).toBeNull();
    expect(diffInDays("x", "2026-09-23")).toBeNull();
  });

  it("round-trips with addDays", () => {
    for (const offset of [-400, -31, -1, 0, 1, 28, 365]) {
      const shifted = addDays("2026-02-27", offset);
      expect(shifted).not.toBeNull();
      expect(diffInDays("2026-02-27", shifted as string)).toBe(offset);
    }
  });
});

describe("formatIsoDate", () => {
  it("pads month and day", () => {
    expect(formatIsoDate(Date.UTC(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips with parseIsoDate", () => {
    for (const date of [
      "2026-01-01",
      "2024-02-29",
      "2026-12-31",
      "2026-09-23",
    ]) {
      expect(formatIsoDate(parseIsoDate(date) as number)).toBe(date);
    }
  });
});
