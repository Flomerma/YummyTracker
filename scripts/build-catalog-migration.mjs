/**
 * Erzeugt die Migration mit dem Startkatalog aus supabase/seed/catalog.json.
 *
 *   node scripts/build-catalog-migration.mjs
 *
 * Warum ein Generator und nicht handgeschriebenes SQL: Der Katalog sind rund
 * 550 Zeilen Daten. Von Hand gepflegt waere er nach der ersten Korrektur
 * inkonsistent. Die Quelle ist die JSON-Datei, das SQL ist Erzeugnis — wer den
 * Katalog aendert, aendert die JSON-Datei und laesst neu erzeugen.
 *
 * Das Ergebnis ist bewusst wiederholbar ausfuehrbar: Kategorien und Produkte
 * werden bei Konflikt aktualisiert, die Haltbarkeitsregeln des Startkatalogs
 * vorher weggeraeumt. Gelernte und per KI ergaenzte Regeln bleiben unberuehrt,
 * weil sie an source und household_id erkennbar sind.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Zieldatei. Standard ist die ERSTE Katalog-Migration; sobald sie einmal
 * eingespielt wurde, darf sie nicht mehr veraendert werden — die
 * Migrationshistorie fuehrt sie als angewendet, und `db push` wuerde eine
 * Aenderung nie ausfuehren. Fuer Ergaenzungen gibt man deshalb einen neuen
 * Dateinamen mit:
 *
 *   node scripts/build-catalog-migration.mjs 20260930120000_stage1_seed_catalog_v2.sql
 *
 * Das erzeugte SQL ist wiederholt ausfuehrbar, ein erneuter Lauf gegen eine
 * bereits gefuellte Datenbank aktualisiert also nur.
 */
const OUT = join(
  root,
  "supabase/migrations",
  process.argv[2] ?? "20260924090400_stage1_seed_catalog.sql",
);

const catalog = JSON.parse(
  readFileSync(join(root, "supabase/seed/catalog.json"), "utf8"),
);

/** Einfaches Quoting fuer SQL-Zeichenketten. */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Die Fachlogik kennt nur diese drei Lagerorte (lib/domain/types.ts). */
const STORAGES = ["pantry", "fridge", "freezer"];

// --- Vorpruefung: lieber hier scheitern als in der Datenbank ---------------

const slugs = new Set(catalog.categories.map((c) => c.slug));
const problems = [];

for (const c of catalog.categories) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug))
    problems.push(`Kategorie-Slug unzulaessig: ${c.slug}`);
  if (!STORAGES.includes(c.defaultStorage))
    problems.push(`Kategorie ${c.slug}: Lagerort ${c.defaultStorage}`);
}
for (const p of catalog.products) {
  if (!slugs.has(p.categorySlug))
    problems.push(`Produkt ${p.name}: unbekannte Kategorie ${p.categorySlug}`);
  if (!STORAGES.includes(p.defaultStorage))
    problems.push(`Produkt ${p.name}: Lagerort ${p.defaultStorage}`);
  if (!["piece", "g", "ml"].includes(p.defaultUnit))
    problems.push(`Produkt ${p.name}: Einheit ${p.defaultUnit}`);
  if (p.normalizedName !== p.normalizedName.trim().toLowerCase())
    problems.push(`Produkt ${p.name}: normalizedName nicht normalisiert`);
  if (/\s\s/.test(p.normalizedName))
    problems.push(`Produkt ${p.name}: doppeltes Leerzeichen`);
}
if (problems.length) {
  console.error("Katalog fehlerhaft:\n  " + problems.join("\n  "));
  process.exit(1);
}

// --- Kategorien ------------------------------------------------------------

const catRows = catalog.categories
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug))
  .map((c) => `  (${q(c.slug)}, ${q(c.name)}, ${c.sortOrder})`)
  .join(",\n");

// --- Produkte --------------------------------------------------------------

const prodRows = catalog.products
  .map(
    (p) =>
      `  (${q(p.name)}, ${q(p.normalizedName)}, ${q(p.categorySlug)}, ` +
      `${q(p.defaultUnit)}, ${q(p.defaultStorage)})`,
  )
  .join(",\n");

// --- Haltbarkeitsregeln ----------------------------------------------------
// Kategorieregeln sind das Auffangnetz ganz unten in der Kette (Konzept 4.3).
// Je Lagerort eine Zeile, aber nur wo die Kategorie dort ueberhaupt vorkommt
// (0 in den Daten heisst "nicht sinnvoll", etwa Mehl im Gefrierer).

const catRuleRows = [];
for (const c of catalog.categories) {
  const perStorage = {
    pantry: c.daysPantry,
    fridge: c.daysFridge,
    freezer: c.daysFreezer,
  };
  for (const storage of STORAGES) {
    const days = perStorage[storage];
    if (!days) continue;
    // days_opened gilt ab dem Oeffnen und ueberschreibt den Aufdruck. Im
    // Gefrierer ist das ohne Bedeutung, dort steht deshalb nichts.
    const opened =
      storage !== "freezer" && c.daysOpened > 0 ? String(c.daysOpened) : "null";
    catRuleRows.push(`  (${q(c.slug)}, ${q(storage)}, ${days}, ${opened})`);
  }
}

const prodRuleRows = catalog.products.map(
  (p) =>
    `  (${q(p.normalizedName)}, ${q(p.defaultStorage)}, ` +
    `${p.daysDefaultStorage}, ${p.daysOpened > 0 ? p.daysOpened : "null"})`,
);

// --- Datei -----------------------------------------------------------------

const sql = `-- ---------------------------------------------------------------------
-- Startkatalog (Konzept 4.3 und 5.2)
-- ---------------------------------------------------------------------
--
-- ERZEUGT — nicht von Hand aendern.
-- Quelle: supabase/seed/catalog.json
-- Neu erzeugen: node scripts/build-catalog-migration.mjs
--
-- ${catalog.categories.length} Kategorien, ${catalog.products.length} Produkte,
-- ${catRuleRows.length} Kategorie- und ${prodRuleRows.length} Produktregeln.
--
-- Der Katalog macht den Normalfall beim Erfassen zum Einzeiler: Wer "Vollmilch"
-- tippt, bekommt Lagerort und Haltbarkeit vorgeschlagen und muss kein Datum
-- suchen. Die Werte sind bewusst konservativ — eine zu fruehe Warnung ist
-- harmlos, eine zu spaete bedeutet verdorbene Ware.
--
-- Wiederholt ausfuehrbar: Kategorien und Produkte werden bei Konflikt
-- aktualisiert, die Regeln des Startkatalogs vorher weggeraeumt. Gelernte
-- Regeln (source='learned') und KI-Schaetzungen (source='ai') bleiben stehen —
-- sie sind an source und household_id erkennbar.
-- ---------------------------------------------------------------------

-- 1. Kategorien --------------------------------------------------------

insert into public.categories (slug, name, sort_order) values
${catRows}
on conflict (slug) do update
  set name       = excluded.name,
      sort_order = excluded.sort_order,
      updated_at = now();

-- 2. Produkte ----------------------------------------------------------
-- Global, also household_id = null. Deshalb source='seed' und nicht 'user';
-- der CHECK products_scope_matches_source erzwingt diesen Zusammenhang.

insert into public.products
  (name, normalized_name, category_id, default_unit, default_storage,
   source, verified, household_id)
select v.name, v.normalized_name, c.id, v.default_unit, v.default_storage,
       'seed', true, null
from (values
${prodRows}
) as v(name, normalized_name, category_slug, default_unit, default_storage)
join public.categories c on c.slug = v.category_slug
on conflict (normalized_name) where household_id is null do update
  set name            = excluded.name,
      category_id     = excluded.category_id,
      default_unit    = excluded.default_unit,
      default_storage = excluded.default_storage,
      source          = 'seed',
      verified        = true,
      updated_at      = now();

-- 3. Haltbarkeitsregeln ------------------------------------------------

delete from public.shelf_life_rules
 where source = 'seed' and household_id is null;

-- 3a. Kategorieregeln: das Auffangnetz fuer alles, was der Katalog nicht kennt.

insert into public.shelf_life_rules
  (scope, category_id, storage, days_unopened, days_opened, household_id, source)
select 'category', c.id, v.storage, v.days_unopened, v.days_opened, null, 'seed'
from (values
${catRuleRows.join(",\n")}
) as v(category_slug, storage, days_unopened, days_opened)
join public.categories c on c.slug = v.category_slug;

-- 3b. Produktregeln: genauer als die Kategorie und deshalb vorrangig.

insert into public.shelf_life_rules
  (scope, product_id, storage, days_unopened, days_opened, household_id, source)
select 'product', p.id, v.storage, v.days_unopened, v.days_opened, null, 'seed'
from (values
${prodRuleRows.join(",\n")}
) as v(normalized_name, storage, days_unopened, days_opened)
join public.products p
  on p.normalized_name = v.normalized_name
 and p.household_id is null;
`;

writeFileSync(OUT, sql);
console.log(
  `${OUT}\n  ${catalog.categories.length} Kategorien, ` +
    `${catalog.products.length} Produkte, ` +
    `${catRuleRows.length} Kategorieregeln, ${prodRuleRows.length} Produktregeln`,
);
