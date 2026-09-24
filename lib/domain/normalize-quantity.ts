import type { Unit } from "./types";

/**
 * `normalizeQuantity` — folds every unit a receipt, a barcode database or a
 * human might produce into exactly three canonical units: `piece`, `g`, `ml`.
 *
 * Three units are enough for this application: it compares amounts and shows
 * them, it never converts between mass and volume. Keeping the set this small
 * means the duplicate check and the later recipe matching can compare two
 * amounts with `===` on the unit instead of a conversion table.
 *
 * Deliberate choices:
 *
 * - **Unknown units fall back to `piece`, keeping the amount.** "3 Bund
 *   Peterli" becomes `3 piece`. Throwing would push an error case into the
 *   fast intake path, and `0` would silently lose the count the user typed.
 *   `piece` is the honest reading of "three of something".
 * - **Results are rounded to six decimals.** `0.1 * 1000` is exact in IEEE 754
 *   here, but `0.07 * 100` is not, and a stray `6.999999999999999 ml` in the
 *   database would be embarrassing for no reason.
 */

export interface NormalizedQuantity {
  readonly qty: number;
  readonly unit: Unit;
}

/** Mass units, expressed as a factor to grams. */
export const MASS_TO_G: Readonly<Record<string, number>> = {
  kg: 1000,
  kilo: 1000,
  kilogramm: 1000,
  kilogram: 1000,
  g: 1,
  gr: 1,
  gramm: 1,
  gram: 1,
  grams: 1,
  mg: 0.001,
  milligramm: 0.001,
};

/** Volume units, expressed as a factor to millilitres. */
export const VOLUME_TO_ML: Readonly<Record<string, number>> = {
  l: 1000,
  lt: 1000,
  ltr: 1000,
  liter: 1000,
  litre: 1000,
  liters: 1000,
  dl: 100,
  deziliter: 100,
  cl: 10,
  zentiliter: 10,
  ml: 1,
  milliliter: 1,
  millilitre: 1,
};

/** Everything that means "a countable thing". */
export const PIECE_UNITS: ReadonlySet<string> = new Set([
  "piece",
  "pieces",
  "pc",
  "pcs",
  "pce",
  "stk",
  "stck",
  "stueck",
  "stuck",
  "st",
  "x",
  "er",
  "anzahl",
  "einheit",
  "einheiten",
  "pack",
  "packung",
  "bund",
  "portion",
  "portionen",
]);

/**
 * Cleans a unit string the same way `normalizeName` cleans a product name,
 * but without the brand and plural machinery: lower case, umlauts expanded,
 * everything that is not a letter removed ("Stk." → "stk", "ML" → "ml").
 */
function canonicalUnit(unit: string): string {
  if (typeof unit !== "string") return "";
  return unit
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

/** Kills float noise without forcing whole numbers (500 mg must stay 0.5 g). */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Converts an amount into the canonical unit system.
 *
 * - `kg` → `g`, `l`/`dl`/`cl` → `ml`, `mg` → `g`
 * - `Stk` / `Stück` / `Pcs` / `x` / `er` → `piece`
 * - anything unrecognised, empty or non-string → `piece`, amount unchanged
 * - a non-finite amount (`NaN`, `Infinity`) becomes `0`; the domain layer
 *   must never hand a `NaN` on to the database
 * - negative amounts pass through: a receipt correction line is a real thing
 */
export function normalizeQuantity(
  qty: number,
  unit: string,
): NormalizedQuantity {
  const amount = typeof qty === "number" && Number.isFinite(qty) ? qty : 0;
  const key = canonicalUnit(unit);

  const massFactor = Object.prototype.hasOwnProperty.call(MASS_TO_G, key)
    ? MASS_TO_G[key]
    : undefined;
  if (massFactor !== undefined) {
    return { qty: round(amount * massFactor), unit: "g" };
  }

  const volumeFactor = Object.prototype.hasOwnProperty.call(VOLUME_TO_ML, key)
    ? VOLUME_TO_ML[key]
    : undefined;
  if (volumeFactor !== undefined) {
    return { qty: round(amount * volumeFactor), unit: "ml" };
  }

  // PIECE_UNITS and every unknown unit land here. Listing the piece units
  // explicitly is still worth it as documentation of what we expect to see.
  return { qty: round(amount), unit: "piece" };
}
