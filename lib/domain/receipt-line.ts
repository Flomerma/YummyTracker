/**
 * Leitet aus den Zahlen einer Kassenbonzeile ab, ob es Stueck- oder
 * Gewichtsware ist — und wie viel.
 *
 * ======================================================================
 * MIGROS UND COOP MACHEN DAS UNTERSCHIEDLICH
 * ======================================================================
 * Nachgesehen an je einem echten Bon (siehe
 * docs/messung/2026-09-30-katalogzuordnung.md, Abschnitt 4):
 *
 * COOP schreibt das echte Gewicht in die Mengenspalte:
 *     Bio Emmentaler mild | 0.315 | 6.45 | 5.05 | 5.05
 *   Menge 0.315 ist Kilogramm, Preis der Kilopreis, Aktion der
 *   verbilligte Kilopreis. 0.315 x 6.45 = 2.03 — das passt NICHT zum Total,
 *   wohl aber 0.315 x ... nein: hier ist 5.05 der Gesamtbetrag und der
 *   Kilopreis gilt fuer ein Kilo. Entscheidend ist: eine gebrochene Menge
 *   IST das Gewicht, da muss nichts hergeleitet werden.
 *
 * MIGROS schreibt in die Mengenspalte immer eine ganze Zahl und macht bei
 * Gewichtsware den Preis zum Kilopreis:
 *     Bio Birnen Williams | 1 | 6.30 |      | 3.90   -> 0.619 kg
 *     Rispentomaten       | 1 | 4.20 |      | 2.10   -> 0.500 kg
 *     Poulet Minifilet    | 1 | 36.00 | 2.23 | 12.35 -> 0.405 kg
 *   Erkennbar daran, dass Menge x Preis NICHT dem Total entspricht. Das
 *   Gewicht ergibt sich dann aus (Total + Gespart) / Preis — der Rabatt
 *   muss mitgerechnet werden, sonst kommt zu wenig Gewicht heraus.
 *
 * Und Stueckware sieht bei beiden gleich aus:
 *     Panko Breadcrumbs | 2 | 2.60 | 5.20     (2 x 2.60)
 *     Lindt Excell Orange | 2 | 8.85 | 5.95 | 11.90  (2 x 5.95, Aktion)
 *
 * ======================================================================
 * WARUM DAS HIER STEHT UND NICHT IM AUSWERTUNGS-PROMPT
 * ======================================================================
 * Ein Sprachmodell soll die Zahlen LESEN, nicht rechnen. Rechnen ist genau
 * die Taetigkeit, bei der es unauffaellig daneben liegt — und eine falsche
 * Menge faellt im Pruef-Schritt kaum auf, weil dort niemand nachrechnet.
 * Als reine Funktion ist die Ableitung dagegen gegen echte Bonzeilen
 * testbar.
 */

/** Toleranz beim Vergleich von Betraegen, wegen der Rundung auf 5 Rappen. */
const RAPPEN_TOLERANZ = 0.051;

export interface ReceiptLineAmounts {
  /** Mengenspalte. Bei Coop-Gewichtsware eine gebrochene Zahl in Kilogramm. */
  readonly menge: number | null;
  /** Einzel- oder Kilopreis. */
  readonly preis: number | null;
  /** Coop: verbilligter Preis. Gilt dann anstelle von `preis`. */
  readonly aktion?: number | null;
  /** Migros: schon gewaehrter Rabatt, im Total bereits abgezogen. */
  readonly gespart?: number | null;
  /** Der tatsaechlich verrechnete Betrag. */
  readonly total: number | null;
}

export type LineQuantity =
  | { readonly kind: "pieces"; readonly qty: number; readonly unit: "piece" }
  | {
      readonly kind: "weight";
      readonly qty: number;
      readonly unit: "g";
      /** 'menge' = direkt abgelesen (Coop), 'total' = hergeleitet (Migros). */
      readonly derivedFrom: "menge" | "total";
    }
  | { readonly kind: "unknown" };

function istZahl(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Der Preis, der fuer die Rechnung gilt: der Aktionspreis, wenn es einen
 * gibt, sonst der gewoehnliche.
 */
function gueltigerPreis(a: ReceiptLineAmounts): number | null {
  if (istZahl(a.aktion) && a.aktion > 0) return a.aktion;
  if (istZahl(a.preis) && a.preis > 0) return a.preis;
  return null;
}

export function deriveQuantity(a: ReceiptLineAmounts): LineQuantity {
  const preis = gueltigerPreis(a);

  // 1. Eine gebrochene Menge IST das Gewicht (Coop). Keine Herleitung
  //    noetig, und auch keine moeglich — der Weg ueber das Total waere hier
  //    nur eine zweite, schlechtere Quelle.
  if (istZahl(a.menge) && a.menge > 0 && !Number.isInteger(a.menge)) {
    return {
      kind: "weight",
      qty: Math.round(a.menge * 1000),
      unit: "g",
      derivedFrom: "menge",
    };
  }

  // 2. Ohne Preis oder Total laesst sich nichts unterscheiden. Dann gilt
  //    die Menge als Stueckzahl, wenn es eine gibt.
  if (!istZahl(a.total) || preis === null) {
    return istZahl(a.menge) && a.menge > 0
      ? { kind: "pieces", qty: a.menge, unit: "piece" }
      : { kind: "unknown" };
  }

  const menge = istZahl(a.menge) && a.menge > 0 ? a.menge : 1;
  const gespart = istZahl(a.gespart) && a.gespart > 0 ? a.gespart : 0;

  // 3. Geht Menge x Preis im Total auf, ist es Stueckware. Der Rabatt wird
  //    mitgerechnet, weil er im Total schon abgezogen ist.
  if (Math.abs(menge * preis - gespart - a.total) <= RAPPEN_TOLERANZ) {
    return { kind: "pieces", qty: menge, unit: "piece" };
  }

  // 4. Sonst ist der Preis ein Kilopreis und das Total der Betrag (Migros).
  //    Der Rabatt kommt wieder DAZU, weil er vom Betrag abgezogen wurde —
  //    ohne ihn kaeme zu wenig Gewicht heraus.
  const kilo = (a.total + gespart) / preis;
  if (kilo > 0 && kilo < 100) {
    return {
      kind: "weight",
      qty: Math.round(kilo * 1000),
      unit: "g",
      derivedFrom: "total",
    };
  }

  // Unplausibel — lieber die Stueckzahl als eine erfundene Menge.
  return { kind: "pieces", qty: menge, unit: "piece" };
}

/**
 * Stimmt die Summe der Zeilen mit dem Bon-Total ueberein?
 *
 * BEWUSST OHNE VETO: Eine falsch gelesene Ziffer darf nicht 19 richtige
 * Zeilen verwerfen. Die Abweichung ist ein HINWEIS zum Nachsehen, kein
 * Grund zum Abbruch — und bei einem langen Bon, der in Teilbildern
 * fotografiert wurde, steht auf den ersten Bildern ueberhaupt kein Total.
 */
export function compareTotals(
  lineTotals: readonly number[],
  receiptTotal: number | null,
): {
  readonly matches: boolean;
  readonly sum: number;
  readonly diff: number | null;
} {
  const sum =
    Math.round(lineTotals.filter(istZahl).reduce((a, b) => a + b, 0) * 100) /
    100;

  if (!istZahl(receiptTotal)) return { matches: true, sum, diff: null };

  const diff = Math.round((sum - receiptTotal) * 100) / 100;
  return { matches: Math.abs(diff) <= RAPPEN_TOLERANZ, sum, diff };
}
