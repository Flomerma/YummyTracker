import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { databaseErrorMessage, isErrorMarker } from "@/lib/domain/invite";
import type {
  ProductCandidate,
  ShelfLifeRule,
  StorageLocation,
  Unit,
} from "@/lib/domain/types";
import { escapeLikeTerm, searchTerms } from "@/lib/domain/search-terms";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Zugriffsschicht fuer den Produktkatalog: categories, products und
 * shelf_life_rules.
 *
 * ----------------------------------------------------------------------
 * DER KATALOG IST AUS DEM BROWSER NUR LESBAR
 * ----------------------------------------------------------------------
 * `authenticated` hat auf diesen drei Tabellen ausschliesslich SELECT
 * (Migration 20260924090000, Abschnitt 5). Das ist Absicht: Der Katalog
 * waechst ueber alle Haushalte hinweg, ein Tippfehler dort verteilt sich
 * sonst auf alle. Schreiben laeuft deshalb ueber den Client aus
 * lib/supabase/admin.ts — und der umgeht alle Zeilen-Sicherheitsregeln,
 * weshalb jede Schreibstrecke hier die Zugehoerigkeit vorher selbst
 * pruefen muss.
 *
 * ----------------------------------------------------------------------
 * DIE DATENBANK RANKT NICHT
 * ----------------------------------------------------------------------
 * `loadShelfLifeRules` liefert ALLE Kandidatenzeilen, nicht die beste.
 * Die Auswahl trifft `resolveShelfLife` in lib/domain — dort ist sie ohne
 * laufende Datenbank testbar, und dort steht die Begruendung fuer die
 * Rangfolge. Wer hier ein `order by` einbaut und `limit 1` nimmt,
 * verschiebt Fachlogik in SQL und verliert die Tests.
 */

/* -------------------------------------------------------------------------
 * Ergebnisform — dieselbe wie in lib/data/households.ts
 * ---------------------------------------------------------------------- */

export type CatalogResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: string | null;
      readonly message: string;
    };

function errorCode(error: PostgrestError): string | null {
  const detail = error.details?.trim();
  if (isErrorMarker(detail)) return detail!;
  const code = error.code?.trim();
  return code ? code : null;
}

function failure(error: PostgrestError): CatalogResult<never> {
  const code = errorCode(error);
  return {
    ok: false,
    code,
    message: databaseErrorMessage(code, error.message),
  };
}

/* -------------------------------------------------------------------------
 * Zeilenformen
 * ---------------------------------------------------------------------- */

export interface CatalogProduct extends ProductCandidate {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly defaultUnit: Unit;
  readonly defaultStorage: StorageLocation | null;
  /** null = globaler Katalogeintrag, sonst haushaltseigen. */
  readonly householdId: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  normalized_name: string;
  category_id: string | null;
  default_unit: string;
  default_storage: string | null;
  household_id: string | null;
  categories: { name: string } | null;
}

function toProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? null,
    defaultUnit: row.default_unit as Unit,
    defaultStorage: (row.default_storage as StorageLocation | null) ?? null,
    householdId: row.household_id,
  };
}

interface RuleRow {
  id: string;
  scope: string;
  product_id: string | null;
  category_id: string | null;
  storage: string | null;
  days_unopened: number | null;
  days_opened: number | null;
  household_id: string | null;
  source: string;
  sample_count: number | null;
  updated_at: string | null;
}

/**
 * Bildet eine Zeile auf den Typ ab, den `resolveShelfLife` erwartet.
 *
 * Die Feldnamen stehen eins zu eins in lib/domain/types.ts. Weicht die
 * Datenbank davon ab, faellt es hier auf und nicht irgendwo in der Regel.
 */
function toRule(row: RuleRow): ShelfLifeRule {
  return {
    id: row.id,
    scope: row.scope as ShelfLifeRule["scope"],
    productId: row.product_id,
    categoryId: row.category_id,
    storage: (row.storage as StorageLocation | null) ?? null,
    daysUnopened: row.days_unopened,
    daysOpened: row.days_opened,
    householdId: row.household_id,
    source: row.source as ShelfLifeRule["source"],
    sampleCount: row.sample_count,
    updatedAt: row.updated_at,
  };
}

/**
 * Obergrenze fuer Suchbegriffe in EINER Abfrage. PostgREST baut den
 * ODER-Ausdruck in die Adresse ein; ein Bon mit 34 Zeilen ergibt rund
 * hundert Begriffe. Achtzig deckten in der Messung jede Zeile ab — die
 * laengsten zuerst, damit die Grenze das Unwichtigste abschneidet.
 */
const MAX_SEARCH_TERMS_PER_QUERY = 80;

const RULE_COLUMNS =
  "id, scope, product_id, category_id, storage, days_unopened, " +
  "days_opened, household_id, source, sample_count, updated_at";

const PRODUCT_COLUMNS =
  "id, name, normalized_name, category_id, default_unit, default_storage, " +
  "household_id, categories(name)";

/* -------------------------------------------------------------------------
 * Lesen
 * ---------------------------------------------------------------------- */

/**
 * Sucht Produkte fuer die Schnelleingabe.
 *
 * Gesucht wird auf `normalized_name`, nicht auf `name`: Wer "Vollmilch"
 * tippt, soll auch "Vollmilch" finden, wenn im Katalog eine andere
 * Schreibweise steht. Die Normalisierung der Eingabe erledigt der Aufrufer
 * mit `normalizeName` — dieselbe Funktion, die den Katalog gefuellt hat.
 *
 * ----------------------------------------------------------------------
 * TOKENWEISE, NICHT ALS GANZE ANFRAGE
 * ----------------------------------------------------------------------
 * Die erste Fassung suchte `%ganze anfrage%`. Nachgemessen an 18
 * realistischen Bonzeilen fanden 10 davon KEINEN Kandidaten — "hackfleisch
 * rind" trifft "rindshackfleisch" nicht, weil die Woerter anders herum
 * stehen. Mit den Einzelbegriffen aus `searchTerms` blieben 2 uebrig, und
 * die scheiterten am fehlenden Katalogeintrag, nicht an der Abfrage.
 *
 * Das Netz ist damit bewusst weit; die Rangfolge macht anschliessend
 * `matchProduct` in lib/domain. Eine Suche, die zu wenig liefert, kann der
 * beste Abgleich nicht mehr retten — umgekehrt schon.
 *
 * Die Zeilen-Sicherheitsregeln sorgen dafuer, dass hier globale Eintraege
 * und die des eigenen Haushalts erscheinen, aber keine fremden.
 */
export async function searchProducts(
  normalizedQuery: string,
  limit = 40,
): Promise<CatalogResult<readonly CatalogProduct[]>> {
  const terms = searchTerms(normalizedQuery);
  if (terms.length === 0) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  // PostgREST erwartet im or()-Ausdruck `*` als Platzhalter, nicht `%`.
  // Die LIKE-Sonderzeichen im Begriff selbst werden vorher maskiert, sonst
  // wird aus einer Eingabe mit Prozentzeichen ein Muster, das auf alles
  // passt.
  const filter = terms
    .map((term) => `normalized_name.ilike.*${escapeLikeTerm(term)}*`)
    .join(",");

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .or(filter)
    .order("normalized_name")
    .limit(limit);

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as ProductRow[]).map(toProduct) };
}

/**
 * Kandidaten fuer VIELE Zeilen in EINER Abfrage.
 *
 * Ein echter Migros-Bon hat 34 Zeilen; mit `searchProducts` pro Zeile waeren
 * das 34 Rundgaenge zur Datenbank. Hier ist es einer.
 *
 * Zurueck kommt die VEREINIGUNG aller Kandidaten, nicht nach Zeilen
 * getrennt. Absicht: `assignLine` bewertet ohnehin jeden Kandidaten gegen
 * den Rohtext, ein zusaetzlicher kostet dort nur Rechenzeit. Die Ergebnisse
 * nach Zeilen aufzuteilen waere Mehrarbeit — und eine Fehlerquelle, wenn
 * die Zuordnung verrutscht.
 */
export async function searchProductsForMany(
  normalizedQueries: readonly string[],
  limit = 400,
): Promise<CatalogResult<readonly CatalogProduct[]>> {
  const terms = Array.from(
    new Set(normalizedQueries.flatMap((q) => searchTerms(q))),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SEARCH_TERMS_PER_QUERY);

  if (terms.length === 0) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .or(
      terms
        .map((term) => `normalized_name.ilike.*${escapeLikeTerm(term)}*`)
        .join(","),
    )
    .order("normalized_name")
    .limit(limit);

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as ProductRow[]).map(toProduct) };
}

/**
 * Haltbarkeitsregeln fuer viele Produkte und Kategorien in EINER Abfrage.
 * Die Aufrufer filtern im Hauptspeicher je Zeile — `resolveShelfLife`
 * braucht ohnehin nur die passenden Regeln.
 */
export async function loadShelfLifeRulesForMany(
  productIds: readonly string[],
  categoryIds: readonly string[],
): Promise<CatalogResult<readonly ShelfLifeRule[]>> {
  const produkte = Array.from(new Set(productIds.filter(Boolean)));
  const kategorien = Array.from(new Set(categoryIds.filter(Boolean)));
  if (produkte.length === 0 && kategorien.length === 0) {
    return { ok: true, data: [] };
  }

  const supabase = await createSupabaseServerClient();

  const bedingungen: string[] = [];
  if (produkte.length > 0)
    bedingungen.push(`product_id.in.(${produkte.join(",")})`);
  if (kategorien.length > 0)
    bedingungen.push(`category_id.in.(${kategorien.join(",")})`);

  const { data, error } = await supabase
    .from("shelf_life_rules")
    .select(RULE_COLUMNS)
    .or(bedingungen.join(","));

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as RuleRow[]).map(toRule) };
}

/**
 * Kategorien nach ihrem Kuerzel, fuer den Abgleich mit Hinweisen von aussen
 * (Sprachmodell beim Bon, Open Food Facts beim Barcode). Beide liefern
 * Kuerzel wie "fresh-vegetables", die Datenbank arbeitet mit Kennungen.
 */
export async function categoryIdsBySlug(): Promise<
  CatalogResult<ReadonlyMap<string, string>>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("categories").select("id, slug");
  if (error) return failure(error);
  return {
    ok: true,
    data: new Map((data ?? []).map((c) => [c.slug as string, c.id as string])),
  };
}

export async function getProduct(
  productId: string,
): Promise<CatalogResult<CatalogProduct | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("id", productId)
    .maybeSingle();

  if (error) return failure(error);
  return {
    ok: true,
    data: data ? toProduct(data as unknown as ProductRow) : null,
  };
}

/**
 * Laedt alle Haltbarkeitsregeln, die fuer dieses Produkt in Frage kommen —
 * seine eigenen und die seiner Kategorie, global wie haushaltseigen.
 *
 * Bewusst ohne Sortierung und ohne Begrenzung: `resolveShelfLife` braucht
 * die vollstaendige Menge, um die Rangfolge aus Konzept 4.3 anzuwenden.
 */
export async function loadShelfLifeRules(
  productId: string | null,
  categoryId: string | null,
): Promise<CatalogResult<readonly ShelfLifeRule[]>> {
  if (!productId && !categoryId) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  const conditions: string[] = [];
  if (productId) conditions.push(`product_id.eq.${productId}`);
  if (categoryId) conditions.push(`category_id.eq.${categoryId}`);

  const { data, error } = await supabase
    .from("shelf_life_rules")
    .select(RULE_COLUMNS)
    .or(conditions.join(","));

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as RuleRow[]).map(toRule) };
}

export interface CatalogCategory {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export async function listCategories(): Promise<
  CatalogResult<readonly CatalogCategory[]>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name")
    .order("sort_order")
    .order("name");

  if (error) return failure(error);
  return { ok: true, data: (data ?? []) as CatalogCategory[] };
}

function adminFehlt(): CatalogResult<never> {
  return {
    ok: false,
    code: "admin_key_missing",
    message:
      "Dieser Schritt braucht den Geheimschluessel des Projekts, und er ist " +
      "nicht hinterlegt. Alles Uebrige funktioniert ohne ihn weiter.",
  };
}

/* -------------------------------------------------------------------------
 * Strichcodes
 * ---------------------------------------------------------------------- */

/**
 * Sucht das Produkt zu einem Strichcode.
 *
 * ZWEI QUELLEN, IN DIESER REIHENFOLGE:
 *
 *  1. Die gelernte Zuordnung dieses Haushalts
 *     (household_product_eans). Sie sticht, weil sie die gezieltere und
 *     juengere Aussage ist: Jemand hat diesen Code hier von Hand einem
 *     Produkt zugewiesen.
 *  2. Der globale Katalog (products.ean).
 *
 * Der Aufrufer muss vorher `classifyEan` aus lib/domain befragen: Bei einem
 * Waagenetikett (Praefix 20-29) ist diese Suche sinnlos, weil solche Codes
 * nur im Laden gelten, der sie gedruckt hat. Zwei verschenkte Rundgaenge
 * sind nicht schlimm — aber dem Nutzer zwei Sekunden Warten zuzumuten fuer
 * eine Antwort, die nicht kommen kann, ist es.
 */
export async function findProductByEan(
  ean: string,
  householdId: string,
): Promise<CatalogResult<CatalogProduct | null>> {
  const supabase = await createSupabaseServerClient();

  // 1. Gelernte Zuordnung. Die Zeilen-Sicherheitsregeln begrenzen das
  //    ohnehin auf eigene Haushalte; household_id steht trotzdem in der
  //    Bedingung, weil jemand zu mehreren gehoeren kann.
  const gelernt = await supabase
    .from("household_product_eans")
    .select(`product_id, products(${PRODUCT_COLUMNS})`)
    .eq("ean", ean)
    .eq("household_id", householdId)
    .maybeSingle();

  if (gelernt.error) return failure(gelernt.error);

  const verknuepft = (
    gelernt.data as unknown as { products: ProductRow | null } | null
  )?.products;
  if (verknuepft) return { ok: true, data: toProduct(verknuepft) };

  // 2. Globaler Katalog.
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("ean", ean)
    .limit(1)
    .maybeSingle();

  if (error) return failure(error);
  return {
    ok: true,
    data: data ? toProduct(data as unknown as ProductRow) : null,
  };
}

/**
 * Merkt sich, was ein Code in diesem Haushalt bedeutet.
 *
 * Das ist der eigentliche Gewinn des Scanners: Einmal von Hand zugeordnet,
 * trifft derselbe Code beim naechsten Einkauf sofort — ohne Netzzugriff und
 * ohne Fremdanbieter. Gerade bei Schweizer Eigenmarken, die in keiner
 * globalen Datenbank stehen, ist das der einzige Weg, der ueberhaupt
 * funktioniert.
 *
 * Laeuft bewusst mit dem NUTZER-Client, nicht mit erhoehten Rechten: Die
 * Richtlinie prueft dabei beides — Zugehoerigkeit zum Haushalt UND dass
 * das Produkt fuer ihn verwendbar ist. Mit erhoehten Rechten faellt diese
 * Pruefung weg, und es gibt hier keinen Grund, sie zu umgehen.
 *
 * Bei Konflikt wird ueberschrieben: Wer denselben Code erneut zuordnet,
 * korrigiert eine frueher e Zuordnung.
 */
export async function rememberEan(input: {
  readonly householdId: string;
  readonly ean: string;
  readonly productId: string;
}): Promise<CatalogResult<null>> {
  const supabase = await createSupabaseServerClient();

  // Kein UPSERT: Die Tabelle hat absichtlich kein UPDATE-Recht (eine
  // Richtlinie kann den alten Wert nicht sehen). Loeschen und neu anlegen
  // ist derselbe Aufwand und braucht keine zusaetzliche Richtlinie.
  const weg = await supabase
    .from("household_product_eans")
    .delete()
    .eq("household_id", input.householdId)
    .eq("ean", input.ean);
  if (weg.error) return failure(weg.error);

  const { error } = await supabase.from("household_product_eans").insert({
    household_id: input.householdId,
    ean: input.ean,
    product_id: input.productId,
  });

  if (error) return failure(error);
  return { ok: true, data: null };
}

/** Nimmt eine gelernte Zuordnung zurueck. */
export async function forgetEan(
  householdId: string,
  ean: string,
): Promise<CatalogResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("household_product_eans")
    .delete()
    .eq("household_id", householdId)
    .eq("ean", ean);

  if (error) return failure(error);
  return { ok: true, data: null };
}

/* -------------------------------------------------------------------------
 * Schreiben — nur ueber den Client mit erhoehten Rechten
 * ---------------------------------------------------------------------- */

export interface NewHouseholdProduct {
  readonly householdId: string;
  readonly name: string;
  /** Muss mit normalizeName aus lib/domain erzeugt sein. */
  readonly normalizedName: string;
  readonly categoryId: string | null;
  readonly defaultUnit: Unit;
  readonly defaultStorage: StorageLocation | null;
}

/**
 * Legt ein Produkt an, das nur diesem Haushalt gehoert.
 *
 * LAEUFT MIT DEM NUTZER-CLIENT, nicht mit erhoehten Rechten.
 *
 * Das war einmal anders und war ein Fehler: Der Weg ueber den
 * Geheimschluessel brach in Produktion, weil SUPABASE_SECRET_KEY nicht
 * gesetzt war — und er schuetzte dabei nichts. Haushaltseigene Produkte
 * sind durch die Zeilen-Sicherheitsregeln ohnehin fuer keinen anderen
 * Haushalt sichtbar; der Grund fuer "Katalog nur lesbar" (ein Tippfehler
 * verteilt sich global) trifft auf sie nicht zu. Seit Migration
 * 20261001150000 erlaubt eine Richtlinie genau diesen einen Fall.
 *
 * PFLICHT DES AUFRUFERS: `normalizedName` muss aus `normalizeName`
 * stammen. Die Datenbank berechnet ihn nicht; ihr CHECK prueft nur die
 * grobe Form (kleingeschrieben, getrimmt, keine Doppelleerzeichen).
 *
 * `source` ist zwingend 'user', sobald `household_id` gesetzt ist — der
 * CHECK products_scope_matches_source erzwingt diesen Zusammenhang und
 * schliesst damit aus, dass hier versehentlich ein globaler Eintrag
 * entsteht.
 */
export async function createHouseholdProduct(
  input: NewHouseholdProduct,
): Promise<CatalogResult<CatalogProduct>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("products")
    .insert({
      household_id: input.householdId,
      name: input.name,
      normalized_name: input.normalizedName,
      category_id: input.categoryId,
      default_unit: input.defaultUnit,
      default_storage: input.defaultStorage,
      source: "user",
      // KEIN `verified`: Die Spalte ist fuer Mitglieder bewusst nicht
      // freigegeben (Migration 20261001150000) — eine Selbstbescheinigung
      // waere wertlos, und der Vorgabewert ist ohnehin false. Steht sie
      // hier, lehnt PostgreSQL die ganze Anweisung ab ("permission denied
      // for table products"). Genau das ist in Produktion passiert;
      // lib/data/catalog-grants.test.ts haelt beide Seiten jetzt zusammen.
    })
    .select(PRODUCT_COLUMNS)
    .single();

  if (error) return failure(error);
  return { ok: true, data: toProduct(data as unknown as ProductRow) };
}

/**
 * Schreibt eine KI-Schaetzung als globale Regel in den Katalog zurueck.
 *
 * Der Clou aus Konzept 4.3: Jedes unbekannte Produkt kostet damit genau
 * einmal eine Abfrage — danach ist der Wert fuer alle Haushalte da, und
 * der Katalog waechst im Betrieb, ohne dass ihn jemand pflegt.
 *
 * Bei Konflikt wird NICHT ueberschrieben: Ein bereits vorhandener Wert ist
 * entweder aus dem Startkatalog (besser) oder eine frueher e Schaetzung
 * (gleichwertig). Beides ist kein Grund, erneut zu schreiben.
 */
export async function saveEstimatedShelfLife(input: {
  readonly productId: string;
  readonly storage: StorageLocation;
  readonly daysUnopened: number;
  readonly daysOpened: number | null;
}): Promise<CatalogResult<null>> {
  if (!hasSupabaseAdminConfig()) return adminFehlt();

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("shelf_life_rules").insert({
    scope: "product",
    product_id: input.productId,
    storage: input.storage,
    days_unopened: input.daysUnopened,
    days_opened: input.daysOpened,
    household_id: null,
    source: "ai",
  });

  // 23505 = Eindeutigkeitsverletzung. Jemand war schneller; das ist kein
  // Fehler, sondern der Normalfall bei gleichzeitigen Erfassungen.
  if (error && error.code !== "23505") return failure(error);
  return { ok: true, data: null };
}

/**
 * Merkt sich eine Korrektur als haushaltseigene Regel (Konzept 4.3).
 *
 * `sample_count` zaehlt die Beobachtungen. Ob aus einer einzelnen Korrektur
 * schon eine Regel werden soll, entscheidet NICHT diese Schicht — die
 * Lernregel steht in lib/services/intake.ts und ist dort begruendet.
 */
export async function upsertLearnedShelfLife(input: {
  readonly householdId: string;
  readonly productId: string;
  readonly storage: StorageLocation;
  readonly daysUnopened: number;
  readonly sampleCount: number;
}): Promise<CatalogResult<null>> {
  if (!hasSupabaseAdminConfig()) return adminFehlt();

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("shelf_life_rules").upsert(
    {
      scope: "product",
      product_id: input.productId,
      storage: input.storage,
      days_unopened: input.daysUnopened,
      household_id: input.householdId,
      source: "learned",
      sample_count: input.sampleCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,storage,household_id" },
  );

  if (error) return failure(error);
  return { ok: true, data: null };
}
