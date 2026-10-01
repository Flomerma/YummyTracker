import { describe, expect, it } from "vitest";

import { eanCheckDigit } from "./ean";
import {
  learningKey,
  parseRcn,
  RCN_ITEM_KEY_LENGTH,
  RCN_MAX_PLAUSIBLE_CHF,
} from "./rcn";

/** Baut ein Waagenetikett aus Artikelschluessel und Preis in Rappen. */
function etikett(itemKey: string, rappen: number): string {
  const ohne = `${itemKey}${String(rappen).padStart(5, "0")}`;
  return `${ohne}${eanCheckDigit(ohne)}`;
}

describe("parseRcn", () => {
  it("zerlegt das belegte Beispiel: Gruyère zu 4.50", () => {
    const code = etikett("2110103", 450);
    const r = parseRcn(code);
    expect(r).not.toBeNull();
    expect(r!.itemKey).toBe("2110103");
    expect(r!.priceChf).toBe(4.5);
  });

  it("liefert fuer dasselbe Stueck in anderem Gewicht denselben Schluessel", () => {
    // Das ist der ganze Punkt: Der Vollcode ist jedes Mal anders, weil der
    // Preis mit eingedruckt ist. Der Artikelschluessel bleibt.
    const a = parseRcn(etikett("2110103", 450))!;
    const b = parseRcn(etikett("2110103", 1285))!;
    expect(a.code).not.toBe(b.code);
    expect(a.itemKey).toBe(b.itemKey);
    expect(a.priceChf).toBe(4.5);
    expect(b.priceChf).toBe(12.85);
  });

  it("unterscheidet zwei Haendler", () => {
    expect(parseRcn(etikett("2110103", 450))!.itemKey).toBe("2110103");
    expect(parseRcn(etikett("2110903", 450))!.itemKey).toBe("2110903");
  });

  it("behauptet keinen Preis, wenn die Stellen keinen ergeben", () => {
    // Null Rappen ist kein Preis, sondern eine leere Stelle.
    expect(parseRcn(etikett("2110103", 0))!.priceChf).toBeNull();
  });

  it("weist einen unglaubwuerdig hohen Preis ab", () => {
    const zuViel = (RCN_MAX_PLAUSIBLE_CHF + 1) * 100;
    expect(parseRcn(etikett("2110103", zuViel))!.priceChf).toBeNull();
  });

  it("nimmt nur gueltige Waagenetiketten", () => {
    expect(parseRcn("7613035676497")).toBeNull(); // gewoehnlicher EAN
    expect(parseRcn("96385074")).toBeNull(); // zu kurz
    expect(parseRcn(null)).toBeNull();
    expect(parseRcn("")).toBeNull();
  });

  it("weist eine falsche Pruefziffer ab", () => {
    const code = etikett("2110103", 450);
    const falsch = code.slice(0, 12) + ((Number(code[12]) + 1) % 10);
    expect(parseRcn(falsch)).toBeNull();
  });

  it("haelt sich an die benannte Laenge", () => {
    expect(parseRcn(etikett("2110103", 450))!.itemKey).toHaveLength(
      RCN_ITEM_KEY_LENGTH,
    );
  });
});

describe("learningKey", () => {
  it("nimmt beim Waagenetikett den Artikelteil", () => {
    expect(learningKey(etikett("2110103", 450))).toBe("2110103");
  });

  it("nimmt beim gewoehnlichen Code den ganzen Code", () => {
    expect(learningKey("7613035676497")).toBe("7613035676497");
  });

  it("gibt nichts zurueck, wenn der Code ungueltig ist", () => {
    // Kein Schluessel aus einem verlesenen Code — der wuerde dauerhaft
    // falsch lernen.
    expect(learningKey("5901234123458")).toBeNull();
    expect(learningKey("hallo")).toBeNull();
    expect(learningKey(null)).toBeNull();
  });
});
