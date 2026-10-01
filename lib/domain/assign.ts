import { matchProduct } from "./match-product";
import type { ProductCandidate } from "./types";

/**
 * Entscheidet, was eine erfasste Zeile wird: ein zugeordnetes Produkt, ein
 * Vorschlag, oder nur eine Kategorie.
 *
 * ======================================================================
 * WARUM ZWEI SCHWELLEN STATT EINER
 * ======================================================================
 * Gemessen an zwei echten Kassenbons (46 Zeilen, siehe
 * docs/messung/2026-09-30-katalogzuordnung.md): Von 23 Zuordnungen waren
 * SECHS falsch, und zwar schaedlich falsch. "Tafeln Milch 5x100g" ist
 * Schokolade und wurde mit 0.56 als "Milchdrink" eingestuft — das sind
 * sechs Tage Haltbarkeit statt einem Jahr. Nach zwei solchen Fehlwarnungen
 * glaubt niemand mehr der echten, und damit ist der Kern der Anwendung
 * entwertet.
 *
 * Die Schwelle von 0.30 aus `matchProduct` ist nicht falsch — sie ist
 * richtig fuer eine VORSCHLAGSLISTE, in der ein Mensch auswaehlt. Sie ist
 * falsch fuer eine automatische Uebernahme. Deshalb zwei:
 *
 *   >= 0.65   uebernehmen und vorhaken
 *   0.30-0.65 anzeigen, aber NICHT vorhaken — der Mensch entscheidet
 *   < 0.30    kein Produkt; es bleibt die Kategorie
 *
 * WOHER DIE 0.65 KOMMT. Die Messung trennt sauber: Alle sechs falschen
 * Zuordnungen lagen bei hoechstens 0.56, alle acht richtigen bei mindestens
 * 0.60. Jeder Wert dazwischen trennt die Stichprobe perfekt.
 *
 * Gewaehlt wurde trotzdem 0.65 und nicht 0.60, obwohl 0.60 drei richtige
 * Treffer mehr durchliesse (Eier 0.60, Fleischkaese 0.62, Birne 0.63):
 *
 *  - 46 Zeilen sind eine kleine Stichprobe. Ein Abstand von 0.04 zur
 *    naechsten Fehlzuordnung ist kein Abstand, sondern Zufall.
 *  - Die beiden Fehler sind nicht gleich teuer. Ein herabgestufter
 *    richtiger Treffer kostet EIN ANTIPPEN — die Zeile bekommt ihr Datum
 *    trotzdem, naemlich aus der Kategorie. Ein falscher uebernommener
 *    Treffer kostet eine Fehlwarnung, und die kostet Vertrauen.
 *
 * Der Wert gehoert nachgeschaerft, sobald mehr Bons gemessen sind. Deshalb
 * steht er hier als Konstante und nicht als Zahl im Code.
 *
 * ======================================================================
 * WARUM DIE KATEGORIE DER EIGENTLICHE ANKER IST
 * ======================================================================
 * Dieselbe Messung: 48 Prozent der Bonzeilen finden im Katalog ueberhaupt
 * keinen Kandidaten. Ein Katalog aus 273 Gattungsbegriffen kann "LINDT
 * NAPOLITAINS" nicht enthalten, und einer, der es koennte, waere ein
 * Produktverzeichnis mit Zehntausenden Eintraegen.
 *
 * Die Zuordnung auf eine der 27 KATEGORIEN ist dagegen leicht und
 * zuverlaessig — und sie genuegt fuer den Zweck: Das Auffangnetz aus 46
 * Kategorieregeln liefert eine Haltbarkeit (Konzept 4.3). Deshalb ist
 * `kind: 'category'` kein Fehlerfall, sondern ein vollwertiges Ergebnis.
 */

/** Ab hier wird eine Zuordnung uebernommen und vorangehakt. */
export const ASSIGN_ACCEPT_THRESHOLD = 0.65;

/** Ab hier wird sie immerhin angezeigt. Entspricht MATCH_CONFIDENCE_FLOOR. */
export const ASSIGN_SUGGEST_THRESHOLD = 0.3;

export interface AssignCandidate extends ProductCandidate {
  /** Die Kategorie des Produkts; null wenn es keiner zugeordnet ist. */
  readonly categoryId: string | null;
}

export type Assignment =
  /** Sicher zugeordnet. Wird im Pruef-Schritt vorangehakt. */
  | {
      readonly kind: "product";
      readonly productId: string;
      readonly confidence: number;
      readonly categoryId: string | null;
      readonly accepted: true;
    }
  /** Plausibel, aber nicht sicher. Wird angezeigt, nicht vorangehakt. */
  | {
      readonly kind: "suggestion";
      readonly productId: string;
      readonly confidence: number;
      readonly categoryId: string | null;
      readonly accepted: false;
      /** Warum es nur ein Vorschlag ist — fuer die Anzeige. */
      readonly reason: "low_confidence" | "category_conflict";
    }
  /** Kein Produkt, aber eine Kategorie — und die reicht fuer die Haltbarkeit. */
  | {
      readonly kind: "category";
      readonly categoryId: string;
      readonly accepted: false;
    }
  /** Nichts bekannt. Der Nutzer muss helfen. */
  | { readonly kind: "unknown"; readonly accepted: false };

export interface AssignInput {
  readonly rawText: string;
  readonly candidates: readonly AssignCandidate[];
  /**
   * Kategorie-Hinweis von aussen — beim Bon vom Sprachmodell, das die ganze
   * Zeile im Zusammenhang gelesen hat. `null` wenn keiner vorliegt.
   */
  readonly categoryHint?: string | null;
}

/**
 * Was gilt, wenn ein Produkt sicher passt, der Hinweis aber widerspricht?
 *
 * Der Hinweis gewinnt — aber er loescht das Produkt nicht, er stuft es zum
 * Vorschlag herab.
 *
 * Begruendung: Der Hinweis entsteht, indem die ganze Zeile im Zusammenhang
 * gelesen wird ("Tafeln Milch 5x100g" ist erkennbar Schokolade). Der
 * Treffer entsteht aus blosser Zeichenkettenaehnlichkeit, die den
 * Zusammenhang nicht kennt. Genau dieser Fall steht in der Messung, und
 * genau dort richtete die Zeichenkettenaehnlichkeit den Schaden an.
 *
 * Herabstufen statt verwerfen, weil der Hinweis selbst auch falsch sein
 * kann — dann sieht der Mensch beide Angaben und entscheidet.
 */
export function assignLine(input: AssignInput): Assignment {
  const hint = input.categoryHint?.trim() || null;
  const matches = matchProduct(input.rawText, input.candidates);
  const best = matches[0] ?? null;

  if (!best) {
    return hint
      ? { kind: "category", categoryId: hint, accepted: false }
      : { kind: "unknown", accepted: false };
  }

  const product = input.candidates.find((c) => c.id === best.productId) ?? null;
  const productCategory = product?.categoryId ?? null;

  if (best.confidence >= ASSIGN_ACCEPT_THRESHOLD) {
    // Widerspricht der Hinweis, zaehlt er mehr als die Aehnlichkeit — aber
    // das Produkt bleibt als Vorschlag sichtbar.
    if (hint && productCategory && hint !== productCategory) {
      return {
        kind: "suggestion",
        productId: best.productId,
        confidence: best.confidence,
        categoryId: hint,
        accepted: false,
        reason: "category_conflict",
      };
    }

    return {
      kind: "product",
      productId: best.productId,
      confidence: best.confidence,
      categoryId: productCategory ?? hint,
      accepted: true,
    };
  }

  // Unterhalb der Uebernahmeschwelle. Der Vorschlag bleibt sichtbar, aber
  // fuer die Haltbarkeit zaehlt der Hinweis, falls es einen gibt — sonst
  // waere die Milchschokolade wieder sechs Tage haltbar.
  return {
    kind: "suggestion",
    productId: best.productId,
    confidence: best.confidence,
    categoryId: hint ?? productCategory,
    accepted: false,
    reason: "low_confidence",
  };
}

/**
 * Die Kategorie, mit der die Haltbarkeit aufgeloest werden soll.
 *
 * Eigene Funktion, weil die Aufrufer sie aus jedem der vier Faelle
 * brauchen und `kind` dafuer jedes Mal auseinandernehmen muessten.
 */
export function categoryForShelfLife(assignment: Assignment): string | null {
  switch (assignment.kind) {
    case "product":
    case "suggestion":
      return assignment.categoryId;
    case "category":
      return assignment.categoryId;
    case "unknown":
      return null;
  }
}

/**
 * Das Produkt, auf das die Zeile zeigt — auch bei einem blossen Vorschlag.
 *
 * Die Zeile speichert die Produktkennung in beiden Faellen; `accepted`
 * entscheidet getrennt davon, ob sie vorangehakt ist. So bleibt der
 * Vorschlag nach einem Seitenwechsel erhalten.
 */
export function productIdOf(assignment: Assignment): string | null {
  return assignment.kind === "product" || assignment.kind === "suggestion"
    ? assignment.productId
    : null;
}
