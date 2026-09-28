import "server-only";

import {
  createHouseholdProduct,
  loadShelfLifeRules,
  saveEstimatedShelfLife,
  searchProducts,
  type CatalogProduct,
} from "@/lib/data/catalog";
import {
  addLine,
  confirmBatch,
  discardBatch,
  findOrCreateOpenBatch,
  getBatch,
  listLines,
  removeLine,
  updateLine,
  type IntakeBatch,
  type IntakeLine,
} from "@/lib/data/intake";
import { suggestShelfLife } from "@/lib/ai/shelf-life";
import { computeExpiry } from "@/lib/domain/compute-expiry";
import { formatIsoDate } from "@/lib/domain/date";
import { matchProduct } from "@/lib/domain/match-product";
import { normalizeName } from "@/lib/domain/normalize-name";
import { normalizeQuantity } from "@/lib/domain/normalize-quantity";
import { resolveShelfLife } from "@/lib/domain/resolve-shelf-life";
import type {
  ExpirySource,
  ShelfLifeResult,
  StorageLocation,
  Unit,
} from "@/lib/domain/types";
import {
  requireMembership,
  type HouseholdResult,
} from "@/lib/services/household";
import { householdFailure } from "@/lib/data/households";

/**
 * Der Anwendungsfall "etwas erfassen".
 *
 * Hier laeuft die Kette aus Konzept 4.3 zusammen. Die einzelnen Glieder
 * liegen bewusst woanders: die Regeln in lib/domain (rein und testbar),
 * die Abfragen in lib/data (die einzige Stelle mit Supabase). Dieses Modul
 * verbindet sie und traegt die zweite Schutzebene (Konzept 7.4) — jede
 * Funktion prueft die Zugehoerigkeit selbst, bevor irgendetwas passiert.
 *
 * ----------------------------------------------------------------------
 * DAS ERFOLGSKRITERIUM IST EINE ZAHL
 * ----------------------------------------------------------------------
 * Ein Artikel in unter zehn Sekunden. Daran haengt das ganze Projekt: Wenn
 * das Erfassen sich zaeh anfuehlt, benutzt es niemand, und dann gibt es im
 * Januar keine Daten. Deshalb liefert `prepareLine` alles auf einmal —
 * Produkt zugeordnet, Menge vereinheitlicht, Lagerort und Ablaufdatum
 * vorgeschlagen — statt die Oberflaeche nacheinander fragen zu lassen.
 */

function today(): string {
  return formatIsoDate(Date.now());
}

/* -------------------------------------------------------------------------
 * Entwurf laden
 * ---------------------------------------------------------------------- */

export interface Draft {
  readonly batch: IntakeBatch;
  readonly lines: readonly IntakeLine[];
}

/**
 * Der offene Entwurf des Haushalts, notfalls ein neuer.
 *
 * Dass ein angefangener Entwurf bestehen bleibt, ist Absicht: Wer die Seite
 * wechselt oder unterwegs die Verbindung verliert, findet seine Zeilen
 * wieder vor statt von vorn anzufangen.
 */
export async function loadOpenDraft(
  householdId: string,
): Promise<HouseholdResult<Draft>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const batch = await findOrCreateOpenBatch(householdId);
  if (!batch.ok) return batch;

  const lines = await listLines(batch.data.id);
  if (!lines.ok) return lines;

  return { ok: true, data: { batch: batch.data, lines: lines.data } };
}

/* -------------------------------------------------------------------------
 * Die Kette
 * ---------------------------------------------------------------------- */

/**
 * Baut aus der KI-Schaetzung dasselbe Ergebnis, das auch eine Katalogregel
 * liefern wuerde — damit `computeExpiry` nicht wissen muss, woher der Wert
 * stammt. Die Herkunft bleibt in `expirySource` sichtbar.
 */
function estimateAsShelfLife(
  daysUnopened: number,
  daysOpened: number | null,
): ShelfLifeResult {
  const origin = {
    ruleId: "ai-estimate",
    scope: "product" as const,
    ownership: "global" as const,
    ruleSource: "ai" as const,
    storageMatch: "exact" as const,
    expirySource: "ai" as const,
  };

  return {
    unopened: { days: daysUnopened, origin },
    opened: daysOpened === null ? null : { days: daysOpened, origin },
  };
}

export interface PreparedLine {
  readonly rawText: string;
  readonly product: CatalogProduct | null;
  readonly matchConfidence: number | null;
  readonly quantity: number;
  readonly unit: Unit;
  readonly storage: StorageLocation;
  readonly expiresAt: string | null;
  readonly expirySource: ExpirySource;
}

export interface PrepareInput {
  readonly householdId: string;
  readonly rawText: string;
  readonly quantity?: number;
  readonly unit?: string;
  readonly storage?: StorageLocation | null;
}

/**
 * Macht aus einer Eingabe einen vollstaendigen Vorschlag — ohne ihn zu
 * speichern. Getrennt von `addPreparedLine`, damit die Oberflaeche den
 * Vorschlag zeigen kann, bevor er verbindlich wird.
 */
export async function prepareLine(
  input: PrepareInput,
): Promise<HouseholdResult<PreparedLine>> {
  const membership = await requireMembership(input.householdId);
  if (!membership.ok) return membership;

  const rawText = input.rawText.trim();
  if (rawText.length === 0) return householdFailure("empty_input");

  // 1. Produkt zuordnen. Gesucht wird normalisiert, bewertet wird unscharf.
  const normalized = normalizeName(rawText);
  const found = await searchProducts(normalized);
  if (!found.ok) return found;

  const matches = matchProduct(rawText, found.data);
  const best = matches[0] ?? null;
  const product = best
    ? (found.data.find((p) => p.id === best.productId) ?? null)
    : null;

  // 2. Menge und Einheit. Der Katalog kennt die uebliche Einheit; wer etwas
  //    anderes eintippt, ueberschreibt sie.
  const rawUnit = input.unit ?? product?.defaultUnit ?? "piece";
  const { qty, unit } = normalizeQuantity(input.quantity ?? 1, rawUnit);

  // 3. Lagerort. Vorgabe aus dem Katalog, sonst der Vorratsschrank — das
  //    ist die harmloseste Annahme, weil sie die kuerzeste Haltbarkeit
  //    ergibt und damit eher zu frueh als zu spaet warnt.
  const storage: StorageLocation =
    input.storage ?? product?.defaultStorage ?? "pantry";

  // 4. Die Kette: gelernt -> Katalog -> Kategorie.
  let shelfLife: ShelfLifeResult | null = null;

  if (product) {
    const rules = await loadShelfLifeRules(product.id, product.categoryId);
    if (!rules.ok) return rules;

    shelfLife = resolveShelfLife({
      productId: product.id,
      categoryId: product.categoryId,
      householdId: input.householdId,
      storage,
      rules: rules.data,
    });

    // 5. Letztes Glied: schaetzen lassen und das Ergebnis in den Katalog
    //    zurueckschreiben. Schlaegt das fehl, ist das kein Grund, die
    //    Erfassung abzubrechen — dann fehlt eben das Datum.
    if (!shelfLife) {
      const estimate = await suggestShelfLife({
        productName: product.name,
        categoryName: product.categoryName,
        storage,
      });

      if (estimate) {
        shelfLife = estimateAsShelfLife(
          estimate.daysUnopened,
          estimate.daysOpened,
        );
        await saveEstimatedShelfLife({
          productId: product.id,
          storage,
          daysUnopened: estimate.daysUnopened,
          daysOpened: estimate.daysOpened,
        });
      }
    }
  }

  // 6. Aus Haltbarkeit und Zugangsdatum wird ein Ablaufdatum.
  const expiry = computeExpiry({ addedOn: today(), shelfLife });

  return {
    ok: true,
    data: {
      rawText,
      product,
      matchConfidence: best?.confidence ?? null,
      quantity: qty,
      unit,
      storage,
      expiresAt: expiry.expiresAt,
      expirySource: expiry.source,
    },
  };
}

/** Legt den vorbereiteten Vorschlag als Zeile im Entwurf ab. */
export async function addPreparedLine(
  householdId: string,
  batchId: string,
  prepared: PreparedLine,
): Promise<HouseholdResult<IntakeLine>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const batch = await getBatch(batchId);
  if (!batch.ok) return batch;
  if (!batch.data || batch.data.householdId !== householdId) {
    return householdFailure("not_a_member");
  }

  return addLine({
    batchId,
    rawText: prepared.rawText,
    productId: prepared.product?.id ?? null,
    matchConfidence: prepared.matchConfidence,
    quantity: prepared.quantity,
    unit: prepared.unit,
    storage: prepared.storage,
    suggestedExpiresAt: prepared.expiresAt,
    expirySource: prepared.expirySource,
  });
}

/** Der uebliche Weg: vorbereiten und gleich ablegen. */
export async function captureLine(
  input: PrepareInput & { readonly batchId: string },
): Promise<HouseholdResult<IntakeLine>> {
  const prepared = await prepareLine(input);
  if (!prepared.ok) return prepared;

  return addPreparedLine(input.householdId, input.batchId, prepared.data);
}

/* -------------------------------------------------------------------------
 * Zeilen bearbeiten
 * ---------------------------------------------------------------------- */

async function guardBatchOfLine(
  householdId: string,
  batchId: string,
): Promise<HouseholdResult<null>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const batch = await getBatch(batchId);
  if (!batch.ok) return batch;
  if (!batch.data || batch.data.householdId !== householdId) {
    return householdFailure("not_a_member");
  }
  return { ok: true, data: null };
}

export async function changeLine(
  householdId: string,
  batchId: string,
  lineId: string,
  patch: Parameters<typeof updateLine>[1],
): Promise<HouseholdResult<null>> {
  const guard = await guardBatchOfLine(householdId, batchId);
  if (!guard.ok) return guard;

  return updateLine(lineId, patch);
}

export async function dropLine(
  householdId: string,
  batchId: string,
  lineId: string,
): Promise<HouseholdResult<null>> {
  const guard = await guardBatchOfLine(householdId, batchId);
  if (!guard.ok) return guard;

  return removeLine(lineId);
}

/* -------------------------------------------------------------------------
 * Abschluss
 * ---------------------------------------------------------------------- */

/**
 * Uebernimmt den Entwurf in den Vorrat.
 *
 * Ein Doppelklick ist harmlos: confirm_intake_batch() sperrt den Stapel und
 * ist idempotent, ein zweiter Aufruf verdoppelt nichts.
 */
export async function confirmDraft(
  householdId: string,
  batchId: string,
): Promise<HouseholdResult<number>> {
  const guard = await guardBatchOfLine(householdId, batchId);
  if (!guard.ok) return guard;

  return confirmBatch(batchId);
}

export async function discardDraft(
  householdId: string,
  batchId: string,
): Promise<HouseholdResult<null>> {
  const guard = await guardBatchOfLine(householdId, batchId);
  if (!guard.ok) return guard;

  return discardBatch(batchId);
}

/* -------------------------------------------------------------------------
 * Eigenes Produkt
 * ---------------------------------------------------------------------- */

/**
 * Legt ein Produkt an, das nur diesem Haushalt gehoert.
 *
 * Fuer alles, was der Startkatalog nicht kennt und auch nicht global
 * kennen sollte — Selbstgemachtes, Resten, Regionales. Der Name wird hier
 * normalisiert, nicht in der Datenbank: dieselbe Funktion, die den Katalog
 * gefuellt hat, damit die Zuordnung spaeter greift.
 */
export async function addOwnProduct(input: {
  readonly householdId: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly defaultUnit: Unit;
  readonly defaultStorage: StorageLocation | null;
}): Promise<HouseholdResult<CatalogProduct>> {
  const membership = await requireMembership(input.householdId);
  if (!membership.ok) return membership;

  const name = input.name.trim();
  if (name.length === 0) return householdFailure("empty_input");

  return createHouseholdProduct({
    householdId: input.householdId,
    name,
    normalizedName: normalizeName(name),
    categoryId: input.categoryId,
    defaultUnit: input.defaultUnit,
    defaultStorage: input.defaultStorage,
  });
}
