import { describe, expect, it } from "vitest";

import { mapOffCategory, OFF_CATEGORY_RULE_COUNT } from "./off-category";

describe("mapOffCategory — die Reihenfolge ist die Logik", () => {
  it("Joghurt wird nicht zu Milch", () => {
    // OFF liefert bei Joghurt IMMER auch "en:dairies". Stuende die
    // allgemeine Regel vorn, wuerde jeder Joghurt zu Milch — und damit von
    // 14 Tagen Haltbarkeit auf 6 verkuerzt.
    expect(
      mapOffCategory(["en:dairies", "en:fermented-foods", "en:yogurts"]),
    ).toBe("yogurt-quark");
  });

  it("Konserven werden nicht zu Frischgemuese", () => {
    // Eine Dose Mais traegt "en:vegetables". Als Frischgemuese eingestuft
    // schrumpfte sie von Jahren auf eine Woche.
    expect(mapOffCategory(["en:vegetables", "en:canned-vegetables"])).toBe(
      "canned-jarred",
    );
  });

  it("Tiefkuehlware wird nicht zu Frischware", () => {
    expect(mapOffCategory(["en:vegetables", "en:frozen-vegetables"])).toBe(
      "frozen-food",
    );
  });

  it("Schokolade wird nicht zu Milch", () => {
    // Der Schadensfall aus der Messung: "Tafeln Milch" ist Milchschokolade.
    expect(
      mapOffCategory(["en:snacks", "en:sweet-snacks", "en:chocolates"]),
    ).toBe("sweets-snacks");
    // Und der Fall, der die erste Fassung brach: "milk" steckt in
    // "milk-chocolates". Die Art steht hinten, nicht vorn.
    expect(mapOffCategory(["en:milk-chocolates"])).toBe("sweets-snacks");
  });

  it("Schokoladenmilch bleibt aber Milch — der Gegenfall", () => {
    // Beide Begriffe kommen in beiden Angaben vor. Nur das letzte Wort
    // unterscheidet sie, und genau daran haengt die Haltbarkeit.
    expect(mapOffCategory(["en:chocolate-milks"])).toBe("milk-cream");
  });

  it("Kokosmilch wird nicht zu Nuessen", () => {
    // "nut" steckt in "coconut". Deshalb gibt es keine Regel fuer das
    // blosse "nut", nur fuer die eindeutigen Formen.
    expect(mapOffCategory(["en:coconut-milks"])).toBe("milk-cream");
  });

  it("Hartkaese und Weichkaese werden unterschieden", () => {
    expect(mapOffCategory(["en:cheeses", "en:hard-cheeses"])).toBe(
      "hard-cheese",
    );
    expect(mapOffCategory(["en:cheeses", "en:fresh-cheeses"])).toBe(
      "soft-cheese",
    );
  });

  it("faellt bei blossem Kaese auf die laengere Haltbarkeit zurueck", () => {
    // Ohne genauere Angabe lieber Hartkaese: zu frueh warnen ist harmlos,
    // zu spaet bedeutet verdorbene Ware.
    expect(mapOffCategory(["en:cheeses"])).toBe("hard-cheese");
  });

  it("Wurstwaren werden nicht zu Frischfleisch", () => {
    expect(mapOffCategory(["en:meats", "en:hams"])).toBe("sausages-cold-cuts");
    expect(mapOffCategory(["en:meats", "en:salamis"])).toBe(
      "sausages-cold-cuts",
    );
  });
});

describe("mapOffCategory — gewoehnliche Faelle", () => {
  const faelle: readonly [string[], string][] = [
    [["en:breads"], "bread-bakery"],
    [["en:pastas"], "pasta-rice-cereals"],
    [["en:breakfast-cereals"], "pasta-rice-cereals"],
    [["en:olive-oils"], "oils-vinegar"],
    [["en:vinegars"], "oils-vinegar"],
    [["en:mustards"], "sauces-condiments"],
    [["en:honeys"], "sweet-spreads"],
    [["en:jams"], "sweet-spreads"],
    [["en:coffees"], "coffee-tea"],
    [["en:teas"], "coffee-tea"],
    [["en:waters"], "beverages"],
    [["en:eggs"], "eggs"],
    [["en:fresh-fruits"], "fresh-fruit"],
    [["en:potatoes"], "potatoes-root-vegetables"],
    [["en:fishes"], "fish-seafood"],
    [["en:spices"], "spices-broth"],
  ];

  for (const [tags, erwartet] of faelle) {
    it(`${tags[0]} -> ${erwartet}`, () => {
      expect(mapOffCategory(tags)).toBe(erwartet);
    });
  }
});

describe("mapOffCategory — lieber nichts als etwas Falsches", () => {
  it("gibt null zurueck, wenn keine Regel passt", () => {
    // null heisst "frag den Menschen". Ein Antippen kostet eine Sekunde,
    // eine falsche Haltbarkeit kostet Vertrauen.
    expect(mapOffCategory(["en:pet-food", "en:cat-food"])).toBeNull();
  });

  it("gibt null bei fehlenden Angaben zurueck", () => {
    // Der Normalfall bei Schweizer Eigenmarken: OFF kennt das Produkt,
    // aber niemand hat Kategorien gepflegt.
    expect(mapOffCategory([])).toBeNull();
    expect(mapOffCategory(null)).toBeNull();
    expect(mapOffCategory(undefined)).toBeNull();
  });

  it("vertraegt Unsinn in der Liste, statt zu werfen", () => {
    expect(
      mapOffCategory([null as unknown as string, 42 as unknown as string]),
    ).toBeNull();
  });

  it("liefert nichts, wenn es die Kategorie in dieser Datenbank nicht gibt", () => {
    // Schutz gegen eine veraltete Regel, die auf eine geloeschte Kategorie
    // zeigt: Dann lieber nachfragen als auf etwas Nichtexistentes zeigen.
    expect(mapOffCategory(["en:yogurts"], ["bread-bakery"])).toBeNull();
    expect(mapOffCategory(["en:yogurts"], ["yogurt-quark"])).toBe(
      "yogurt-quark",
    );
  });

  it("ist unabhaengig von der Gross- und Kleinschreibung", () => {
    expect(mapOffCategory(["EN:Yogurts"])).toBe("yogurt-quark");
  });

  it("hat ueberhaupt Regeln", () => {
    expect(OFF_CATEGORY_RULE_COUNT).toBeGreaterThan(50);
  });
});
