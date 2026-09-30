import { describe, expect, it } from "vitest";

import { normalizeName } from "./normalize-name";
import {
  escapeLikeTerm,
  MAX_TERMS,
  MIN_TERM_LENGTH,
  searchTerms,
} from "./search-terms";

describe("searchTerms", () => {
  it("zerlegt eine mehrteilige Bezeichnung", () => {
    // Genau der Fall, an dem die erste Fassung scheiterte: Der Katalog
    // fuehrt "Rindshackfleisch", der Bon schreibt "Hackfleisch Rind".
    expect(searchTerms("hackfleisch rind")).toEqual(["hackfleisch", "rind"]);
  });

  it("gibt die laengsten Begriffe zuerst zurueck", () => {
    // Der laengste unterscheidet am meisten; wird gekuerzt, faellt das
    // Unwichtigste weg.
    expect(searchTerms("reis basmati vollkorn")).toEqual([
      "vollkorn",
      "basmati",
      "reis",
    ]);
  });

  it("verwirft zu kurze Begriffe", () => {
    expect(searchTerms("peperoni rot")).toEqual(["peperoni", "rot"]);
    expect(searchTerms("tee xl")).toEqual(["tee"]);
  });

  it("verwirft Fuellwoerter", () => {
    expect(searchTerms("ruebli lose")).toEqual(["ruebli"]);
    expect(searchTerms("joghurt mit honig")).toEqual(["joghurt", "honig"]);
  });

  it("gibt den laengsten Token zurueck, wenn sonst nichts uebrig bleibt", () => {
    // "lose" ist ein Fuellwort, "xl" zu kurz — ohne diesen Rueckfall waere
    // die Suche leer und der Nutzer sieht keinen einzigen Vorschlag.
    expect(searchTerms("lose")).toEqual(["lose"]);
    expect(searchTerms("ei")).toEqual(["ei"]);
  });

  it("liefert eine leere Liste bei leerer Eingabe", () => {
    // Wichtig: Die Aufrufer duerfen daraus keine Abfrage ohne Bedingung
    // bauen, sonst laedt eine leere Eingabe den halben Katalog.
    expect(searchTerms("")).toEqual([]);
    expect(searchTerms("   ")).toEqual([]);
  });

  it("entfernt Dubletten", () => {
    expect(searchTerms("brot brot vollkorn")).toEqual(["vollkorn", "brot"]);
  });

  it("begrenzt die Anzahl der Begriffe", () => {
    const viele = "alpha beta gamma delta epsilon zeta eta theta";
    expect(searchTerms(viele)).toHaveLength(MAX_TERMS);
  });

  it("nimmt genau die Mindestlaenge an", () => {
    expect(searchTerms("a".repeat(MIN_TERM_LENGTH))).toHaveLength(1);
    expect(searchTerms(`${"a".repeat(MIN_TERM_LENGTH - 1)} brot`)).toEqual([
      "brot",
    ]);
  });
});

describe("searchTerms auf echten Bonzeilen", () => {
  // Diese Zeilen sind der Grund, weshalb die Funktion existiert. Gemessen
  // gegen den Startkatalog fanden 10 von 18 mit der ganzen Anfrage keinen
  // Kandidaten; tokenweise bleiben 2 uebrig — und die beiden scheitern am
  // Katalog, nicht an der Suche.
  const zeilen: readonly [string, string][] = [
    ["M-Classic Vollmilch 1L", "vollmilch"],
    ["Prix Garantie Butter 250g", "butter"],
    ["Hackfleisch Rind 500g", "hackfleisch"],
    ["Emmentaler gerieben", "emmentaler"],
    ["Basmati Reis 1kg", "basmati"],
    ["Olivenöl extra vergine", "olivenoel"],
    ["Poulet Brust 2 Stk", "poulet"],
    ["TK Erbsen 750g", "erbse"],
  ];

  for (const [roh, erwarteterBegriff] of zeilen) {
    it(`findet "${erwarteterBegriff}" in "${roh}"`, () => {
      const terms = searchTerms(normalizeName(roh));
      expect(terms).toContain(erwarteterBegriff);
    });
  }

  it("liefert fuer jede Bonzeile mindestens einen Begriff", () => {
    for (const [roh] of zeilen) {
      expect(searchTerms(normalizeName(roh)).length).toBeGreaterThan(0);
    }
  });
});

describe("escapeLikeTerm", () => {
  it("maskiert die Platzhalter von LIKE", () => {
    expect(escapeLikeTerm("100%")).toBe("100\\%");
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
    expect(escapeLikeTerm("a\\b")).toBe("a\\\\b");
  });

  it("laesst gewoehnliche Begriffe unveraendert", () => {
    expect(escapeLikeTerm("vollmilch")).toBe("vollmilch");
  });
});
