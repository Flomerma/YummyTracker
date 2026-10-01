import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ASSIGN_ACCEPT_THRESHOLD,
  assignLine,
  categoryForShelfLife,
  productIdOf,
  type AssignCandidate,
} from "./assign";

/* -------------------------------------------------------------------------
 * Entscheidungslogik, mit beherrschbaren Eingaben
 * ---------------------------------------------------------------------- */

/** Ein Kandidat, dessen Name genau der Eingabe entspricht: Vertrauen 1.0. */
const exakt: AssignCandidate = {
  id: "p-vollmilch",
  name: "Vollmilch",
  normalizedName: "vollmilch",
  categoryId: "k-milch",
};

/** Ein Kandidat, der mit der Eingabe nichts zu tun hat. */
const fremd: AssignCandidate = {
  id: "p-zahnpasta",
  name: "Zahnpasta",
  normalizedName: "zahnpasta",
  categoryId: "k-koerperpflege",
};

describe("assignLine", () => {
  it("uebernimmt einen sicheren Treffer und hakt ihn vor", () => {
    const a = assignLine({ rawText: "Vollmilch", candidates: [exakt] });
    expect(a.kind).toBe("product");
    expect(a.accepted).toBe(true);
    if (a.kind === "product") {
      expect(a.productId).toBe("p-vollmilch");
      expect(a.categoryId).toBe("k-milch");
      expect(a.confidence).toBeGreaterThanOrEqual(ASSIGN_ACCEPT_THRESHOLD);
    }
  });

  it("liefert die Kategorie, wenn kein Kandidat passt — kein Fehlerfall", () => {
    // Das ist der haeufigste Fall beim Bon: 48 Prozent der Zeilen finden
    // kein Produkt. Die Kategorie genuegt fuer die Haltbarkeit.
    const a = assignLine({
      rawText: "Lindt Napolitains",
      candidates: [fremd],
      categoryHint: "k-suesswaren",
    });
    expect(a.kind).toBe("category");
    expect(a.accepted).toBe(false);
    expect(categoryForShelfLife(a)).toBe("k-suesswaren");
  });

  it("meldet unbekannt, wenn weder Produkt noch Kategorie bekannt sind", () => {
    const a = assignLine({ rawText: "Lindt Napolitains", candidates: [fremd] });
    expect(a.kind).toBe("unknown");
    expect(categoryForShelfLife(a)).toBeNull();
    expect(productIdOf(a)).toBeNull();
  });

  it("stuft einen sicheren Treffer herab, wenn der Kategorie-Hinweis widerspricht", () => {
    // Genau der Schadensfall aus der Messung: "Tafeln Milch" ist Schokolade,
    // trifft aber "Milchdrink". Der Hinweis kennt den Zusammenhang, die
    // Zeichenkettenaehnlichkeit nicht — also gewinnt der Hinweis.
    const a = assignLine({
      rawText: "Vollmilch",
      candidates: [exakt],
      categoryHint: "k-suesswaren",
    });
    expect(a.kind).toBe("suggestion");
    expect(a.accepted).toBe(false);
    if (a.kind === "suggestion") {
      expect(a.reason).toBe("category_conflict");
      // Fuer die Haltbarkeit zaehlt der Hinweis, nicht die Produktkategorie.
      expect(a.categoryId).toBe("k-suesswaren");
      // Das Produkt bleibt sichtbar — der Hinweis koennte auch falsch sein.
      expect(productIdOf(a)).toBe("p-vollmilch");
    }
  });

  it("uebernimmt, wenn der Hinweis den Treffer bestaetigt", () => {
    const a = assignLine({
      rawText: "Vollmilch",
      candidates: [exakt],
      categoryHint: "k-milch",
    });
    expect(a.kind).toBe("product");
    expect(a.accepted).toBe(true);
  });

  it("behandelt einen leeren Hinweis wie keinen", () => {
    const a = assignLine({
      rawText: "Vollmilch",
      candidates: [exakt],
      categoryHint: "   ",
    });
    expect(a.kind).toBe("product");
  });

  it("kommt mit leerer Kandidatenliste zurecht", () => {
    expect(assignLine({ rawText: "irgendwas", candidates: [] }).kind).toBe(
      "unknown",
    );
  });

  it("merkt die Produktkennung auch beim blossen Vorschlag", () => {
    // Damit ein Vorschlag einen Seitenwechsel ueberlebt: Die Zeile speichert
    // die Kennung in beiden Faellen, `accepted` entscheidet getrennt davon.
    const a = assignLine({
      rawText: "Vollmilch",
      candidates: [exakt],
      categoryHint: "k-anders",
    });
    expect(productIdOf(a)).toBe("p-vollmilch");
  });
});

/* -------------------------------------------------------------------------
 * Gegen den echten Katalog und die echten Bonzeilen
 * ---------------------------------------------------------------------- */

interface SeedProduct {
  name: string;
  normalizedName: string;
  categorySlug: string;
}

const katalog = JSON.parse(
  readFileSync("supabase/seed/catalog.json", "utf8"),
) as { products: SeedProduct[] };

const kandidaten: AssignCandidate[] = katalog.products.map((p, i) => ({
  id: `p${i}`,
  name: p.name,
  normalizedName: p.normalizedName,
  categoryId: p.categorySlug,
}));

function nameOf(id: string | null): string | null {
  return id ? (kandidaten.find((k) => k.id === id)?.name ?? null) : null;
}

describe("assignLine gegen die gemessenen Fehlzuordnungen", () => {
  // Diese sechs Zeilen wurden an echten Bons falsch zugeordnet. Der hoechste
  // Vertrauenswert darunter lag bei 0.56. Jede davon MUSS unterhalb der
  // Uebernahmeschwelle bleiben — eine Schokoladentafel mit sechs Tagen
  // Haltbarkeit erzeugt eine Fehlwarnung, und die kostet Vertrauen.
  const schaedlich: readonly [string, string][] = [
    ["Tafeln Milch 5x100g", "Milchdrink"],
    ["Bio Oliven Amphisis", "Olivenöl"],
    ["Lindt Excell Orange", "Orange"],
    ["LT Excel. Orange I.", "Orange"],
    ["MBud Choc. Orange 70%", "Orange"],
    ["Blévita Mais & Chia", "Maisstärke"],
  ];

  for (const [zeile, falschesProdukt] of schaedlich) {
    it(`uebernimmt "${zeile}" nicht als ${falschesProdukt}`, () => {
      const a = assignLine({ rawText: zeile, candidates: kandidaten });
      expect(a.accepted).toBe(false);
    });
  }

  it("keine einzige der sechs wird uebernommen", () => {
    const uebernommen = schaedlich.filter(
      ([zeile]) =>
        assignLine({ rawText: zeile, candidates: kandidaten }).accepted,
    );
    expect(uebernommen).toEqual([]);
  });
});

describe("assignLine gegen die gemessenen richtigen Zuordnungen", () => {
  // Die Schwelle 0.65 nimmt diese fuenf. Die drei knapp darunter (Eier 0.60,
  // Fleischkaese 0.62, Birne 0.63) werden bewusst zum Vorschlag — sie
  // bekommen ihr Datum aus der Kategorie und kosten ein Antippen. Das ist
  // der guenstigere Fehler.
  const richtig: readonly [string, string][] = [
    ["Erdbeeren", "Erdbeeren"],
    ["Bio Peperoni", "Peperoni"],
    ["Bio Emmentaler mild", "Emmentaler"],
    ["Zwiebeln rot", "Zwiebeln"],
    ["Valflora Halbrahm", "Halbrahm"],
  ];

  for (const [zeile, erwartet] of richtig) {
    it(`uebernimmt "${zeile}" als ${erwartet}`, () => {
      const a = assignLine({ rawText: zeile, candidates: kandidaten });
      expect(a.accepted).toBe(true);
      expect(nameOf(productIdOf(a))).toBe(erwartet);
    });
  }

  it("die knapp darunter bleiben Vorschlaege, verlieren aber ihr Produkt nicht", () => {
    for (const zeile of [
      "Aargauer Eier 53g+",
      "Deli-Fleischk.100G",
      "Bio Birnen Williams",
    ]) {
      const a = assignLine({ rawText: zeile, candidates: kandidaten });
      expect(a.accepted).toBe(false);
      expect(productIdOf(a)).not.toBeNull();
    }
  });
});
