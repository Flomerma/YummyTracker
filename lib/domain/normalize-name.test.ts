import { describe, expect, it } from "vitest";

import {
  BRAND_NOISE_PHRASES,
  BRAND_NOISE_TOKENS,
  normalizeName,
} from "./normalize-name";

/**
 * The densest test file in the project, as the concept demands. The cases in
 * "real receipt lines" are written the way Migros and Coop actually print
 * them: all caps, brand line first, quantity glued to the end.
 */

describe("normalizeName — real receipt lines", () => {
  const cases: readonly [string, string][] = [
    // Migros house brands
    ["M-CLASSIC VOLLMILCH UHT 1L", "vollmilch uht"],
    ["M-Budget Butter 250g", "butter"],
    ["M-CLASSIC HALBRAHM 2 X 2 DL", "halbrahm"],
    ["MIGROS BIO VOLLMILCH 1 LITER", "vollmilch"],
    ["ANNA'S BEST SALAT GEMISCHT 250G", "salat gemischt"],
    ["Anna’s Best Penne al Pesto 400g", "penne al pesto"],
    // Coop house brands
    ["PRIX GARANTIE SPAGHETTI 500G", "spaghetti"],
    ["COOP QUALITÉ & PRIX HALBRAHM 2DL", "halbrahm"],
    ["NATURAPLAN BIO EIER 6ER", "eier"],
    ["COOP NATURAFARM POULET GESCHNETZELT 300G", "poulet geschnetzelt"],
    ["Coop Naturaplan Bio Rüebli 1kg", "ruebli"],
    // Discounters
    ["DENNER RIVELLA ROT 1.5L", "rivella rot"],
    ["Aldi Suisse Hörnli 500g", "suisse hoernli"],
    ["LIDL BANANEN 1KG", "banane"],
    // Loose goods, weighed at the till
    ["KARTOFFELN FESTKOCHEND 2.5KG", "kartoffel festkochend"],
    ["ZWIEBELN GELB 1KG", "zwiebel gelb"],
    ["Rispentomaten 500 g", "rispentomate"],
    ["BIO-BANANEN", "banane"],
    ["Eier Freiland 10 Stk", "eier freiland"],
    ["Cervelas 4 x 100 g", "cervelas"],
    ["M-Classic Tiefkühl-Pommes 1kg", "tiefkuehl pommes"],
    ["Bündnerfleisch 100g", "buendnerfleisch"],
    // Brands that are NOT noise must survive untouched
    ["Zweifel Paprika Chips 175g", "zweifel paprika chips"],
    ["Ovomaltine Crunchy Cream 400g", "ovomaltine crunchy cream"],
    ["Gruyère AOP rezent 200g", "gruyere aop rezent"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(normalizeName(input)).toBe(expected);
    });
  }
});

describe("normalizeName — the case the concept calls out by name", () => {
  it("folds the receipt line, the shopping list entry and the catalogue name together", () => {
    const fromReceipt = normalizeName("M-CLASSIC VOLLMILCH 1L");
    const fromShoppingList = normalizeName("Vollmilch");
    const fromCatalogue = normalizeName("Vollmilch");

    expect(fromReceipt).toBe("vollmilch");
    expect(fromShoppingList).toBe(fromReceipt);
    expect(fromCatalogue).toBe(fromReceipt);
  });
});

describe("normalizeName — case and whitespace", () => {
  it("lower-cases", () => {
    expect(normalizeName("VOLLMILCH")).toBe("vollmilch");
    expect(normalizeName("VoLlMiLcH")).toBe("vollmilch");
  });

  it("collapses runs of spaces, tabs and newlines", () => {
    expect(normalizeName("Milch   Voll")).toBe("milch voll");
    expect(normalizeName("Milch\t\nVoll")).toBe("milch voll");
    expect(normalizeName("  Milch  ")).toBe("milch");
  });

  it("treats a whitespace-only string like an empty one", () => {
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName("\t\n")).toBe("");
  });

  it("returns an empty string for empty or non-string input", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(null as unknown as string)).toBe("");
    expect(normalizeName(undefined as unknown as string)).toBe("");
    expect(normalizeName(42 as unknown as string)).toBe("");
  });
});

describe("normalizeName — umlauts and diacritics", () => {
  it("expands German umlauts rather than dropping the dots", () => {
    expect(normalizeName("Äpfel")).toBe("aepfel");
    expect(normalizeName("ÄPFEL")).toBe("aepfel");
    expect(normalizeName("Öl")).toBe("oel");
    expect(normalizeName("Süssmost")).toBe("suessmost");
    expect(normalizeName("Kürbis")).toBe("kuerbis");
    expect(normalizeName("Gemüse")).toBe("gemuese");
  });

  it("makes the umlaut spelling and the ASCII spelling meet", () => {
    // The Swiss case, and a real source of catalogue duplicates: tills print
    // without umlauts and people type without them, so the same word arrives
    // as "Rüebli", "Rueebli" and "Ruebli" on the same day.
    expect(normalizeName("Rüebli")).toBe("ruebli");
    expect(normalizeName("Rueebli")).toBe("ruebli");
    expect(normalizeName("Ruebli")).toBe("ruebli");
    expect(normalizeName("Müesli")).toBe("muesli");
    expect(normalizeName("Muesli")).toBe("muesli");
    expect(normalizeName("MÜESLI")).toBe(normalizeName("MUESLI"));
    expect(normalizeName("Öpfelchüechli")).toBe(
      normalizeName("Oepfelchuechli"),
    );
  });

  it('leaves an ordinary German double "e" alone', () => {
    // The fold must only fire on a transliterated umlaut followed by "e",
    // never on a word that simply contains "ee".
    expect(normalizeName("Kaffee")).toBe("kaffee");
    expect(normalizeName("Eistee")).toBe("eistee");
    expect(normalizeName("Beeren")).toBe("beere");
    expect(normalizeName("Seelachs")).toBe("seelachs");
    expect(normalizeName("Aloe Vera")).toBe("aloe vera");
    // "püree" expands to "pueree" — the "ee" is not adjacent to the "ue",
    // so the fold does not fire and the word keeps both syllables.
    expect(normalizeName("Püree")).toBe("pueree");
    expect(normalizeName("Kartoffelpüree")).toBe("kartoffelpueree");
  });

  it("turns ß into ss, so German and Swiss spellings meet", () => {
    expect(normalizeName("Weißbrot")).toBe("weissbrot");
    expect(normalizeName("Weissbrot")).toBe("weissbrot");
    expect(normalizeName("Weißbrot")).toBe(normalizeName("Weissbrot"));
  });

  it("handles decomposed input identically to composed input", () => {
    const composed = "Äpfel".normalize("NFC");
    const decomposed = "Äpfel".normalize("NFD");
    expect(composed).not.toBe(decomposed); // guard: the two really differ
    expect(normalizeName(decomposed)).toBe("aepfel");
    expect(normalizeName(decomposed)).toBe(normalizeName(composed));
  });

  it("strips non-German accents to their base letter", () => {
    expect(normalizeName("Gruyère")).toBe("gruyere");
    expect(normalizeName("Crème fraîche")).toBe("creme fraiche");
    expect(normalizeName("Qualité")).toBe("qualite");
    expect(normalizeName("Jalapeño")).toBe("jalapeno");
  });
});

describe("normalizeName — quantities", () => {
  const cases: readonly [string, string][] = [
    ["Milch 1L", "milch"],
    ["Milch 1 l", "milch"],
    ["Milch 1.5L", "milch"],
    ["Milch 1,5 L", "milch"],
    ["Rahm 2dl", "rahm"],
    ["Rahm 20cl", "rahm"],
    ["Zucker 500g", "zucker"],
    ["Zucker 500 G", "zucker"],
    ["Zucker 1 kg", "zucker"],
    ["Zucker 1.5kg", "zucker"],
    ["Mehl 500gr", "mehl"],
    ["Rahm 2x200ml", "rahm"],
    ["Rahm 2 x 200 ml", "rahm"],
    ["Eier 6er", "eier"],
    ["Eier 6ER", "eier"],
    ["Eier 12er-Pack", "eier"],
    ["Eier 12er Pack", "eier"],
    ["Joghurt 4 Stk", "joghurt"],
    ["Joghurt 4 Stück", "joghurt"],
    ["Joghurt 4 St", "joghurt"],
    ["Joghurt 4 pcs", "joghurt"],
    ["Zucker 500 Gramm", "zucker"],
    ["Milch 1 Liter", "milch"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(normalizeName(input)).toBe(expected);
    });
  }

  it("does not eat digits that belong to the product name", () => {
    // The lookbehind must keep "B12" intact.
    expect(normalizeName("Vitamin B12")).toBe("vitamin b12");
    // The digits survive; "Kapseln" is folded by the plural rule, not by the
    // quantity rule.
    expect(normalizeName("Omega 3 Kapseln")).toBe("omega 3 kapsel");
    expect(normalizeName("Omega 3 Kapseln")).toBe(
      normalizeName("Omega 3 Kapsel"),
    );
  });

  it("does not mistake a word starting with a unit letter for a unit", () => {
    // "2 Stangen" must not lose "angen" to the "st" unit.
    expect(normalizeName("2 Stangen Lauch")).toBe("2 stange lauch");
    expect(normalizeName("3 Gläser Konfitüre")).toBe("3 glaeser konfituere");
  });

  it("leaves a bare number without a unit alone", () => {
    // Deliberately conservative: "Rivella 3" could be part of the name.
    expect(normalizeName("Rivella 3")).toBe("rivella 3");
  });

  it("returns an empty string when the input is nothing but a quantity", () => {
    expect(normalizeName("1L")).toBe("");
    expect(normalizeName("500g")).toBe("");
  });
});

describe("normalizeName — punctuation", () => {
  it("turns punctuation into word boundaries", () => {
    expect(normalizeName("Coca-Cola")).toBe("coca cola");
    expect(normalizeName("Salz & Pfeffer")).toBe("salz pfeffer");
    expect(normalizeName("Fleisch/Poulet")).toBe("fleisch poulet");
    expect(normalizeName("Poulet, geschnetzelt.")).toBe("poulet geschnetzelt");
    expect(normalizeName("Milch (haltbar)")).toBe("milch haltbar");
  });

  it("deletes apostrophes instead of splitting the word", () => {
    // "Anna's" must become one token "annas", not two tokens "anna s" —
    // otherwise the "annas best" phrase could never match.
    expect(normalizeName("Anna's")).toBe("annas");
    expect(normalizeName("Anna’s")).toBe("annas");
    expect(normalizeName("Kellogg's Cornflakes")).toBe("kelloggs cornflakes");
    expect(normalizeName("Anna’s Best Lasagne")).toBe("lasagne");
    expect(normalizeName("Anna's Best Lasagne")).toBe(
      normalizeName("Anna’s Best Lasagne"),
    );
  });

  it("treats typographic dashes like a plain hyphen", () => {
    expect(normalizeName("M–Classic Milch")).toBe("milch");
    expect(normalizeName("M-Classic Milch")).toBe("milch");
  });
});

describe("normalizeName — brand and marketing noise", () => {
  it("removes every single-word brand token", () => {
    expect(normalizeName("Migros Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Coop Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Denner Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Aldi Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Lidl Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Bio Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Aktion Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Naturaplan Vollmilch")).toBe("vollmilch");
    expect(normalizeName("Naturafarm Poulet")).toBe("poulet");
  });

  it("removes multi-word phrases", () => {
    expect(normalizeName("Prix Garantie Milch")).toBe("milch");
    expect(normalizeName("Qualité & Prix Milch")).toBe("milch");
    expect(normalizeName("M-Classic Milch")).toBe("milch");
    expect(normalizeName("M-Budget Milch")).toBe("milch");
    expect(normalizeName("MClassic Milch")).toBe("milch");
  });

  it("removes several layers of noise at once", () => {
    expect(normalizeName("COOP NATURAPLAN BIO AKTION VOLLMILCH 1L")).toBe(
      "vollmilch",
    );
  });

  it("only removes whole tokens, never fragments inside a word", () => {
    // This is the difference between a normalizer and a wrecking ball.
    expect(normalizeName("Biofleisch")).toBe("biofleisch");
    expect(normalizeName("Biojoghurt Natur")).toBe("biojoghurt natur");
    expect(normalizeName("Coopération")).toBe("cooperation");
    expect(normalizeName("Aktionär")).toBe("aktionaer");
    expect(normalizeName("Migrolino")).toBe("migrolino");
  });

  it("keeps brands that are not on the noise list", () => {
    expect(normalizeName("Zweifel Chips")).toBe("zweifel chips");
    expect(normalizeName("Emmi Caffè Latte")).toBe("emmi caffe latte");
    expect(normalizeName("Nature Joghurt")).toBe("nature joghurt");
  });

  it("falls back to the un-stripped name instead of returning nothing", () => {
    // "M-Budget" on its own is a poor identifier, but the empty string would
    // merge every brand-only entry into one catalogue row.
    expect(normalizeName("M-Budget")).toBe("m budget");
    expect(normalizeName("Bio")).toBe("bio");
    expect(normalizeName("Migros")).toBe("migros");
    expect(normalizeName("Prix Garantie")).toBe("prix garantie");
    expect(normalizeName("Coop Bio")).toBe("coop bio");
  });

  it("every noise entry survives as its own fallback", () => {
    for (const token of BRAND_NOISE_TOKENS) {
      expect(normalizeName(token)).not.toBe("");
    }
    for (const phrase of BRAND_NOISE_PHRASES) {
      expect(normalizeName(phrase)).not.toBe("");
    }
  });

  it("the noise lists are themselves already normalized", () => {
    // A capitalised or accented entry would silently never match.
    for (const entry of [...BRAND_NOISE_TOKENS, ...BRAND_NOISE_PHRASES]) {
      expect(entry).toBe(entry.toLowerCase());
      expect(entry).toMatch(/^[a-z0-9]+(?: [a-z0-9]+)*$/);
    }
  });
});

describe("normalizeName — plural handling stays narrow", () => {
  it('folds the common "-en" plural onto its singular', () => {
    expect(normalizeName("Bananen")).toBe("banane");
    expect(normalizeName("Tomaten")).toBe("tomate");
    expect(normalizeName("Zitronen")).toBe("zitrone");
    expect(normalizeName("Karotten")).toBe("karotte");
    expect(normalizeName("Gurken")).toBe("gurke");
    expect(normalizeName("Oliven")).toBe("olive");
    expect(normalizeName("Beeren")).toBe("beere");
  });

  it('folds the "-ln" plural too — these are weekly staples', () => {
    expect(normalizeName("Kartoffeln")).toBe("kartoffel");
    expect(normalizeName("Zwiebeln")).toBe("zwiebel");
    expect(normalizeName("Nudeln")).toBe("nudel");
    expect(normalizeName("Mandeln")).toBe("mandel");
    expect(normalizeName("Waffeln")).toBe("waffel");
  });

  it("makes the plural on the receipt meet the singular in the catalogue", () => {
    const pairs: readonly [string, string][] = [
      ["KARTOFFELN FESTKOCHEND 2.5KG", "Kartoffel festkochend"],
      ["ZWIEBELN GELB 1KG", "Zwiebel gelb"],
      ["Nudeln", "Nudel"],
      ["TRAUBEN WEISS 500G", "Traube weiss"],
      ["Rispentomaten 500 g", "Rispentomate"],
      ["BANANEN CHIQUITA", "Banane Chiquita"],
      ["LIDL BANANEN 1KG", "Bio Banane"],
    ];
    for (const [receipt, catalogue] of pairs) {
      expect(normalizeName(receipt), receipt).toBe(normalizeName(catalogue));
    }
  });

  it('does NOT stem — "Banane" must not become "Banan"', () => {
    expect(normalizeName("Banane")).toBe("banane");
    expect(normalizeName("Tomate")).toBe("tomate");
    expect(normalizeName("Gurke")).toBe("gurke");
    expect(normalizeName("Milch")).toBe("milch");
    expect(normalizeName("Butter")).toBe("butter");
    expect(normalizeName("Käse")).toBe("kaese");
    expect(normalizeName("Brot")).toBe("brot");
    expect(normalizeName("Joghurt")).toBe("joghurt");
    expect(normalizeName("Rahm")).toBe("rahm");
  });

  it("leaves short words alone — the length floor is what makes the rule safe", () => {
    expect(normalizeName("Essen")).toBe("essen");
    expect(normalizeName("Hafen")).toBe("hafen");
    expect(normalizeName("Leben")).toBe("leben");
    expect(normalizeName("Korn")).toBe("korn");
    expect(normalizeName("Köln")).toBe("koeln");
    expect(normalizeName("Eiern")).toBe("eiern");
  });

  it("never removes more than the one trailing letter", () => {
    // The guard against the rule quietly turning into a stemmer.
    for (const word of [
      "Bananen",
      "Kartoffeln",
      "Zwiebeln",
      "Tomaten",
      "Nudeln",
    ]) {
      const before = normalizeName(word.slice(0, -1)); // "Bananen" → "Banane"
      expect(normalizeName(word).length, word).toBe(before.length);
    }
  });

  it("does not merge words that only look like singular and plural", () => {
    expect(normalizeName("Rahm")).not.toBe(normalizeName("Rahmen"));
  });

  it('documents the known false positives of the "-en" rule', () => {
    // These words are not plurals, so the rule mangles them. That is accepted
    // on purpose: normalizeName is applied to BOTH sides of every comparison,
    // so a consistent artefact still compares equal. What it must not do is
    // merge two different foods — and it does not.
    expect(normalizeName("Kuchen")).toBe("kuche");
    expect(normalizeName("Kuchen")).toBe(normalizeName("KUCHEN"));
    expect(normalizeName("Kuchen")).not.toBe(normalizeName("Küche"));
    expect(normalizeName("Braten")).toBe("brate");
    expect(normalizeName("Braten")).not.toBe(normalizeName("Brot"));
  });

  it("documents the plurals it deliberately does not handle", () => {
    // "-rn" is left out: its only common food plural is "Eiern", which the
    // length floor would skip anyway, so the rule would add risk for nothing.
    expect(normalizeName("Eiern")).toBe("eiern");
    expect(normalizeName("Eiern")).not.toBe(normalizeName("Eier"));
    // "-s" and "-e" plurals are left alone as well. Handling "-e" would mean
    // stripping the final vowel, which is exactly the stemming that must not
    // happen: it would turn "Banane" into "Banan".
    expect(normalizeName("Chips")).toBe("chips");
    expect(normalizeName("Brote")).toBe("brote");
    expect(normalizeName("Brote")).not.toBe(normalizeName("Brot"));
  });
});

describe("normalizeName — structural properties", () => {
  const samples: readonly string[] = [
    "M-CLASSIC VOLLMILCH UHT 1L",
    "ANNA'S BEST SALAT 250G",
    "COOP QUALITÉ & PRIX HALBRAHM 2DL",
    "NATURAPLAN BIO EIER 6ER",
    "Bananen",
    "M-Budget",
    "Bio",
    "Äpfel Gala 1kg",
    "Prix Garantie",
    "",
    "   ",
    "1L",
    "Zweifel Paprika Chips 175g",
    "Vitamin B12",
    "Coca-Cola Zero 0.5L",
    "Coop Naturaplan Bio Rüebli 1kg",
    "KARTOFFELN FESTKOCHEND 2.5KG",
    "Müesli",
    "Kaffee",
  ];

  it("is idempotent — normalizing an already normalized name changes nothing", () => {
    for (const sample of samples) {
      const once = normalizeName(sample);
      expect(normalizeName(once), `sample: ${sample}`).toBe(once);
    }
  });

  it("only ever emits lower case letters, digits and single spaces", () => {
    for (const sample of samples) {
      const result = normalizeName(sample);
      if (result === "") continue;
      expect(result, `sample: ${sample}`).toMatch(/^[a-z0-9]+(?: [a-z0-9]+)*$/);
    }
  });

  it("is insensitive to surrounding whitespace and case", () => {
    for (const sample of samples) {
      expect(normalizeName(`  ${sample.toUpperCase()}  `)).toBe(
        normalizeName(sample),
      );
    }
  });
});
