/**
 * Zerlegt eine Sucheingabe in die Begriffe, mit denen der Katalog
 * durchsucht wird.
 *
 * ----------------------------------------------------------------------
 * WARUM ES DIESE FUNKTION GIBT
 * ----------------------------------------------------------------------
 * Die erste Fassung der Produktsuche suchte die GANZE normalisierte
 * Anfrage als Teilstring. Das klingt harmlos und ist es nicht: Der Katalog
 * fuehrt "Rindshackfleisch", der Bon schreibt "Hackfleisch Rind 500g".
 * Normalisiert wird daraus "hackfleisch rind" — und `%hackfleisch rind%`
 * trifft "rindshackfleisch" nicht, weil die Woerter in anderer Reihenfolge
 * stehen.
 *
 * Nachgemessen an 18 realistischen Bonzeilen: 10 davon fanden mit der
 * ganzen Anfrage KEINEN einzigen Kandidaten. Tokenweise gesucht blieben
 * 2 uebrig — und die beiden scheiterten nicht an der Suche, sondern daran,
 * dass die Produkte im Katalog fehlten.
 *
 * Diese Funktion baut also bewusst ein weites Netz. Die Rangfolge macht
 * danach `matchProduct` — dort ist sie getestet und begruendet. Eine Suche,
 * die zu wenig liefert, kann der beste Abgleich nicht retten; eine, die zu
 * viel liefert, schon.
 */

/**
 * Kuerzere Begriffe werden verworfen: "rot" oder "bio" treffen halbe
 * Kataloge und verwaessern nur. Ausnahme unten, falls sonst nichts bleibt.
 */
export const MIN_TERM_LENGTH = 3;

/**
 * Obergrenze, damit eine lange Bonzeile keine Abfrage mit zwanzig
 * ODER-Zweigen erzeugt. Sechs Begriffe decken jede realistische
 * Produktbezeichnung ab.
 */
export const MAX_TERMS = 6;

/**
 * Woerter, die in Produktnamen fast immer vorkommen und deshalb nichts
 * unterscheiden. Sie fliegen raus, solange etwas anderes uebrig bleibt.
 *
 * Bewusst KURZ gehalten: `normalizeName` entfernt bereits Handelsmarken
 * und Mengenangaben. Was hier steht, sind nur Fuellwoerter, die dort
 * absichtlich stehen bleiben, weil sie bei anderen Aufgaben (etwa dem
 * Abgleich zweier Bonzeilen) noch Bedeutung tragen.
 */
const STOP_TERMS: ReadonlySet<string> = new Set([
  "der",
  "die",
  "das",
  "und",
  "mit",
  "ohne",
  "lose",
  "stk",
  "stueck",
  "packung",
  "beutel",
]);

/**
 * Liefert die Suchbegriffe, absteigend nach Laenge.
 *
 * Die laengsten zuerst, weil sie am meisten unterscheiden: Bei
 * "hackfleisch rind" ist "hackfleisch" die tragende Angabe, "rind" die
 * Verfeinerung. Wird die Liste auf MAX_TERMS gekuerzt, faellt so das
 * Unwichtigste weg.
 *
 * Gibt eine leere Liste zurueck, wenn nichts Verwertbares uebrig bleibt —
 * die Aufrufer muessen diesen Fall behandeln, statt eine Abfrage ohne
 * Bedingung abzusetzen und den halben Katalog zu laden.
 */
export function searchTerms(normalizedQuery: string): string[] {
  const raw = (normalizedQuery ?? "").trim();
  if (raw.length === 0) return [];

  const tokens = raw.split(/\s+/).filter((t) => t.length > 0);

  const useful = tokens.filter(
    (t) => t.length >= MIN_TERM_LENGTH && !STOP_TERMS.has(t),
  );

  // Bleibt nichts uebrig, ist die Eingabe kurz ("ei", "tee") oder besteht
  // nur aus Fuellwoertern. Dann lieber der laengste vorhandene Token als
  // gar keine Suche.
  const chosen =
    useful.length > 0
      ? useful
      : tokens.length > 0
        ? [tokens.reduce((a, b) => (b.length > a.length ? b : a))]
        : [];

  const unique = Array.from(new Set(chosen));
  unique.sort((a, b) => b.length - a.length || a.localeCompare(b));

  return unique.slice(0, MAX_TERMS);
}

/**
 * Maskiert die Sonderzeichen von SQL-LIKE in einem Suchbegriff.
 *
 * Ohne das wird aus der Eingabe "100%" ein Muster, das auf alles passt,
 * und aus einem Unterstrich ein Platzhalter fuer ein beliebiges Zeichen.
 * Das ist hier kein Sicherheitsproblem — PostgREST uebergibt den Wert als
 * Parameter, nicht als Text in der Abfrage —, wohl aber ein Grund fuer
 * unerklaerliche Treffer.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/([\\%_])/g, "\\$1");
}
