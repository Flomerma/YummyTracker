import { describe, expect, it } from "vitest";

import { compareTotals, deriveQuantity } from "./receipt-line";

/**
 * Die Zahlen stammen von zwei echten Bons (30.09.2026), nicht aus der
 * Vorstellung. Siehe docs/messung/2026-09-30-katalogzuordnung.md.
 */

describe("deriveQuantity — Migros: Gewicht steckt im Verhaeltnis Preis zu Total", () => {
  it("Bio Birnen Williams: 1 x 6.30, Total 3.90 -> 619 g", () => {
    const q = deriveQuantity({ menge: 1, preis: 6.3, total: 3.9 });
    expect(q).toEqual({
      kind: "weight",
      qty: 619,
      unit: "g",
      derivedFrom: "total",
    });
  });

  it("Rispentomaten: 1 x 4.20, Total 2.10 -> genau 500 g", () => {
    const q = deriveQuantity({ menge: 1, preis: 4.2, total: 2.1 });
    expect(q).toMatchObject({ kind: "weight", qty: 500 });
  });

  it("MClass Serrano Rohsch.: 1 x 35.00, Total 4.05 -> 116 g", () => {
    const q = deriveQuantity({ menge: 1, preis: 35, total: 4.05 });
    expect(q).toMatchObject({ kind: "weight", qty: 116 });
  });

  it("Poulet Minifilet: der Rabatt zaehlt zum Gewicht dazu", () => {
    // 1 x 36.00/kg, gespart 2.23, verrechnet 12.35.
    // Ohne den Rabatt kaeme 343 g heraus — zu wenig, weil der Rabatt vom
    // Betrag abgezogen wurde und nicht vom Gewicht.
    const q = deriveQuantity({
      menge: 1,
      preis: 36,
      gespart: 2.23,
      total: 12.35,
    });
    expect(q).toMatchObject({ kind: "weight", qty: 405 });
  });

  it("MClass Schweinsplaetzli: 1 x 21.00, Total 9.65 -> 460 g", () => {
    expect(deriveQuantity({ menge: 1, preis: 21, total: 9.65 })).toMatchObject({
      kind: "weight",
      qty: 460,
    });
  });
});

describe("deriveQuantity — Stueckware bei beiden Haendlern gleich", () => {
  it("Panko Breadcrumbs: 2 x 2.60 = 5.20", () => {
    expect(deriveQuantity({ menge: 2, preis: 2.6, total: 5.2 })).toEqual({
      kind: "pieces",
      qty: 2,
      unit: "piece",
    });
  });

  it("Zwiebeln rot: 1 x 1.10 = 1.10", () => {
    expect(deriveQuantity({ menge: 1, preis: 1.1, total: 1.1 })).toMatchObject({
      kind: "pieces",
      qty: 1,
    });
  });

  it("Oh! High Protein Milk: 6 x 2.65 = 15.90", () => {
    expect(
      deriveQuantity({ menge: 6, preis: 2.65, total: 15.9 }),
    ).toMatchObject({ kind: "pieces", qty: 6 });
  });

  it("Lindt Excell Orange: 2 Stueck zum Aktionspreis 5.95 = 11.90", () => {
    // Der Aktionspreis gilt, nicht der gewoehnliche. Mit 8.85 gerechnet
    // waere 2 x 8.85 = 17.70 und die Zeile wuerde faelschlich als
    // Gewichtsware gelesen.
    expect(
      deriveQuantity({ menge: 2, preis: 8.85, aktion: 5.95, total: 11.9 }),
    ).toMatchObject({ kind: "pieces", qty: 2 });
  });
});

describe("deriveQuantity — Coop: die Mengenspalte IST das Gewicht", () => {
  it("Bio Emmentaler mild: Menge 0.315 -> 315 g, direkt abgelesen", () => {
    // Die Preisspalten des Coop-Bons waren auf dem Foto nicht sicher
    // lesbar. Genau deshalb fasst diese Regel sie nicht an: Eine gebrochene
    // Mengenangabe ist das Gewicht, ganz gleich wie die Preise gemeint sind.
    expect(
      deriveQuantity({ menge: 0.315, preis: 6.45, aktion: 5.05, total: 5.05 }),
    ).toEqual({ kind: "weight", qty: 315, unit: "g", derivedFrom: "menge" });
  });

  it("Bio Emmentaler mild, zweites Stueck: 0.303 -> 303 g", () => {
    expect(
      deriveQuantity({ menge: 0.303, preis: 6.2, total: 4.85 }),
    ).toMatchObject({ kind: "weight", qty: 303, derivedFrom: "menge" });
  });
});

describe("deriveQuantity — Randfaelle", () => {
  it("ohne Preis bleibt die Menge die Stueckzahl", () => {
    expect(deriveQuantity({ menge: 3, preis: null, total: 9 })).toMatchObject({
      kind: "pieces",
      qty: 3,
    });
  });

  it("ohne alles: unbekannt, statt etwas zu erfinden", () => {
    expect(deriveQuantity({ menge: null, preis: null, total: null })).toEqual({
      kind: "unknown",
    });
  });

  it("fehlende Menge gilt als eins", () => {
    expect(
      deriveQuantity({ menge: null, preis: 2.5, total: 2.5 }),
    ).toMatchObject({ kind: "pieces", qty: 1 });
  });

  it("vertraegt die Rundung auf 5 Rappen", () => {
    // 3 x 1.65 = 4.95, auf dem Bon als 4.95 — und bei 4.90 oder 5.00 soll
    // es ebenfalls noch als Stueckware durchgehen.
    expect(
      deriveQuantity({ menge: 3, preis: 1.65, total: 4.95 }),
    ).toMatchObject({ kind: "pieces", qty: 3 });
    expect(deriveQuantity({ menge: 3, preis: 1.65, total: 4.9 })).toMatchObject(
      {
        kind: "pieces",
        qty: 3,
      },
    );
  });

  it("weist ein unplausibles Gewicht ab, statt es zu uebernehmen", () => {
    // 500 / 0.01 waere ein halbes Tonnengewicht. Lieber die Stueckzahl.
    expect(deriveQuantity({ menge: 1, preis: 0.01, total: 500 })).toMatchObject(
      {
        kind: "pieces",
        qty: 1,
      },
    );
  });

  it("laesst sich von Null im Preis nicht aus der Ruhe bringen", () => {
    expect(deriveQuantity({ menge: 1, preis: 0, total: 5 })).toMatchObject({
      kind: "pieces",
      qty: 1,
    });
  });
});

describe("compareTotals", () => {
  it("meldet Uebereinstimmung", () => {
    const r = compareTotals([1.1, 2.5, 3.9], 7.5);
    expect(r.matches).toBe(true);
    expect(r.sum).toBe(7.5);
    expect(r.diff).toBe(0);
  });

  it("meldet die Abweichung, ohne etwas zu verwerfen", () => {
    const r = compareTotals([1.1, 2.5], 10);
    expect(r.matches).toBe(false);
    expect(r.diff).toBe(-6.4);
  });

  it("gilt als uebereinstimmend, wenn gar kein Bon-Total vorliegt", () => {
    // Bei einem langen Bon in Teilbildern steht auf den ersten Bildern
    // ueberhaupt kein Total. Dort darf die Pruefung nicht anschlagen.
    const r = compareTotals([1.1, 2.5], null);
    expect(r.matches).toBe(true);
    expect(r.diff).toBeNull();
  });

  it("vertraegt die Rundung auf 5 Rappen", () => {
    expect(compareTotals([1.11, 2.22], 3.3).matches).toBe(true);
  });
});
