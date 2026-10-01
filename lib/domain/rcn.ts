import { isRestrictedCirculation, isValidEan, normalizeEan } from "./ean";

/**
 * Zerlegt ein ladeninternes Waagenetikett.
 *
 * ======================================================================
 * WARUM DAS DIE HAELFTE RETTET, DIE DER SCANNER SONST VERFEHLT
 * ======================================================================
 * Waagenetiketten (GS1-Praefix 20 bis 29) loesen in keiner globalen
 * Datenbank auf. Das schien zunaechst das Ende: Genau diese Etiketten
 * tragen die Frischware von der Theke — Kaese am Stueck, Fleisch, Rueebli —
 * also ausgerechnet das, was am ehesten verdirbt.
 *
 * Sie sind aber nicht wertlos. Ein frisch gewogenes Stueck desselben Kaeses
 * ergibt jedes Mal einen ANDEREN Vollcode, weil der Preis mit eingedruckt
 * ist. Der vordere Teil bleibt dagegen gleich: Er bezeichnet den Artikel.
 *
 *   2110103 | 00450 | 3
 *   ^Artikel  ^Preis  ^Pruefziffer
 *   Gruyère    4.50
 *
 * Damit ist der vordere Teil ein brauchbarer LERNSCHLUESSEL: Einmal
 * zugeordnet trifft jedes weitere Stueck desselben Kaeses, obwohl der
 * Vollcode nie derselbe ist. Und der eingedruckte Preis ist ein Geschenk
 * fuer die Weggeworfen-Auswertung in Franken (Konzept, Stufe 4).
 *
 * ======================================================================
 * WAS DARAN EINE ANNAHME IST — UND WAS DARAUS FOLGT
 * ======================================================================
 * GS1 reserviert den Bereich 20 bis 29 und ueberlaesst die innere Struktur
 * ausdruecklich dem HAENDLER. Die Aufteilung unten ist also eine im
 * europaeischen Handel verbreitete Konvention, KEIN Standard. Belegt ist
 * sie an je einem Migros- und einem Coop-Etikett — zwei Beispiele.
 *
 * Daraus folgen drei Vorsichtsmassnahmen, alle absichtlich:
 *
 *  1. Die Laenge steht als benannte Konstante, nicht als Zahl im Code.
 *     Ergibt eine Messung an mehr Etiketten eine andere Aufteilung, ist es
 *     eine Zeile.
 *  2. Ein gelernter Treffer ueber den Artikelschluessel wird NIE
 *     automatisch uebernommen, sondern nur vorgeschlagen. Ob sich die
 *     Schluessel zweier Haendler ueberschneiden koennen, ist nicht belegt.
 *  3. Der abgeleitete Preis ist ein VORSCHLAG. Eine falsche Zahl wuerde
 *     sonst still in die Auswertung wandern und sie entwerten.
 */

/**
 * Wie viele Stellen am Anfang den Artikel bezeichnen, Praefix eingerechnet.
 *
 * Das Praefix bleibt bewusst Teil des Schluessels: Es unterscheidet die
 * Haendler und macht eine Ueberschneidung unwahrscheinlicher.
 */
export const RCN_ITEM_KEY_LENGTH = 7;

/** Wie viele Stellen danach den Preis in Rappen tragen. */
export const RCN_PRICE_LENGTH = 5;

/** Oberhalb dessen ist der abgeleitete Preis unglaubwuerdig. */
export const RCN_MAX_PLAUSIBLE_CHF = 500;

export interface RcnParts {
  /** Der volle Code, normalisiert. */
  readonly code: string;
  /**
   * Die stabile Artikelreferenz — der Lernschluessel. Jedes weitere Stueck
   * desselben Artikels traegt denselben.
   */
  readonly itemKey: string;
  /**
   * Der eingedruckte Preis in Franken, wenn er plausibel ist. `null`
   * bedeutet: Die Stellen ergaben keinen glaubwuerdigen Betrag, also wird
   * nichts behauptet.
   */
  readonly priceChf: number | null;
}

/**
 * Zerlegt ein Waagenetikett, oder gibt `null` zurueck.
 *
 * `null` heisst: kein gueltiges Waagenetikett mit 13 Stellen. Kuerzere
 * eingeschraenkte Codes kommen vor, tragen aber keinen Preis in dieser
 * Form — dort waere jede Zerlegung geraten.
 */
export function parseRcn(raw: string | null | undefined): RcnParts | null {
  const code = normalizeEan(raw);

  if (code.length !== 13) return null;
  if (!isValidEan(code)) return null;
  if (!isRestrictedCirculation(code)) return null;

  const itemKey = code.slice(0, RCN_ITEM_KEY_LENGTH);
  const rappen = Number(
    code.slice(RCN_ITEM_KEY_LENGTH, RCN_ITEM_KEY_LENGTH + RCN_PRICE_LENGTH),
  );

  const franken = Number.isFinite(rappen) ? rappen / 100 : NaN;
  const plausibel =
    Number.isFinite(franken) && franken > 0 && franken <= RCN_MAX_PLAUSIBLE_CHF;

  return {
    code,
    itemKey,
    priceChf: plausibel ? Math.round(franken * 100) / 100 : null,
  };
}

/**
 * Der Schluessel, unter dem ein Code gelernt wird.
 *
 * Bei einem Waagenetikett der Artikelteil, sonst der ganze Code. Damit
 * braucht die Zuordnungstabelle keine Fallunterscheidung — sie speichert
 * immer das Ergebnis dieser Funktion.
 */
export function learningKey(raw: string | null | undefined): string | null {
  const rcn = parseRcn(raw);
  if (rcn) return rcn.itemKey;

  const code = normalizeEan(raw);
  return isValidEan(code) ? code : null;
}
