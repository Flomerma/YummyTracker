import { describe, expect, it } from "vitest";

import {
  MATCH_CONFIDENCE_FLOOR,
  bigramDice,
  levenshtein,
  matchProduct,
  scoreNames,
  tokenF1,
  tokenSimilarity,
} from "./match-product";
import { normalizeName } from "./normalize-name";
import type { ProductCandidate } from "./types";

const CATALOGUE: readonly ProductCandidate[] = [
  { id: "p-vollmilch", name: "Vollmilch" },
  { id: "p-vollmilch-uht", name: "Vollmilch UHT" },
  { id: "p-halbrahm", name: "Halbrahm" },
  { id: "p-vollrahm", name: "Vollrahm" },
  { id: "p-butter", name: "Butter" },
  { id: "p-eier", name: "Eier" },
  { id: "p-banane", name: "Banane" },
  { id: "p-spaghetti", name: "Spaghetti" },
  { id: "p-poulet", name: "Pouletgeschnetzeltes" },
  { id: "p-salat", name: "Gemischter Salat" },
];

function ids(matches: readonly { productId: string }[]): string[] {
  return matches.map((m) => m.productId);
}

function confidenceOf(
  matches: readonly { productId: string; confidence: number }[],
  id: string,
): number | undefined {
  return matches.find((m) => m.productId === id)?.confidence;
}

describe("matchProduct — receipt lines against the catalogue", () => {
  it("scores an exact normalized match as 1", () => {
    const result = matchProduct("M-CLASSIC VOLLMILCH UHT 1L", CATALOGUE);
    expect(result[0]).toEqual({ productId: "p-vollmilch-uht", confidence: 1 });
  });

  it("ranks the exact match above the merely similar one", () => {
    const result = matchProduct("M-CLASSIC VOLLMILCH UHT 1L", CATALOGUE);
    expect(ids(result).indexOf("p-vollmilch-uht")).toBeLessThan(
      ids(result).indexOf("p-vollmilch"),
    );
  });

  it("matches an abbreviated receipt line to the full catalogue name", () => {
    // "GESCHN." is how a Migros receipt prints "geschnetzeltes".
    const result = matchProduct("POULET GESCHN. 300G", CATALOGUE);
    expect(result[0]?.productId).toBe("p-poulet");
    expect(result[0]?.confidence).toBeGreaterThan(0.75);
  });

  it("is indifferent to word order", () => {
    const result = matchProduct("SALAT GEMISCHT 250G", CATALOGUE);
    expect(result[0]?.productId).toBe("p-salat");
    expect(result[0]?.confidence).toBeGreaterThan(0.85);
  });

  it("matches a plural receipt line to the singular catalogue entry", () => {
    expect(matchProduct("BANANEN 1KG", CATALOGUE)[0]).toEqual({
      productId: "p-banane",
      confidence: 1,
    });
  });

  it("tolerates a single-letter typo", () => {
    // "SPAGETTI" instead of "Spaghetti".
    const result = matchProduct("SPAGETTI 500G", CATALOGUE);
    expect(result[0]?.productId).toBe("p-spaghetti");
    expect(result[0]?.confidence).toBeGreaterThan(0.8);
  });

  it("matches a till that cannot print umlauts against the catalogue", () => {
    // Swiss tills print "RUEEBLI" or "RUEBLI"; the catalogue says "Rüebli".
    const catalogue: ProductCandidate[] = [
      ...CATALOGUE,
      { id: "p-ruebli", name: "Rüebli" },
    ];
    for (const line of ["RUEEBLI 1KG", "RUEBLI 1KG", "Rüebli 1kg"]) {
      expect(matchProduct(line, catalogue)[0], line).toEqual({
        productId: "p-ruebli",
        confidence: 1,
      });
    }
  });

  it("strips the brand line before matching", () => {
    expect(matchProduct("PRIX GARANTIE BUTTER 250G", CATALOGUE)[0]).toEqual({
      productId: "p-butter",
      confidence: 1,
    });
    expect(matchProduct("NATURAPLAN BIO EIER 6ER", CATALOGUE)[0]).toEqual({
      productId: "p-eier",
      confidence: 1,
    });
  });

  it("returns matches in descending order of confidence", () => {
    const result = matchProduct("VOLLMILCH 1L", CATALOGUE);
    const scores = result.map((match) => match.confidence);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("matchProduct — refusing to match", () => {
  it("keeps two products that differ by two letters apart", () => {
    // Vollrahm and Halbrahm are genuinely different goods. A matcher that
    // confuses them would put cream into the wrong shelf life rule.
    const result = matchProduct("VOLLRAHM 2DL", CATALOGUE);
    expect(result[0]?.productId).toBe("p-vollrahm");
    expect(confidenceOf(result, "p-halbrahm")).toBeUndefined();
  });

  it("returns nothing for a product the catalogue does not know", () => {
    expect(matchProduct("ZAHNPASTA ELMEX 75ML", CATALOGUE)).toEqual([]);
    expect(matchProduct("WASCHMITTEL", CATALOGUE)).toEqual([]);
  });

  it("drops everything below the confidence floor", () => {
    const result = matchProduct("APFELSAFT 1L", CATALOGUE);
    for (const match of result) {
      expect(match.confidence).toBeGreaterThanOrEqual(MATCH_CONFIDENCE_FLOOR);
    }
  });

  it("documents the known near-miss the ranking has to resolve", () => {
    // "Vollmilch" is literally contained in "Vollmilchschokolade", so the
    // chocolate scores high. It must never outrank the real thing.
    const withChocolate: ProductCandidate[] = [
      ...CATALOGUE,
      { id: "p-schoggi", name: "Vollmilchschokolade" },
    ];
    const result = matchProduct("M-CLASSIC VOLLMILCH 1L", withChocolate);
    expect(result[0]?.productId).toBe("p-vollmilch");
    expect(result[0]?.confidence).toBe(1);
    expect(confidenceOf(result, "p-schoggi")).toBeLessThan(1);
  });

  it("is conservative about transposed letters", () => {
    // "Michl" vs "Milch" is two edits in a five letter word — that is as
    // likely to be a different product as a typo, so we do not claim a match.
    expect(scoreNames("michl", "milch")).toBeLessThan(MATCH_CONFIDENCE_FLOOR);
  });
});

describe("matchProduct — input handling", () => {
  it("returns an empty array for empty or unusable raw text", () => {
    expect(matchProduct("", CATALOGUE)).toEqual([]);
    expect(matchProduct("   ", CATALOGUE)).toEqual([]);
    expect(matchProduct("1L", CATALOGUE)).toEqual([]); // nothing but a quantity
    expect(matchProduct(null as unknown as string, CATALOGUE)).toEqual([]);
  });

  it("returns an empty array for an empty candidate list", () => {
    expect(matchProduct("Vollmilch", [])).toEqual([]);
    expect(
      matchProduct("Vollmilch", null as unknown as ProductCandidate[]),
    ).toEqual([]);
  });

  it("uses the stored normalized name when there is one", () => {
    const result = matchProduct("Vollmilch", [
      { id: "p1", name: "irgendetwas anderes", normalizedName: "vollmilch" },
    ]);
    expect(result[0]).toEqual({ productId: "p1", confidence: 1 });
  });

  it("re-normalizes a stored name, so a stale row cannot poison the score", () => {
    // A normalized_name written by an older version of normalizeName.
    const result = matchProduct("Vollmilch", [
      { id: "p1", name: "Vollmilch", normalizedName: "M-CLASSIC VOLLMILCH 1L" },
    ]);
    expect(result[0]).toEqual({ productId: "p1", confidence: 1 });
  });

  it("skips candidates whose name normalizes to nothing", () => {
    expect(matchProduct("Vollmilch", [{ id: "p1", name: "1L" }])).toEqual([]);
    expect(matchProduct("Vollmilch", [{ id: "p1", name: "" }])).toEqual([]);
  });

  it("survives malformed candidate rows", () => {
    const candidates = [
      null as unknown as ProductCandidate,
      { name: "Vollmilch" } as unknown as ProductCandidate, // no id
      { id: "p-good", name: "Vollmilch" },
    ];
    expect(matchProduct("Vollmilch", candidates)).toEqual([
      { productId: "p-good", confidence: 1 },
    ]);
  });

  it("does not mutate the candidate list", () => {
    const candidates = [...CATALOGUE];
    const before = candidates.map((c) => c.id);
    matchProduct("VOLLMILCH 1L", candidates);
    expect(candidates.map((c) => c.id)).toEqual(before);
  });
});

describe("matchProduct — deterministic ordering", () => {
  it("breaks a tie by the shorter name, then by id", () => {
    const candidates: ProductCandidate[] = [
      { id: "p-zzz", name: "Vollmilch" },
      { id: "p-aaa", name: "Vollmilch" },
      { id: "p-mmm", name: "Vollmilch" },
    ];
    expect(ids(matchProduct("Vollmilch", candidates))).toEqual([
      "p-aaa",
      "p-mmm",
      "p-zzz",
    ]);
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    const forwards = matchProduct("VOLLMILCH UHT 1L", CATALOGUE);
    const backwards = matchProduct(
      "VOLLMILCH UHT 1L",
      [...CATALOGUE].reverse(),
    );
    expect(backwards).toEqual(forwards);
  });
});

describe("scoreNames — properties", () => {
  const samples = [
    "vollmilch",
    "vollmilch uht",
    "halbrahm",
    "poulet geschnetzelt",
    "gemischter salat",
    "banane",
    "spaghetti",
  ];

  it("is symmetric", () => {
    for (const a of samples) {
      for (const b of samples) {
        expect(scoreNames(a, b), `${a} / ${b}`).toBe(scoreNames(b, a));
      }
    }
  });

  it("stays inside 0 … 1", () => {
    for (const a of samples) {
      for (const b of samples) {
        const score = scoreNames(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reserves 1 for identical normalized names", () => {
    for (const a of samples) {
      expect(scoreNames(a, a)).toBe(1);
      for (const b of samples) {
        if (a === b) continue;
        expect(scoreNames(a, b), `${a} / ${b}`).toBeLessThan(1);
      }
    }
  });

  it("scores an empty side as zero", () => {
    expect(scoreNames("", "vollmilch")).toBe(0);
    expect(scoreNames("vollmilch", "")).toBe(0);
    expect(scoreNames("", "")).toBe(0);
  });

  it('agrees with normalizeName on what "the same product" means', () => {
    expect(
      scoreNames(
        normalizeName("M-CLASSIC VOLLMILCH 1L"),
        normalizeName("Vollmilch"),
      ),
    ).toBe(1);
  });
});

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("milch", "milch")).toBe(0);
    expect(levenshtein("", "")).toBe(0);
  });

  it("counts insertions, deletions and substitutions", () => {
    expect(levenshtein("spagetti", "spaghetti")).toBe(1); // insertion
    expect(levenshtein("milch", "milc")).toBe(1); // deletion
    expect(levenshtein("milch", "malch")).toBe(1); // substitution
    expect(levenshtein("milch", "michl")).toBe(2); // transposition = 2 edits
  });

  it("falls back to the length when one side is empty", () => {
    expect(levenshtein("", "milch")).toBe(5);
    expect(levenshtein("milch", "")).toBe(5);
  });

  it("is symmetric", () => {
    expect(levenshtein("halbrahm", "vollrahm")).toBe(
      levenshtein("vollrahm", "halbrahm"),
    );
  });
});

describe("tokenSimilarity", () => {
  it("is 1 for equal tokens", () => {
    expect(tokenSimilarity("milch", "milch")).toBe(1);
  });

  it("rewards an abbreviation prefix", () => {
    expect(tokenSimilarity("geschn", "geschnetzelt")).toBe(0.9);
    expect(tokenSimilarity("geschnetzelt", "geschn")).toBe(0.9);
  });

  it("rewards a German compound containment", () => {
    // Not a prefix — the shared part sits at the end or in the middle.
    expect(tokenSimilarity("tomate", "cherrytomate")).toBe(0.8);
    expect(tokenSimilarity("rahm", "halbrahmfrisch")).toBe(0.8);
  });

  it("scores a compound that happens to start with the token as a prefix", () => {
    expect(tokenSimilarity("poulet", "pouletbrust")).toBe(0.9);
  });

  it("will not match on a prefix that is too short to mean anything", () => {
    expect(tokenSimilarity("ei", "eier")).toBe(0);
    expect(tokenSimilarity("bi", "birne")).toBe(0);
  });

  it("returns zero for unrelated tokens", () => {
    expect(tokenSimilarity("brot", "butter")).toBe(0);
    expect(tokenSimilarity("apfelsaft", "orangensaft")).toBe(0);
    expect(tokenSimilarity("milch", "")).toBe(0);
  });

  it("is symmetric", () => {
    const pairs: readonly (readonly [string, string])[] = [
      ["milch", "malch"],
      ["poulet", "pouletbrust"],
      ["brot", "butter"],
    ];
    for (const [a, b] of pairs) {
      expect(tokenSimilarity(a, b)).toBe(tokenSimilarity(b, a));
    }
  });
});

describe("bigramDice", () => {
  it("is 1 for identical token lists", () => {
    expect(bigramDice(["milch"], ["milch"])).toBe(1);
  });

  it("is 0 when nothing is shared", () => {
    expect(bigramDice(["xyz"], ["abc"])).toBe(0);
  });

  it("ignores word boundaries — this is what saves the compound case", () => {
    const glued = bigramDice(
      ["pouletgeschnetzeltes"],
      ["poulet", "geschnetzelt"],
    );
    expect(glued).toBeGreaterThan(0.7);
  });

  it("is order independent", () => {
    expect(bigramDice(["salat", "gemischt"], ["gemischt", "salat"])).toBe(1);
  });

  it("handles single-character tokens without dividing by zero", () => {
    expect(bigramDice(["a"], ["a"])).toBe(1);
    expect(bigramDice(["a"], ["b"])).toBe(0);
    expect(bigramDice([], ["milch"])).toBe(0);
  });
});

describe("tokenF1", () => {
  it("is 1 for identical token sets", () => {
    expect(tokenF1(["vollmilch"], ["vollmilch"])).toBe(1);
  });

  it("penalises extra tokens on either side symmetrically", () => {
    const extraLeft = tokenF1(["vollmilch", "uht"], ["vollmilch"]);
    const extraRight = tokenF1(["vollmilch"], ["vollmilch", "uht"]);
    expect(extraLeft).toBe(extraRight);
    expect(extraLeft).toBeLessThan(1);
    expect(extraLeft).toBeGreaterThan(0.5);
  });

  it("is zero when no token pairs up", () => {
    expect(tokenF1(["brot"], ["butter"])).toBe(0);
    expect(tokenF1([], ["butter"])).toBe(0);
  });
});
