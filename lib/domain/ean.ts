/**
 * Prueft und deutet Strichcode-Nummern.
 *
 * ======================================================================
 * WARUM DAS VOR JEDER ABFRAGE STEHT
 * ======================================================================
 * Ein gescannter Code ist zuerst nur eine Ziffernfolge. Zwei Dinge lassen
 * sich daran OHNE Netzzugriff ablesen, und beide ersparen dem Nutzer eine
 * Enttaeuschung:
 *
 * 1. Ob die Ziffernfolge ueberhaupt gueltig ist. Jeder EAN traegt eine
 *    Pruefziffer. Stimmt sie nicht, hat die Kamera sich verlesen — dann
 *    ist ein erneuter Scan die richtige Antwort, nicht eine Abfrage, die
 *    mit "nicht gefunden" zurueckkommt.
 *
 * 2. Ob die Nummer ueberhaupt global vergeben ist. Die GS1-Praefixe
 *    02, 04 und 20 bis 29 sind fuer "restricted circulation" reserviert —
 *    ladeninterne Nummern, die eine Waage im Laden selbst druckt. Sie
 *    gelten NUR in dem Geschaeft, das sie gedruckt hat, und stehen
 *    deshalb per Definition in keiner globalen Datenbank.
 *
 * Genau diese Etiketten tragen die Frischware: Rueebli, Aepfel, Fleisch
 * von der Theke, Kaese am Stueck. Also ausgerechnet das, was am ehesten
 * verdirbt. Eine Abfrage dagegen MUSS scheitern — sie zu unterlassen ist
 * kein Komfort, sondern Ehrlichkeit: Die App sagt sofort, dass sie hier
 * nicht weiterhelfen kann, statt zwei Sekunden zu laden und dann dasselbe.
 *
 * Die genauen Bereiche sind der GS1 General Specification entnommen.
 * Sollte eine Ueberpruefung andere Grenzen ergeben, aendert sich nur die
 * Tabelle unten — die Tests zeigen dann sofort, was davon betroffen ist.
 */

/** Laengen, die im Handel vorkommen: EAN-8, UPC-A, EAN-13, GTIN-14. */
const GUELTIGE_LAENGEN = new Set([8, 12, 13, 14]);

export type EanKind =
  /** Global vergeben — eine Abfrage kann etwas finden. */
  | "global"
  /** Ladenintern (Waagenetikett). Loest in keiner Datenbank auf. */
  | "restricted"
  /** Buch, Zeitschrift, Gutschein — kein Lebensmittel. */
  | "non-food"
  /** Pruefziffer stimmt nicht — die Kamera hat sich verlesen. */
  | "invalid";

/**
 * Entfernt alles, was keine Ziffer ist.
 *
 * Scanner und Menschen liefern Codes mit Leerzeichen und Bindestrichen;
 * manche Bibliotheken haengen ausserdem Steuerzeichen an.
 */
export function normalizeEan(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : "";
}

/**
 * Berechnet die Pruefziffer nach dem GS1-Verfahren.
 *
 * Von rechts nach links, die Stellen abwechselnd mit 3 und 1 gewichtet,
 * beginnend bei 3 direkt links der Pruefziffer. Dasselbe Verfahren gilt
 * fuer EAN-8, UPC-A, EAN-13 und GTIN-14 — nur die Laenge unterscheidet
 * sich, weshalb hier keine Fallunterscheidung noetig ist.
 */
export function eanCheckDigit(digitsWithoutCheck: string): number | null {
  if (!/^\d+$/.test(digitsWithoutCheck)) return null;

  let summe = 0;
  for (let i = digitsWithoutCheck.length - 1, gewicht = 3; i >= 0; i--) {
    summe += Number(digitsWithoutCheck[i]) * gewicht;
    gewicht = gewicht === 3 ? 1 : 3;
  }
  return (10 - (summe % 10)) % 10;
}

export function isValidEan(raw: string | null | undefined): boolean {
  const code = normalizeEan(raw);
  if (!GUELTIGE_LAENGEN.has(code.length)) return false;

  const erwartet = eanCheckDigit(code.slice(0, -1));
  return erwartet !== null && erwartet === Number(code.slice(-1));
}

/**
 * Praefixbereiche, die GS1 fuer eingeschraenkte Verwendung reserviert.
 *
 * Sie werden NICHT zentral vergeben: Jeder Laden darf sie selbst benutzen.
 * Deshalb kann dieselbe Nummer bei Migros und bei Coop etwas voellig
 * anderes bedeuten — und deshalb gibt es keine Datenbank, die sie aufloest.
 */
const EINGESCHRAENKTE_BEREICHE: readonly (readonly [number, number])[] = [
  [20, 29], // Waagenetiketten im Laden, der haeufigste Fall
  [2, 2], // "02", innerbetrieblich
  [4, 4], // "04", innerbetrieblich
];

/**
 * Trifft der Code eine ladeninterne Nummer?
 *
 * Geprueft werden die ersten beiden Ziffern eines EAN-13. Kuerzere Codes
 * (EAN-8) tragen keinen solchen Bereich in derselben Form und gelten hier
 * als global — ein Fehlurteil waere dort eine ueberfluessige Abfrage, nicht
 * eine verpasste.
 */
export function isRestrictedCirculation(
  raw: string | null | undefined,
): boolean {
  const code = normalizeEan(raw);
  if (code.length < 13) return false;

  const praefix = Number(code.slice(0, 2));
  return EINGESCHRAENKTE_BEREICHE.some(
    ([von, bis]) => praefix >= von && praefix <= bis,
  );
}

/**
 * Praefixe, hinter denen nie ein Lebensmittel steckt.
 *
 * Wer am Regal versehentlich ein Buch oder einen Gutschein scannt, soll
 * das sofort gesagt bekommen — und nicht zwei Sekunden auf eine Abfrage
 * warten, die in einer Lebensmitteldatenbank nichts finden kann.
 */
const NICHT_LEBENSMITTEL: readonly (readonly [number, number])[] = [
  [977, 977], // ISSN, Zeitschriften
  [978, 979], // ISBN, Buecher und Musikalien
  [980, 980], // Rueckerstattungsbelege
  [981, 984], // Gutscheine
  [990, 999], // Gutscheine
  [950, 952], // GS1 global office, keine Handelsware
];

function istNichtLebensmittel(code: string): boolean {
  if (code.length < 13) return false;
  const praefix = Number(code.slice(0, 3));
  return NICHT_LEBENSMITTEL.some(
    ([von, bis]) => praefix >= von && praefix <= bis,
  );
}

/**
 * Was ist das fuer ein Code — und lohnt sich eine Abfrage?
 *
 * Reihenfolge mit Grund: Erst die Pruefziffer, denn ein verlesener Code
 * koennte zufaellig wie ein Waagenetikett aussehen. Ein "nochmal scannen"
 * ist die bessere Antwort als "hier kann ich nicht helfen".
 */
export function classifyEan(raw: string | null | undefined): EanKind {
  if (!isValidEan(raw)) return "invalid";

  const code = normalizeEan(raw);
  if (isRestrictedCirculation(code)) return "restricted";
  if (istNichtLebensmittel(code)) return "non-food";
  return "global";
}

/**
 * Das Laenderpraefix, soweit es sich ablesen laesst.
 *
 * Nur zur Anzeige und zum Verstehen gedacht, NICHT als Herkunftsangabe:
 * Das Praefix nennt die GS1-Organisation, bei der die Nummer registriert
 * wurde, nicht das Herstellungsland. Ein Produkt mit 76 ist bei GS1
 * Schweiz angemeldet und kann trotzdem anderswo produziert sein.
 */
export function eanRegistry(raw: string | null | undefined): string | null {
  const code = normalizeEan(raw);
  if (code.length < 13) return null;

  const praefix = Number(code.slice(0, 3));
  if (praefix >= 760 && praefix <= 769) return "Schweiz und Liechtenstein";
  if (praefix >= 400 && praefix <= 440) return "Deutschland";
  if (praefix >= 300 && praefix <= 379) return "Frankreich";
  if (praefix >= 800 && praefix <= 839) return "Italien";
  if (praefix >= 500 && praefix <= 509) return "Vereinigtes Königreich";
  if (praefix >= 0 && praefix <= 139) return "USA und Kanada";
  return null;
}
