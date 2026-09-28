/**
 * Plausibilitaetspruefung fuer geschaetzte Haltbarkeiten.
 *
 * Eine erzwungene Ausgabeform garantiert, dass Zahlen ankommen — nicht,
 * dass sie sinnvoll sind. Diese Pruefung steht zwischen der Schaetzung und
 * dem Katalog: Was sie ablehnt, wird nicht zurueckgeschrieben und warnt
 * folglich auch nie jemanden falsch.
 *
 * Rein, ohne Netz und Datenbank, damit sie ohne laufende Infrastruktur
 * pruefbar ist (Konzept 7.1).
 */

/** Obergrenze wie in der Datenbank: shelf_life_rules_days_unopened_range. */
export const MAX_SHELF_LIFE_DAYS = 3650;

/**
 * Unterhalb dieser Sicherheit wird nicht in den Katalog geschrieben.
 *
 * Der Wert landet global und gilt danach fuer alle Haushalte. Eine
 * unsichere Schaetzung dort abzulegen waere schlimmer als gar keine: Sie
 * verdraengt spaeter die Kategorieregel, die wenigstens auf Erfahrung
 * beruht.
 */
export const MIN_ESTIMATE_CONFIDENCE = 0.5;

export interface ShelfLifeEstimateShape {
  readonly daysUnopened: number;
  readonly daysOpened: number | null;
  readonly confidence: number;
}

function isWholeDayCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_SHELF_LIFE_DAYS
  );
}

/**
 * Ist die Schaetzung brauchbar genug, um sie zu verwenden und zu speichern?
 *
 * Geprueft wird:
 * - `daysUnopened` ist eine ganze Zahl zwischen 1 und der Obergrenze.
 *   Null Tage waere keine Haltbarkeit, sondern ein Fehler.
 * - `daysOpened` ist entweder null oder ebenfalls gueltig — und nie
 *   groesser als `daysUnopened`. Geoeffnet haelt nichts laenger als
 *   ungeoeffnet; eine solche Antwort ist ein Zeichen dafuer, dass das
 *   Modell die Frage missverstanden hat.
 * - `confidence` liegt zwischen 0 und 1 und erreicht die Mindestgrenze.
 */
export function isPlausibleEstimate(
  value: ShelfLifeEstimateShape | null | undefined,
): value is ShelfLifeEstimateShape {
  if (!value || typeof value !== "object") return false;

  if (!isWholeDayCount(value.daysUnopened)) return false;

  if (value.daysOpened !== null) {
    if (!isWholeDayCount(value.daysOpened)) return false;
    if (value.daysOpened > value.daysUnopened) return false;
  }

  const c = value.confidence;
  if (typeof c !== "number" || !Number.isFinite(c)) return false;
  if (c < 0 || c > 1) return false;

  return c >= MIN_ESTIMATE_CONFIDENCE;
}
