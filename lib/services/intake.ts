import "server-only";

import {
  createHouseholdProduct,
  loadShelfLifeRulesForMany,
  saveEstimatedShelfLife,
  searchProductsForMany,
  type CatalogProduct,
} from "@/lib/data/catalog";
import {
  addLine,
  addLines,
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
import {
  assignLine,
  categoryForShelfLife,
  productIdOf,
  type AssignCandidate,
} from "@/lib/domain/assign";
import { computeExpiry } from "@/lib/domain/compute-expiry";
import { formatIsoDate } from "@/lib/domain/date";
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

/**
 * Wie viele Haltbarkeits-Schaetzungen ein einzelner Stapel hoechstens
 * ausloest.
 *
 * Die Tagesobergrenze aus Konzept 7.5 liegt bei 50 Aufrufen. Ein Bon mit 34
 * Zeilen, von denen die Haelfte unbekannt ist, wuerde davon ein Drittel
 * verbrauchen — nach drei Bons waere der Tag vorbei. Zehn pro Stapel reicht
 * fuer die wirklich unbekannten Artikel und laesst Luft fuer die
 * Schnelleingabe.
 *
 * Was darueber hinausgeht, bekommt kein geschaetztes Datum — die Zeile wird
 * trotzdem erfasst. Eine erschoepfte Obergrenze darf keinen Ablauf
 * abbrechen, der auch ohne sie sinnvoll ist.
 */
export const MAX_ESTIMATES_PER_BATCH = 10;

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
  /**
   * Ob die Zeile im Pruef-Schritt vorangehakt wird.
   *
   * Nicht immer true — das ist die Lehre aus der Messung an echten Bons:
   * Sechs von 23 Zuordnungen waren falsch, und eine falsche Zuordnung, die
   * schon vorangehakt ist, wird uebersehen. Siehe lib/domain/assign.ts.
   */
  readonly accepted: boolean;
  /** Warum nur ein Vorschlag — fuer die Anzeige im Pruef-Schritt. */
  readonly reason: "low_confidence" | "category_conflict" | null;
  readonly priceChf: number | null;
}

export interface PrepareLineInput {
  readonly rawText: string;
  readonly quantity?: number;
  readonly unit?: string;
  readonly storage?: StorageLocation | null;
  /**
   * Kategorie-Hinweis von aussen. Beim Bon liefert ihn das Sprachmodell,
   * das die Zeile im Zusammenhang gelesen hat; bei der Schnelleingabe gibt
   * es keinen.
   */
  readonly categoryId?: string | null;
  readonly priceChf?: number | null;
}

export interface PrepareInput extends PrepareLineInput {
  readonly householdId: string;
}

/* -------------------------------------------------------------------------
 * Die Kette, fuer viele Zeilen auf einmal
 * ---------------------------------------------------------------------- */

/**
 * Bereitet MEHRERE Zeilen vor, mit einem Rundgang pro Schritt statt pro
 * Zeile.
 *
 * ======================================================================
 * WARUM DAS DIE EINZIGE ERNSTHAFTE FASSUNG IST
 * ======================================================================
 * Die erste Umsetzung verarbeitete genau eine Zeile und machte dabei PRO
 * ZEILE: eine Mitgliedschaftspruefung, eine Katalogabfrage, eine Abfrage
 * der Haltbarkeitsregeln und im Fehlfall einen Aufruf des Sprachmodells
 * samt Rueckschreiben in den Katalog.
 *
 * Ein echter Migros-Bon hat 34 Zeilen. Das waeren 34 Mitgliedschafts-
 * pruefungen, 34 Katalogabfragen und bis zu 34 Modellaufrufe — die
 * Kostenbremse von 50 Aufrufen pro Tag waere nach EINEM Bon fast leer, und
 * die Rundgaenge allein wuerden das Zehn-Sekunden-Ziel sprengen.
 *
 * Hier gilt deshalb: eine Mitgliedschaftspruefung, eine Katalogabfrage fuer
 * alle Zeilen, eine Regelabfrage fuer alle Zeilen, und Modellaufrufe nur
 * fuer das, was uebrig bleibt — gebuendelt und mit hartem Deckel.
 *
 * ======================================================================
 * UND DER BEHOBENE FEHLER
 * ======================================================================
 * Die erste Fassung hatte die ganze Haltbarkeits-Kette in einem
 * `if (product)`-Zweig. Zeilen ohne Katalogtreffer bekamen damit GAR KEIN
 * Datum — und laut Messung ist das bei echten Bons jede zweite Zeile. Jetzt
 * laeuft die Kette auch mit blosser Kategorie, denn genau dafuer gibt es
 * das Auffangnetz aus 46 Kategorieregeln (Konzept 4.3).
 */
export async function prepareLines(input: {
  readonly householdId: string;
  readonly lines: readonly PrepareLineInput[];
}): Promise<HouseholdResult<readonly PreparedLine[]>> {
  const membership = await requireMembership(input.householdId);
  if (!membership.ok) return membership;

  const roh = input.lines
    .map((l) => ({ ...l, rawText: l.rawText.trim() }))
    .filter((l) => l.rawText.length > 0);

  if (roh.length === 0) return { ok: true, data: [] };

  // 1. EINE Katalogabfrage fuer alle Zeilen.
  const gefunden = await searchProductsForMany(
    roh.map((l) => normalizeName(l.rawText)),
  );
  if (!gefunden.ok) return gefunden;

  const kandidaten: AssignCandidate[] = gefunden.data.map((p) => ({
    id: p.id,
    name: p.name,
    normalizedName: p.normalizedName,
    categoryId: p.categoryId,
  }));
  const produktNachId = new Map(gefunden.data.map((p) => [p.id, p]));

  // 2. Zuordnung je Zeile — reine Fachlogik, kein Netzzugriff.
  const zugeordnet = roh.map((l) => ({
    eingabe: l,
    assignment: assignLine({
      rawText: l.rawText,
      candidates: kandidaten,
      categoryHint: l.categoryId ?? null,
    }),
  }));

  // 3. EINE Regelabfrage fuer alle beteiligten Produkte und Kategorien.
  const produktIds = zugeordnet
    .map((z) => productIdOf(z.assignment))
    .filter((v): v is string => v !== null);
  const kategorieIds = zugeordnet
    .map((z) => categoryForShelfLife(z.assignment))
    .filter((v): v is string => v !== null);

  const regeln = await loadShelfLifeRulesForMany(produktIds, kategorieIds);
  if (!regeln.ok) return regeln;

  const heute = today();
  const vorbereitet: PreparedLine[] = [];

  // 4. Haltbarkeit und Ablaufdatum je Zeile, wieder ohne Netzzugriff.
  const offeneSchaetzungen: {
    index: number;
    productId: string;
    name: string;
    categoryName: string | null;
    storage: StorageLocation;
  }[] = [];

  for (const { eingabe, assignment } of zugeordnet) {
    const produktId = productIdOf(assignment);
    const produkt = produktId ? (produktNachId.get(produktId) ?? null) : null;
    const kategorieId = categoryForShelfLife(assignment);

    const rohEinheit = eingabe.unit ?? produkt?.defaultUnit ?? "piece";
    const { qty, unit } = normalizeQuantity(eingabe.quantity ?? 1, rohEinheit);

    // Der Vorratsschrank ist die harmloseste Annahme: kuerzeste Haltbarkeit,
    // also eher zu frueh als zu spaet gewarnt.
    const storage: StorageLocation =
      eingabe.storage ?? produkt?.defaultStorage ?? "pantry";

    const shelfLife = resolveShelfLife({
      productId: produktId,
      categoryId: kategorieId,
      householdId: input.householdId,
      storage,
      rules: regeln.data,
    });

    const expiry = computeExpiry({ addedOn: heute, shelfLife });

    const zeile: PreparedLine = {
      rawText: eingabe.rawText,
      product: produkt,
      matchConfidence:
        assignment.kind === "product" || assignment.kind === "suggestion"
          ? assignment.confidence
          : null,
      quantity: qty,
      unit,
      storage,
      expiresAt: expiry.expiresAt,
      expirySource: expiry.source,
      accepted: assignment.accepted,
      reason: assignment.kind === "suggestion" ? assignment.reason : null,
      priceChf: eingabe.priceChf ?? null,
    };

    vorbereitet.push(zeile);

    // Nur wo die Kette NICHTS geliefert hat und ein Produkt bekannt ist,
    // kommt das Sprachmodell in Frage. Ohne Produkt gibt es nichts, wohin
    // man die Schaetzung zurueckschreiben koennte.
    if (!shelfLife && produkt) {
      offeneSchaetzungen.push({
        index: vorbereitet.length - 1,
        productId: produkt.id,
        name: produkt.name,
        categoryName: produkt.categoryName,
        storage,
      });
    }
  }

  // 5. Schaetzungen gebuendelt, mit hartem Deckel. Der Deckel wird VOR dem
  //    Aufruf geprueft, nicht aus einer Fehlerantwort gelesen — und eine
  //    erschoepfte Obergrenze darf die Erfassung nicht abbrechen, nur das
  //    Datum offen lassen.
  const deckel = Math.min(offeneSchaetzungen.length, MAX_ESTIMATES_PER_BATCH);

  for (const offen of offeneSchaetzungen.slice(0, deckel)) {
    const estimate = await suggestShelfLife({
      productName: offen.name,
      categoryName: offen.categoryName,
      storage: offen.storage,
    });
    if (!estimate) continue;

    const shelfLife = estimateAsShelfLife(
      estimate.daysUnopened,
      estimate.daysOpened,
    );
    const expiry = computeExpiry({ addedOn: heute, shelfLife });

    vorbereitet[offen.index] = {
      ...vorbereitet[offen.index]!,
      expiresAt: expiry.expiresAt,
      expirySource: expiry.source,
    };

    await saveEstimatedShelfLife({
      productId: offen.productId,
      storage: offen.storage,
      daysUnopened: estimate.daysUnopened,
      daysOpened: estimate.daysOpened,
    });
  }

  return { ok: true, data: vorbereitet };
}

/**
 * Eine einzelne Zeile vorbereiten.
 *
 * Duenner Aufsatz auf `prepareLines`, damit die Schnelleingabe unveraendert
 * weiterlaeuft und es keine zweite Fassung derselben Kette gibt.
 */
export async function prepareLine(
  input: PrepareInput,
): Promise<HouseholdResult<PreparedLine>> {
  const result = await prepareLines({
    householdId: input.householdId,
    lines: [input],
  });
  if (!result.ok) return result;

  const erste = result.data[0];
  return erste ? { ok: true, data: erste } : householdFailure("empty_input");
}

/* -------------------------------------------------------------------------
 * Ablegen
 * ---------------------------------------------------------------------- */

function zuZeile(batchId: string, p: PreparedLine) {
  return {
    batchId,
    rawText: p.rawText,
    productId: p.product?.id ?? null,
    matchConfidence: p.matchConfidence,
    quantity: p.quantity,
    unit: p.unit,
    storage: p.storage,
    suggestedExpiresAt: p.expiresAt,
    expirySource: p.expirySource,
    accepted: p.accepted,
    priceChf: p.priceChf,
  };
}

async function guardBatch(
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

/** Legt eine vorbereitete Zeile im Entwurf ab. */
export async function addPreparedLine(
  householdId: string,
  batchId: string,
  prepared: PreparedLine,
): Promise<HouseholdResult<IntakeLine>> {
  const guard = await guardBatch(householdId, batchId);
  if (!guard.ok) return guard;

  return addLine(zuZeile(batchId, prepared));
}

/** Legt viele vorbereitete Zeilen in EINER Anweisung ab. */
export async function addPreparedLines(
  householdId: string,
  batchId: string,
  prepared: readonly PreparedLine[],
): Promise<HouseholdResult<readonly IntakeLine[]>> {
  const guard = await guardBatch(householdId, batchId);
  if (!guard.ok) return guard;

  return addLines(prepared.map((p) => zuZeile(batchId, p)));
}

/** Der uebliche Weg bei einer Zeile: vorbereiten und gleich ablegen. */
export async function captureLine(
  input: PrepareInput & { readonly batchId: string },
): Promise<HouseholdResult<IntakeLine>> {
  const prepared = await prepareLine(input);
  if (!prepared.ok) return prepared;

  return addPreparedLine(input.householdId, input.batchId, prepared.data);
}

/**
 * Der Weg beim Bon: viele Zeilen vorbereiten und in einem Zug ablegen.
 */
export async function captureLines(input: {
  readonly householdId: string;
  readonly batchId: string;
  readonly lines: readonly PrepareLineInput[];
}): Promise<HouseholdResult<readonly IntakeLine[]>> {
  const prepared = await prepareLines({
    householdId: input.householdId,
    lines: input.lines,
  });
  if (!prepared.ok) return prepared;

  return addPreparedLines(input.householdId, input.batchId, prepared.data);
}

/* -------------------------------------------------------------------------
 * Zeilen bearbeiten
 * ---------------------------------------------------------------------- */

export async function changeLine(
  householdId: string,
  batchId: string,
  lineId: string,
  patch: Parameters<typeof updateLine>[1],
): Promise<HouseholdResult<null>> {
  const guard = await guardBatch(householdId, batchId);
  if (!guard.ok) return guard;

  return updateLine(lineId, patch);
}

export async function dropLine(
  householdId: string,
  batchId: string,
  lineId: string,
): Promise<HouseholdResult<null>> {
  const guard = await guardBatch(householdId, batchId);
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
  const guard = await guardBatch(householdId, batchId);
  if (!guard.ok) return guard;

  return confirmBatch(batchId);
}

export async function discardDraft(
  householdId: string,
  batchId: string,
): Promise<HouseholdResult<null>> {
  const guard = await guardBatch(householdId, batchId);
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
