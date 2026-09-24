/**
 * `normalizeName` — the quiet key function of the whole project.
 *
 * It decides whether "M-CLASSIC VOLLMILCH 1L" from a receipt, "Vollmilch" from
 * the shopping list and the catalogue entry behind a scanned barcode are
 * recognised as the same product. If it fails, the catalogue fragments into
 * duplicates, the shelf life rules stop matching and the double-purchase
 * warning goes silent.
 *
 * The pipeline, in this order (order matters, see the comments):
 *
 *   1. NFC + lower case                — "ÄPFEL" → "äpfel"
 *   2. unify apostrophes and dashes    — "Anna’s" → "Anna's"
 *   3. German umlauts and sharp s      — "äpfel" → "aepfel", "weiß" → "weiss"
 *   4. fold double transliterations    — "rüebli" → "rueebli" → "ruebli"
 *   5. strip remaining diacritics      — "qualité" → "qualite"
 *   6. remove quantities               — "1.5l", "2x200ml", "6er-Pack"
 *   7. punctuation → space             — "m-classic" → "m classic"
 *   8. remove brand and marketing noise
 *   9. narrow plural handling          — "bananen" → "banane"
 *  10. collapse whitespace
 *
 * Deliberate non-goals:
 *
 * - **No stemming.** "Banane" must stay "banane", not become "banan". The only
 *   morphological step is the narrow trailing-"n" rule in step 9, which removes
 *   exactly one character and only from a token of at least six.
 * - **No word list beyond the brands named in the concept.** Removing more
 *   words ("Fine Food", "Sélection", …) is easy to add later via the exported
 *   constants, but every extra word is a chance to destroy a real product name.
 */

/** Multi-word brand and marketing phrases, in normalized (space separated) form. */
export const BRAND_NOISE_PHRASES: readonly string[] = [
  "prix garantie",
  "prixgarantie",
  "qualite prix", // from "Qualité & Prix" — the "&" has become a space by now
  "m classic",
  "mclassic",
  "m budget",
  "mbudget",
  "annas best",
  "anna best",
];

/** Single-word brand and marketing noise. Only ever removed as a whole token. */
export const BRAND_NOISE_TOKENS: readonly string[] = [
  "naturaplan",
  "naturafarm",
  "bio",
  "aktion",
  "coop",
  "migros",
  "denner",
  "aldi",
  "lidl",
];

/** Umlauts and sharp s. Applied before generic diacritic stripping so that
 *  "ä" becomes "ae" rather than "a". */
const GERMAN_LETTERS: readonly (readonly [RegExp, string])[] = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
  // Capital sharp s survives toLowerCase() in some engines; map it too.
  [/ẞ/g, "ss"],
];

/**
 * Folds a transliterated umlaut that is *followed* by a real "e" back onto the
 * plain digraph: "rüebli" → "rueebli" → "ruebli".
 *
 * This is the Swiss-German case, and it is not cosmetic. Receipts and
 * hand-typed list entries spell the same word three ways — "Rüebli", "Rueebli"
 * and "Ruebli", "Müesli" and "Muesli" — because tills print without umlauts and
 * people type without them. Expanding "ü" to "ue" turns the first spelling into
 * "rueebli" and leaves the ASCII one at "ruebli", so the two would never meet,
 * which is exactly the catalogue fragmentation the concept warns about.
 *
 * The rule is deliberately narrow: only the sequences that a double
 * transliteration can produce (`aee`, `oee`, `uee`). Ordinary German words with
 * a double "e" — Kaffee, Tee, Idee, Beeren, Allee, Schnee — do not contain them
 * and are untouched, because their "ee" never follows an a/o/u.
 */
const DOUBLE_TRANSLITERATION: readonly (readonly [RegExp, string])[] = [
  [/aee/g, "ae"],
  [/oee/g, "oe"],
  [/uee/g, "ue"],
];

/**
 * Quantities. Must run while the punctuation is still there, otherwise
 * "1.5l" would already have fallen apart into "1" and "5l".
 *
 * Shape: <number>[<decimal>] [x <number>] [unit] [pack]
 *  - the lookbehind stops us from eating the "12" in "Vitamin B12"
 *  - the lookahead stops "1g" from matching inside a longer word
 *  - "er" covers the Swiss "6er", "12er-Pack"
 */
const QUANTITY =
  /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:[x×]\s*\d+(?:[.,]\d+)?\s*)*(?:kilogramm|kilo|gramm|liter|stueck|stuck|stk|pcs|pce|kg|mg|gr|dl|cl|ml|ltr|lt|st|pc|er|g|l|x)(?:[\s-]*(?:packung|pack|beutel|stueck|stk))?(?![\p{L}])/giu;

/** Apostrophe-like characters. Deleted, not replaced — "Anna's" → "annas". */
const APOSTROPHES = /['‘’ʼ`´]/g;

/** Dash-like characters (U+2010…U+2015, U+2212), unified to a plain "-". */
const DASHES = /[‐-―−]/g;

/** Combining marks left over after NFD, e.g. the accent in "é". */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Everything that is not a letter or a digit becomes a word separator. */
const NON_WORD = /[^\p{L}\p{N}]+/gu;

const PHRASE_PATTERNS: readonly RegExp[] = BRAND_NOISE_PHRASES.map(
  (phrase) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, "gu"),
);

const NOISE_TOKENS = new Set(BRAND_NOISE_TOKENS);

/** Shortest token the plural rule is allowed to touch. */
const MIN_PLURAL_LENGTH = 6;

/** A trailing "n" after "e" or "l" — "bananen", "kartoffeln". */
const PLURAL_N = /(?:e|l)n$/;

/**
 * The single morphological rule: a token of at least six characters that ends
 * in "-en" or "-ln" loses the final "n".
 *
 * "bananen" → "banane", "tomaten" → "tomate", "gurken" → "gurke",
 * "kartoffeln" → "kartoffel", "zwiebeln" → "zwiebel", "nudeln" → "nudel".
 *
 * This is **not** stemming. It removes exactly one character in exactly one
 * position; "banane" stays "banane" and never becomes "banan".
 *
 * The length floor is what makes the rule safe. It protects the short words
 * that merely happen to end this way — "essen", "hafen", "leben", "korn",
 * "eiern", "koeln" are all below it and stay untouched. Longer false positives
 * do survive ("kuchen" becomes "kuche"), but that is harmless: the function is
 * applied to *both* sides of every comparison, so a consistent artefact still
 * compares equal. What would be harmful is losing a real distinction, and
 * dropping this one "n" merges no two different foods we know of.
 *
 * "-rn" is deliberately left out. Its only common food plural is "Eiern",
 * which is below the length floor anyway, so including it would add risk
 * without buying a single real match.
 */
function singularize(token: string): string {
  if (token.length >= MIN_PLURAL_LENGTH && PLURAL_N.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * Normalizes a product name for comparison.
 *
 * Returns a lower case, space separated string of letters and digits. Never
 * throws; non-string input yields `''`.
 *
 * Safety net: if brand removal would empty the name completely — the whole
 * input was "M-Budget" or "Bio" — the pre-removal form is returned instead.
 * A brand name is a worse identifier than a real product name, but it is a far
 * better one than the empty string, which would collapse every such entry into
 * the same catalogue row. This also keeps the function idempotent.
 */
export function normalizeName(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) return "";

  // 1–2: unicode form, case, apostrophes, dashes
  let text = raw.normalize("NFC").toLowerCase();
  text = text.replace(APOSTROPHES, "").replace(DASHES, "-");

  // 3: German letters before generic diacritic stripping
  for (const [pattern, replacement] of GERMAN_LETTERS) {
    text = text.replace(pattern, replacement);
  }

  // 4: "rueebli" → "ruebli", so the umlaut and the ASCII spelling meet
  for (const [pattern, replacement] of DOUBLE_TRANSLITERATION) {
    text = text.replace(pattern, replacement);
  }

  // 5: remaining diacritics ("é" → "e", "à" → "a")
  text = text.normalize("NFD").replace(COMBINING_MARKS, "").normalize("NFC");

  // 6: quantities, while punctuation is still intact
  text = text.replace(QUANTITY, " ");

  // 7: punctuation → space, collapse
  text = text.replace(NON_WORD, " ").trim().replace(/\s+/g, " ");

  const beforeBrandRemoval = text;
  if (text.length === 0) return "";

  // 8a: multi-word phrases first, so "m classic" goes before the token pass
  for (const pattern of PHRASE_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  // 8b + 9: single-word noise and the plural rule, in one token pass
  const tokens = text
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token))
    .map(singularize);

  const result = tokens.join(" ");

  // Safety net (see doc comment)
  if (result.length === 0) {
    return beforeBrandRemoval.split(/\s+/).map(singularize).join(" ");
  }

  return result;
}
