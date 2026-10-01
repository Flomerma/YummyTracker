/**
 * Bildet die Kategorien von Open Food Facts auf unsere 27 ab.
 *
 * ======================================================================
 * WARUM DAS DIE HEIKELSTE STELLE DES SCANNERS IST
 * ======================================================================
 * Aus der Kategorie folgt die Haltbarkeit (Konzept 4.3, Auffangnetz aus 46
 * Kategorieregeln). Eine falsche Kategorie heisst also eine falsche
 * Haltbarkeit — genau der Schaden, den die Messung an echten Bons
 * dokumentiert hat: "Tafeln Milch" als Milchdrink eingestuft, sechs Tage
 * statt einem Jahr.
 *
 * Deshalb gilt hier durchgehend: LIEBER NICHTS ALS ETWAS FALSCHES.
 * `null` ist ein vollwertiges Ergebnis und bedeutet "frag den Menschen".
 *
 * ======================================================================
 * DREI EBENEN, UND WARUM ES NICHT MIT EINER GEHT
 * ======================================================================
 * Ein erster Versuch verglich nur Teilzeichenketten in fester Reihenfolge.
 * Der Test fand sofort den Bruch: `en:milk-chocolates` enthaelt "milk",
 * also wurde Milchschokolade zu Milch — derselbe Schaden wie in der
 * Messung, nur anders entstanden.
 *
 * Die naheliegende Korrektur — Suesswaren vor Milchprodukte — bricht den
 * Gegenfall: `en:chocolate-milks` ist ein Milchgetraenk und wuerde zur
 * Schokolade. Eine Reihenfolge allein kann das nicht loesen, weil beide
 * Begriffe in beiden Angaben vorkommen.
 *
 * Deshalb drei Ebenen, nach dem, was die Haltbarkeit tatsaechlich bestimmt:
 *
 *   1. ZUSTAND schlaegt alles. Ob etwas eingemacht, tiefgekuehlt oder
 *      getrocknet ist, bestimmt die Haltbarkeit staerker als die Zutat:
 *      `en:canned-vegetables` ist eine Konserve, keine Frischware.
 *
 *   2. ART schlaegt Zutat. In zusammengesetzten Begriffen steht die Art
 *      HINTEN: `milk-chocolates` ist Schokolade, `chocolate-milks` ist
 *      Milch. Verglichen wird deshalb das letzte Wort der Angabe.
 *
 *   3. Erst danach irgendein Vorkommen, fuer alles Uebrige.
 */

export type CategorySlug = string;

/**
 * Ebene 1 — der Zustand. Wird ueberall in der Angabe gesucht und schlaegt
 * jede Artangabe, weil er die Haltbarkeit um Groessenordnungen aendert.
 */
const ZUSTAND: readonly (readonly [string, CategorySlug])[] = [
  ["canned", "canned-jarred"],
  ["preserved", "canned-jarred"],
  ["pickled", "canned-jarred"],
  ["in-jar", "canned-jarred"],
  ["frozen", "frozen-food"],
  ["deep-frozen", "frozen-food"],
];

/**
 * Ebene 2 und 3 — die Art, von der genauesten zur allgemeinsten.
 *
 * Dieselbe Tabelle dient beiden Ebenen: erst wird sie gegen das LETZTE
 * Wort jeder Angabe geprueft, dann gegen die ganze Angabe. Dadurch gewinnt
 * `chocolates` in `milk-chocolates`, ohne dass `milk` seine eigenen Faelle
 * verliert.
 */
const ART: readonly (readonly [string, CategorySlug])[] = [
  // Milchprodukte
  ["yogurt", "yogurt-quark"],
  ["quark", "yogurt-quark"],
  ["fromage-blanc", "yogurt-quark"],
  ["hard-cheese", "hard-cheese"],
  ["semi-hard-cheese", "hard-cheese"],
  ["gruyere", "hard-cheese"],
  ["emmental", "hard-cheese"],
  ["soft-cheese", "soft-cheese"],
  ["fresh-cheese", "soft-cheese"],
  ["cream-cheese", "soft-cheese"],
  ["mozzarella", "soft-cheese"],
  ["cheese", "hard-cheese"], // Rueckfall: Hartkaese haelt laenger
  ["butter", "butter-fats"],
  ["margarine", "butter-fats"],
  ["cream", "milk-cream"],
  ["milk", "milk-cream"],
  ["dairie", "milk-cream"],

  ["egg", "eggs"],

  // Fleisch und Fisch
  ["sausage", "sausages-cold-cuts"],
  ["charcuterie", "sausages-cold-cuts"],
  ["ham", "sausages-cold-cuts"],
  ["salami", "sausages-cold-cuts"],
  ["cold-cut", "sausages-cold-cuts"],
  ["poultry", "fresh-meat"],
  ["chicken", "fresh-meat"],
  ["beef", "fresh-meat"],
  ["pork", "fresh-meat"],
  ["minced-meat", "fresh-meat"],
  ["meat", "fresh-meat"],
  ["seafood", "fish-seafood"],
  ["shrimp", "fish-seafood"],
  ["salmon", "fish-seafood"],
  ["fish", "fish-seafood"],

  // Frisches
  ["salad", "salad-herbs"],
  ["herb", "salad-herbs"],
  ["potato", "potatoes-root-vegetables"],
  ["onion", "potatoes-root-vegetables"],
  ["carrot", "potatoes-root-vegetables"],
  ["root-vegetable", "potatoes-root-vegetables"],
  ["fresh-vegetable", "fresh-vegetables"],
  ["fresh-fruit", "fresh-fruit"],

  // Backwaren und Trockenes
  ["bread", "bread-bakery"],
  ["bakery", "bread-bakery"],
  ["viennoiserie", "bread-bakery"],
  ["pasta", "pasta-rice-cereals"],
  ["rice", "pasta-rice-cereals"],
  ["cereal", "pasta-rice-cereals"],
  ["muesli", "pasta-rice-cereals"],
  ["legume", "pasta-rice-cereals"],
  ["flour", "flour-baking"],
  ["sugar", "flour-baking"],
  ["baking", "flour-baking"],

  // Aufstriche
  ["jam", "sweet-spreads"],
  ["honey", "sweet-spreads"],
  ["marmalade", "sweet-spreads"],
  ["hazelnut-spread", "sweet-spreads"],
  ["peanut-butter", "sweet-spreads"],

  // Suesses und Snacks
  ["chocolate", "sweets-snacks"],
  ["biscuit", "sweets-snacks"],
  ["candy", "sweets-snacks"],
  ["confectioner", "sweets-snacks"],
  ["crisp", "sweets-snacks"],
  ["snack", "sweets-snacks"],
  // "nut" waere zu gierig: es steckt in "coconut" und damit in
  // "coconut-milks". Deshalb nur die eindeutigen Formen.
  ["hazelnut", "sweets-snacks"],
  ["walnut", "sweets-snacks"],
  ["almond", "sweets-snacks"],
  ["nuts", "sweets-snacks"],

  // Vorrat
  ["olive-oil", "oils-vinegar"],
  ["vegetable-oil", "oils-vinegar"],
  ["vinegar", "oils-vinegar"],
  ["sauce", "sauces-condiments"],
  ["mustard", "sauces-condiments"],
  ["mayonnaise", "sauces-condiments"],
  ["ketchup", "sauces-condiments"],
  ["condiment", "sauces-condiments"],
  ["spice", "spices-broth"],
  ["bouillon", "spices-broth"],
  ["broth", "spices-broth"],

  // Getraenke
  ["coffee", "coffee-tea"],
  ["tea", "coffee-tea"],
  ["water", "beverages"],
  ["juice", "beverages"],
  ["soda", "beverages"],
  ["beer", "beverages"],
  ["wine", "beverages"],
  ["beverage", "beverages"],

  // Ganz allgemein, bewusst am Schluss
  ["vegetable", "fresh-vegetables"],
  ["fruit", "fresh-fruit"],
];

/** Entfernt das Sprachpraefix und vereinheitlicht die Schreibweise. */
function ohnePraefix(tag: string): string {
  return tag.toLowerCase().replace(/^[a-z]{2}:/, "");
}

/**
 * Das letzte Wort einer Angabe, ohne Mehrzahl-s.
 *
 * `milk-chocolates` ergibt `chocolate`. Das ist die ART, und sie bestimmt
 * die Haltbarkeit — nicht die Zutat davor.
 */
function kopfwort(tag: string): string {
  const letztes = ohnePraefix(tag).split("-").pop() ?? "";
  return letztes.endsWith("s") ? letztes.slice(0, -1) : letztes;
}

export function mapOffCategory(
  offTags: readonly string[] | null | undefined,
  knownSlugs?: readonly string[],
): CategorySlug | null {
  if (!Array.isArray(offTags) || offTags.length === 0) return null;

  const tags = offTags
    .filter((t): t is string => typeof t === "string")
    .map(ohnePraefix);
  if (tags.length === 0) return null;

  const erlaubt = knownSlugs ? new Set(knownSlugs) : null;
  const nimm = (slug: CategorySlug): CategorySlug | null =>
    erlaubt && !erlaubt.has(slug) ? null : slug;

  // Ebene 1: Zustand schlaegt alles.
  for (const [begriff, slug] of ZUSTAND) {
    if (tags.some((t) => t.includes(begriff))) {
      const treffer = nimm(slug);
      if (treffer) return treffer;
    }
  }

  // Ebene 2: Art. Einwortregeln muessen das KOPFWORT treffen, damit
  // "milk" nicht in "milk-chocolates" anschlaegt. Mehrwortregeln duerfen
  // irgendwo stecken — "fresh-cheese" hat das Kopfwort "cheese" und waere
  // sonst nie erreichbar, obwohl es die genauere Angabe ist.
  const koepfe = tags.map(kopfwort);
  for (const [begriff, slug] of ART) {
    const mehrwortig = begriff.includes("-");
    const passt = mehrwortig
      ? tags.some((t) => t.includes(begriff))
      : koepfe.some((k) => k === begriff);
    if (passt) {
      const treffer = nimm(slug);
      if (treffer) return treffer;
    }
  }

  // Ebene 3: irgendein Vorkommen.
  for (const [begriff, slug] of ART) {
    if (tags.some((t) => t.includes(begriff))) {
      const treffer = nimm(slug);
      if (treffer) return treffer;
    }
  }

  return null;
}

/** Damit ein Test merkt, wenn jemand die Tabellen versehentlich leert. */
export const OFF_CATEGORY_RULE_COUNT = ZUSTAND.length + ART.length;
