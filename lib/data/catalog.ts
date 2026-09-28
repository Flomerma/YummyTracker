import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { householdErrorMessage, isErrorMarker } from "@/lib/domain/invite";
import type {
  ProductCandidate,
  ShelfLifeRule,
  StorageLocation,
  Unit,
} from "@/lib/domain/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  return { ok: false, code, message: householdErrorMessage(code) };
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
 * tippt, soll auch "Vollmilch" finden, wenn im Katalog "Vollmilch" mit
 * anderer Schreibweise steht. Die Normalisierung der Eingabe erledigt der
 * Aufrufer mit `normalizeName` aus lib/domain — dieselbe Funktion, die den
 * Katalog gefuellt hat.
 *
 * Die Zeilen-Sicherheitsregeln sorgen dafuer, dass hier globale Eintraege
 * und die des eigenen Haushalts erscheinen, aber keine fremden.
 */
export async function searchProducts(
  normalizedQuery: string,
  limit = 12,
): Promise<CatalogResult<readonly CatalogProduct[]>> {
  const query = normalizedQuery.trim();
  if (query.length === 0) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  // Praefix zuerst, damit "voll" nicht von "Sojavollmilch" verdraengt wird;
  // die genauere Rangfolge macht anschliessend matchProduct in lib/domain.
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .ilike("normalized_name", `%${query}%`)
    .order("normalized_name")
    .limit(limit);

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as ProductRow[]).map(toProduct) };
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
    .select(
      "id, scope, product_id, category_id, storage, days_unopened, " +
        "days_opened, household_id, source, sample_count, updated_at",
    )
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
 * ACHTUNG — ZWEI PFLICHTEN DES AUFRUFERS:
 *
 *  1. Die Zugehoerigkeit zum Haushalt muss VORHER geprueft sein. Dieser
 *     Aufruf laeuft mit erhoehten Rechten und sieht keine Richtlinien.
 *  2. `normalizedName` muss aus `normalizeName` stammen. Die Datenbank
 *     berechnet ihn nicht; ihr CHECK prueft nur die grobe Form
 *     (kleingeschrieben, getrimmt, keine Doppelleerzeichen).
 *
 * `source` ist zwingend 'user', sobald `household_id` gesetzt ist — der
 * CHECK products_scope_matches_source erzwingt diesen Zusammenhang und
 * schliesst damit aus, dass hier versehentlich ein globaler Eintrag
 * entsteht.
 */
export async function createHouseholdProduct(
  input: NewHouseholdProduct,
): Promise<CatalogResult<CatalogProduct>> {
  const supabase = createSupabaseAdminClient();

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
      verified: false,
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
