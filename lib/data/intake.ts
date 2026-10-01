import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { databaseErrorMessage, isErrorMarker } from "@/lib/domain/invite";
import type { ExpirySource, StorageLocation, Unit } from "@/lib/domain/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Zugriffsschicht fuer den Eingang (intake_batches, intake_lines).
 *
 * ----------------------------------------------------------------------
 * WARUM DER EINGANG EINE EIGENE STUFE IST
 * ----------------------------------------------------------------------
 * Tippen, Barcode, Bon-Foto und die abgehakte Einkaufsliste erzeugen alle
 * denselben Entwurf mit Zeilen; erst das Bestaetigen macht daraus Bestand
 * (Konzept 4.1). Der Grund: Kein Erfassungsweg kennt das Ablaufdatum —
 * weder Bon noch Barcode verraten es. Ein Pruef-Schritt ist deshalb
 * ohnehin unvermeidbar, also soll es genau einen geben. Ein weiterer
 * Erfassungsweg heisst spaeter nur: eine Funktion, die Zeilen erzeugt.
 *
 * ----------------------------------------------------------------------
 * DER STATUS IST NICHT SCHREIBBAR
 * ----------------------------------------------------------------------
 * `intake_batches.status` hat fuer `authenticated` kein Schreibrecht. Der
 * Uebergang nach 'confirmed' laeuft ausschliesslich ueber
 * confirm_intake_batch(), das Verwerfen ueber discard_intake_batch().
 * Beide laufen in einer Transaktion und pruefen die Zugehoerigkeit selbst.
 *
 * confirm_intake_batch() ist zudem idempotent: Der Stapel wird gesperrt,
 * ein bereits bestaetigter liefert dieselben Artikel zurueck statt sie zu
 * verdoppeln. Ein Doppelklick auf "Uebernehmen" ist damit harmlos.
 */

export type IntakeResult<T> =
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

function failure(error: PostgrestError): IntakeResult<never> {
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

export type IntakeSource = "manual" | "barcode" | "receipt" | "shopping_list";
export type IntakeStatus = "draft" | "confirmed" | "discarded";

export interface IntakeBatch {
  readonly id: string;
  readonly householdId: string;
  readonly source: IntakeSource;
  readonly status: IntakeStatus;
  readonly createdAt: string;
  readonly confirmedAt: string | null;
}

export interface IntakeLine {
  readonly id: string;
  readonly batchId: string;
  readonly position: number | null;
  /** Der eingetippte oder erkannte Text. Immer gefuellt (CHECK). */
  readonly rawText: string | null;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly matchConfidence: number | null;
  readonly quantity: number;
  readonly unit: Unit;
  readonly priceChf: number | null;
  readonly storage: StorageLocation | null;
  readonly suggestedExpiresAt: string | null;
  readonly expirySource: ExpirySource;
  readonly accepted: boolean;
}

interface BatchRow {
  id: string;
  household_id: string;
  source: string;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

interface LineRow {
  id: string;
  batch_id: string;
  position: number | null;
  raw_text: string | null;
  product_id: string | null;
  match_confidence: string | number | null;
  quantity: string | number;
  unit: string;
  price_chf: string | number | null;
  storage: string | null;
  suggested_expires_at: string | null;
  expiry_source: string;
  accepted: boolean;
  products: { name: string } | null;
}

function num(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" ? value : Number(value);
}

function toBatch(row: BatchRow): IntakeBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    source: row.source as IntakeSource,
    status: row.status as IntakeStatus,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

function toLine(row: LineRow): IntakeLine {
  return {
    id: row.id,
    batchId: row.batch_id,
    position: row.position,
    rawText: row.raw_text,
    productId: row.product_id,
    productName: row.products?.name ?? null,
    matchConfidence: num(row.match_confidence),
    quantity: num(row.quantity) ?? 0,
    unit: row.unit as Unit,
    priceChf: num(row.price_chf),
    storage: (row.storage as StorageLocation | null) ?? null,
    suggestedExpiresAt: row.suggested_expires_at,
    expirySource: row.expiry_source as ExpirySource,
    accepted: row.accepted,
  };
}

const BATCH_COLUMNS =
  "id, household_id, source, status, created_at, confirmed_at";
const LINE_COLUMNS =
  "id, batch_id, position, raw_text, product_id, match_confidence, " +
  "quantity, unit, price_chf, storage, suggested_expires_at, " +
  "expiry_source, accepted, products(name)";

/* -------------------------------------------------------------------------
 * Entwuerfe
 * ---------------------------------------------------------------------- */

export async function createBatch(
  householdId: string,
  source: IntakeSource,
): Promise<IntakeResult<IntakeBatch>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_batches")
    .insert({ household_id: householdId, source })
    .select(BATCH_COLUMNS)
    .single();

  if (error) return failure(error);
  return { ok: true, data: toBatch(data as unknown as BatchRow) };
}

/**
 * Findet den offenen Entwurf eines Haushalts oder legt einen an.
 *
 * Damit bleibt das Erfassen ueber einen Seitenwechsel oder einen
 * Verbindungsabbruch hinweg bestehen: Wer zurueckkommt, findet seine
 * bisher erfassten Zeilen vor, statt von vorn anzufangen.
 */
export async function findOrCreateOpenBatch(
  householdId: string,
  source: IntakeSource = "manual",
): Promise<IntakeResult<IntakeBatch>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_batches")
    .select(BATCH_COLUMNS)
    .eq("household_id", householdId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return failure(error);
  if (data) return { ok: true, data: toBatch(data as unknown as BatchRow) };

  return createBatch(householdId, source);
}

export async function getBatch(
  batchId: string,
): Promise<IntakeResult<IntakeBatch | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_batches")
    .select(BATCH_COLUMNS)
    .eq("id", batchId)
    .maybeSingle();

  if (error) return failure(error);
  return { ok: true, data: data ? toBatch(data as unknown as BatchRow) : null };
}

export async function listLines(
  batchId: string,
): Promise<IntakeResult<readonly IntakeLine[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_lines")
    .select(LINE_COLUMNS)
    .eq("batch_id", batchId)
    .order("position", { ascending: true });

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as LineRow[]).map(toLine) };
}

/* -------------------------------------------------------------------------
 * Zeilen
 * ---------------------------------------------------------------------- */

export interface NewIntakeLine {
  readonly batchId: string;
  readonly rawText: string;
  readonly productId: string | null;
  readonly matchConfidence: number | null;
  readonly quantity: number;
  readonly unit: Unit;
  readonly storage: StorageLocation | null;
  readonly suggestedExpiresAt: string | null;
  readonly expirySource: ExpirySource;
  /**
   * Ob die Zeile im Pruef-Schritt vorangehakt ist. Fehlt der Wert, gilt
   * true — die Schnelleingabe hat immer einen bewussten Nutzer dahinter.
   */
  readonly accepted?: boolean;
  readonly priceChf?: number | null;
}

/**
 * Haengt eine Zeile an den Entwurf.
 *
 * `position` wird bewusst nicht mitgegeben: Ein Trigger vergibt sie
 * fortlaufend. Der Client soll nicht erst die hoechste Position abfragen
 * muessen — das waere ein zusaetzlicher Rundlauf in genau dem Ablauf, der
 * unter zehn Sekunden bleiben soll.
 */
export async function addLine(
  input: NewIntakeLine,
): Promise<IntakeResult<IntakeLine>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_lines")
    .insert({
      batch_id: input.batchId,
      raw_text: input.rawText,
      product_id: input.productId,
      match_confidence: input.matchConfidence,
      quantity: input.quantity,
      unit: input.unit,
      storage: input.storage,
      suggested_expires_at: input.suggestedExpiresAt,
      expiry_source: input.expirySource,
      accepted: true,
    })
    .select(LINE_COLUMNS)
    .single();

  if (error) return failure(error);
  return { ok: true, data: toLine(data as unknown as LineRow) };
}

/**
 * Haengt MEHRERE Zeilen in EINER Anweisung an den Entwurf.
 *
 * Bei einem Bon mit 34 Zeilen spart das 33 Rundgaenge zur Datenbank. Die
 * Reihenfolge bleibt erhalten, weil PostgREST die eingefuegten Zeilen in
 * der uebergebenen Reihenfolge zurueckgibt und der Positions-Trigger sie
 * in dieser Reihenfolge durchnummeriert.
 *
 * `accepted` kommt hier von aussen und ist NICHT immer true: Zeilen, deren
 * Zuordnung unsicher ist, kommen ungehakt in den Pruef-Schritt. Das ist der
 * Kern der Lehre aus der Messung — ein falscher Treffer, der schon
 * vorangehakt ist, wird uebersehen.
 */
export async function addLines(
  lines: readonly NewIntakeLine[],
): Promise<IntakeResult<readonly IntakeLine[]>> {
  if (lines.length === 0) return { ok: true, data: [] };

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("intake_lines")
    .insert(
      lines.map((l) => ({
        batch_id: l.batchId,
        raw_text: l.rawText,
        product_id: l.productId,
        match_confidence: l.matchConfidence,
        quantity: l.quantity,
        unit: l.unit,
        storage: l.storage,
        suggested_expires_at: l.suggestedExpiresAt,
        expiry_source: l.expirySource,
        accepted: l.accepted ?? true,
        price_chf: l.priceChf ?? null,
      })),
    )
    .select(LINE_COLUMNS);

  if (error) return failure(error);
  return { ok: true, data: (data as unknown as LineRow[]).map(toLine) };
}

export async function updateLine(
  lineId: string,
  patch: {
    readonly quantity?: number;
    readonly unit?: Unit;
    readonly storage?: StorageLocation | null;
    readonly suggestedExpiresAt?: string | null;
    readonly expirySource?: ExpirySource;
    readonly accepted?: boolean;
  },
): Promise<IntakeResult<null>> {
  const supabase = await createSupabaseServerClient();

  const row: Record<string, unknown> = {};
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.storage !== undefined) row.storage = patch.storage;
  if (patch.suggestedExpiresAt !== undefined) {
    row.suggested_expires_at = patch.suggestedExpiresAt;
    // Ein von Hand gesetztes Datum ist keine Schaetzung mehr.
    row.expiry_source = patch.suggestedExpiresAt ? "manual" : "none";
  }
  if (patch.expirySource !== undefined) row.expiry_source = patch.expirySource;
  if (patch.accepted !== undefined) row.accepted = patch.accepted;

  if (Object.keys(row).length === 0) return { ok: true, data: null };

  const { error } = await supabase
    .from("intake_lines")
    .update(row)
    .eq("id", lineId);

  if (error) return failure(error);
  return { ok: true, data: null };
}

export async function removeLine(lineId: string): Promise<IntakeResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("intake_lines")
    .delete()
    .eq("id", lineId);

  if (error) return failure(error);
  return { ok: true, data: null };
}

/* -------------------------------------------------------------------------
 * Abschluss
 * ---------------------------------------------------------------------- */

/**
 * Bestaetigt den Entwurf: aus den angenommenen Zeilen werden Bestandsartikel.
 *
 * Die Funktion gibt `setof inventory_items` zurueck — PostgREST liefert
 * dafuer ein ARRAY. Kein `.single()`.
 */
export async function confirmBatch(
  batchId: string,
): Promise<IntakeResult<number>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("confirm_intake_batch", {
    p_batch_id: batchId,
  });

  if (error) return failure(error);
  return { ok: true, data: Array.isArray(data) ? data.length : 0 };
}

/**
 * Verwirft den Entwurf. Gibt `intake_batches` zurueck, also ein OBJEKT.
 */
export async function discardBatch(
  batchId: string,
): Promise<IntakeResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("discard_intake_batch", {
    p_batch_id: batchId,
  });

  if (error) return failure(error);
  return { ok: true, data: null };
}
