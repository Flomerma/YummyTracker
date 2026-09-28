import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { householdErrorMessage, isErrorMarker } from "@/lib/domain/invite";
import type {
  ExpirySource,
  InventoryStatus,
  StorageLocation,
  Unit,
} from "@/lib/domain/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Zugriffsschicht fuer den Vorrat (inventory_items).
 *
 * ----------------------------------------------------------------------
 * WAS HIER FEHLT UND WARUM
 * ----------------------------------------------------------------------
 * Es gibt keine Loeschfunktion. Nicht aus Nachlaessigkeit: `authenticated`
 * hat auf dieser Tabelle gar kein DELETE-Recht (Migration
 * 20260924090200). "Nichts wird geloescht" aus Konzept 5.3 ist damit kein
 * Vorsatz, den man vergessen kann, sondern ein fehlendes Recht. Erledigte
 * Artikel bekommen einen Status; ohne sie gaebe es die Weggeworfen-
 * Auswertung nicht.
 *
 * Ebenso wenig schreibbar sind `household_id`, `added_at`, `added_by`,
 * `resolved_at`, `resolved_by` und `owner_id`. Zeitpunkt und Person beim
 * Erledigen setzt ein Trigger aus dem Status — sonst liesse sich die
 * Auswertung faelschen.
 */

export type InventoryResult<T> =
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

function failure(error: PostgrestError): InventoryResult<never> {
  const code = errorCode(error);
  return { ok: false, code, message: householdErrorMessage(code) };
}

/* -------------------------------------------------------------------------
 * Zeilenform
 * ---------------------------------------------------------------------- */

export interface InventoryItem {
  readonly id: string;
  readonly householdId: string;
  readonly productId: string | null;
  /**
   * Schnappschuss des Namens zum Zeitpunkt der Erfassung. Bewusst nicht
   * aus products gelesen: Wird ein Katalogeintrag spaeter umbenannt, soll
   * die Historie nicht ruecklaeufig anders aussehen (Konzept 5.3).
   */
  readonly displayName: string;
  readonly quantity: number;
  readonly unit: Unit;
  readonly storage: StorageLocation | null;
  readonly expiresAt: string | null;
  readonly expirySource: ExpirySource;
  readonly openedAt: string | null;
  readonly priceChf: number | null;
  readonly note: string | null;
  readonly status: InventoryStatus;
  readonly resolvedAt: string | null;
  readonly addedAt: string;
  readonly categoryId: string | null;
}

interface ItemRow {
  id: string;
  household_id: string;
  product_id: string | null;
  display_name: string;
  quantity: string | number;
  unit: string;
  storage: string | null;
  expires_at: string | null;
  expiry_source: string;
  opened_at: string | null;
  price_chf: string | number | null;
  note: string | null;
  status: string;
  resolved_at: string | null;
  added_at: string;
  products: { category_id: string | null } | null;
}

/** numeric kommt aus PostgREST als Zeichenkette — sonst verliert man Rappen. */
function num(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

function toItem(row: ItemRow): InventoryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    productId: row.product_id,
    displayName: row.display_name,
    quantity: num(row.quantity) ?? 0,
    unit: row.unit as Unit,
    storage: (row.storage as StorageLocation | null) ?? null,
    expiresAt: row.expires_at,
    expirySource: row.expiry_source as ExpirySource,
    openedAt: row.opened_at,
    priceChf: num(row.price_chf),
    note: row.note,
    status: row.status as InventoryStatus,
    resolvedAt: row.resolved_at,
    addedAt: row.added_at,
    categoryId: row.products?.category_id ?? null,
  };
}

const ITEM_COLUMNS =
  "id, household_id, product_id, display_name, quantity, unit, storage, " +
  "expires_at, expiry_source, opened_at, price_chf, note, status, " +
  "resolved_at, added_at, products(category_id)";

/* -------------------------------------------------------------------------
 * Lesen
 * ---------------------------------------------------------------------- */

/**
 * Der aktive Bestand eines Haushalts, nach Dringlichkeit sortiert.
 *
 * `nullsFirst: false` ist wichtig: Artikel ohne Ablaufdatum gehoeren ans
 * Ende, nicht an den Anfang. Sonst stuende oben, was gerade NICHT draengt.
 * Genau in dieser Reihenfolge liegt der Teilindex
 * inventory_items_active_urgency_idx — die Abfrage laeuft damit ohne
 * Sortierschritt.
 */
export async function listActiveItems(
  householdId: string,
): Promise<InventoryResult<readonly InventoryItem[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select(ITEM_COLUMNS)
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as ItemRow[]).map(toItem) };
}

export async function getItem(
  itemId: string,
): Promise<InventoryResult<InventoryItem | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();

  if (error) return failure(error);
  return { ok: true, data: data ? toItem(data as unknown as ItemRow) : null };
}

/**
 * Erledigte Artikel fuer die Auswertung (Stufe 4 im Konzept).
 *
 * Schon hier angelegt, weil die Daten ab dem ersten Tag entstehen — die
 * Auswertung kann spaeter nur zeigen, was vorher gesammelt wurde.
 */
export async function listResolvedItems(
  householdId: string,
  since: string,
): Promise<InventoryResult<readonly InventoryItem[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select(ITEM_COLUMNS)
    .eq("household_id", householdId)
    .in("status", ["consumed", "discarded"])
    .gte("resolved_at", since)
    .order("resolved_at", { ascending: false });

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as ItemRow[]).map(toItem) };
}

/* -------------------------------------------------------------------------
 * Schreiben
 * ---------------------------------------------------------------------- */

/**
 * Setzt den Status eines Artikels — die Antwort auf die Nachfrage aus
 * Konzept 4.2: gegessen, weggeworfen, oder zurueck in den Bestand.
 *
 * `resolved_at` und `resolved_by` werden NICHT mitgegeben. Ein Trigger
 * setzt sie aus dem Status und nimmt sie beim Zurueckholen wieder weg.
 * Der Client hat auf beiden Spalten kein Schreibrecht.
 */
export async function setItemStatus(
  itemId: string,
  status: InventoryStatus,
): Promise<InventoryResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({ status })
    .eq("id", itemId);

  if (error) return failure(error);
  return { ok: true, data: null };
}

/**
 * Korrigiert das Ablaufdatum.
 *
 * `expiry_source` wandert dabei auf 'manual': Ab jetzt steht dort kein
 * geschaetzter, sondern ein von Hand gesetzter Wert — und die Oberflaeche
 * darf ihn entsprechend hart anzeigen statt ihn als Schaetzung zu
 * kennzeichnen.
 */
export async function setItemExpiry(
  itemId: string,
  expiresAt: string | null,
): Promise<InventoryResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({
      expires_at: expiresAt,
      expiry_source: expiresAt ? "manual" : "none",
    })
    .eq("id", itemId);

  if (error) return failure(error);
  return { ok: true, data: null };
}

/**
 * Markiert einen Artikel als geoeffnet.
 *
 * Das neue Ablaufdatum berechnet der Aufrufer mit `computeExpiry` aus
 * lib/domain — dort gilt die Regel aus Konzept 4.3: Bei Geoeffnetem mit
 * Aufdruck zaehlt das FRUEHERE der beiden Daten.
 */
export async function setItemOpened(
  itemId: string,
  openedAt: string,
  expiresAt: string | null,
  expirySource: ExpirySource,
): Promise<InventoryResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("inventory_items")
    .update({
      opened_at: openedAt,
      expires_at: expiresAt,
      expiry_source: expirySource,
    })
    .eq("id", itemId);

  if (error) return failure(error);
  return { ok: true, data: null };
}
