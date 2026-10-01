"use server";

import { revalidatePath } from "next/cache";

import type { StorageLocation } from "@/lib/domain/types";
import { currentContext } from "@/lib/services/current";
import { loadOpenDraft } from "@/lib/services/intake";
import {
  captureScan,
  resolveUnknownScan,
  type ScanOutcome,
} from "@/lib/services/scan";

/**
 * Server-Aktionen fuer den Barcode-Scan.
 *
 * Eigene Datei neben actions.ts, weil der Scan anders aufgerufen wird: nicht
 * aus einem Formular, sondern programmatisch aus der Scanner-Komponente,
 * mit einem Objekt statt FormData.
 *
 * Der Haushalt kommt aus der Sitzung, nicht vom Aufrufer. Kaeme er aus dem
 * Browser, koennte man ihn faelschen — die Dienstschicht wuerde es bemerken,
 * aber eine Kennung, die nie aus dem Browser kommt, kann auch nie
 * manipuliert sein.
 */

/**
 * Ein Fehler, der nicht als Ergebnis zurueckkam, sondern geworfen wurde.
 *
 * Er wird ins Serverprotokoll geschrieben — auf Vercel unter Logs zu sehen —
 * und als Satz zurueckgegeben, statt die Server-Aktion scheitern zu lassen.
 * Scheitert sie, ersetzt Next.js die Meldung in der Produktion durch eine
 * allgemeine, und die eigentliche Ursache ist nirgends mehr zu finden.
 *
 * So wurde der erste echte Fehler gefunden: Ein fehlender Schluessel im
 * Admin-Client warf eine Ausnahme mit einem klaren Satz — den aber niemand
 * zu sehen bekam, weil der Dialog stattdessen endlos lud.
 */
function unerwartet(
  wo: string,
  error: unknown,
): { readonly ok: false; readonly message: string } {
  console.error(`[${wo}]`, error);
  return {
    ok: false,
    message:
      "Das hat auf dem Server nicht geklappt. Versuch es nochmal, oder tippe " +
      "den Namen in der Schnelleingabe ein.",
  };
}

export type ScanResult =
  | { readonly ok: true; readonly outcome: ScanOutcome }
  | { readonly ok: false; readonly message: string };

async function kontext(): Promise<
  { householdId: string; batchId: string } | { error: string }
> {
  const context = await currentContext();
  if (context.state !== "ready") return { error: "Nicht angemeldet." };

  const draft = await loadOpenDraft(context.household.id);
  if (!draft.ok) return { error: draft.message };

  return { householdId: context.household.id, batchId: draft.data.batch.id };
}

/**
 * Wertet einen gelesenen Code aus.
 *
 * `offSuggestion` kommt vom Browser, der Open Food Facts selbst gefragt hat
 * — vom Geraet aus gilt dessen Ratenlimit pro Nutzer, vom Server aus fuer
 * die ganze Anwendung. Der Ablauf ist deshalb zweistufig: erst ohne
 * Vorschlag (der eigene Katalog und die gelernten Zuordnungen kosten keine
 * Fremdabfrage), und nur wenn das nichts findet, ein zweiter Aufruf mit dem,
 * was Open Food Facts wusste.
 */
export async function scanAction(input: {
  readonly ean: string;
  readonly storage?: StorageLocation | null;
  readonly offSuggestion?: {
    readonly name: string;
    readonly categoryTags: readonly string[];
    readonly quantity?: string | null;
  } | null;
}): Promise<ScanResult> {
  const k = await kontext();
  if ("error" in k) return { ok: false, message: k.error };

  let result: Awaited<ReturnType<typeof captureScan>>;
  try {
    result = await captureScan({
      householdId: k.householdId,
      batchId: k.batchId,
      ean: input.ean,
      storage: input.storage ?? null,
      offSuggestion: input.offSuggestion ?? null,
    });
  } catch (error) {
    return unerwartet("scanAction", error);
  }

  if (!result.ok) return { ok: false, message: result.message };
  if (result.data.kind === "added") revalidatePath("/erfassen");
  return { ok: true, outcome: result.data };
}

export type ResolveResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly message: string };

/**
 * Ordnet einen unbekannten Code einmal von Hand zu.
 *
 * Das ist der eigentliche Wert des Scanners: Die Zuordnung wird gemerkt, und
 * derselbe Code — bei Waagenetiketten derselbe Artikel, egal wie schwer das
 * Stueck ist — trifft beim naechsten Einkauf sofort.
 */
export async function scanZuordnenAction(input: {
  readonly ean: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly storage?: StorageLocation | null;
  /**
   * Preis, den der Nutzer im Dialog gesehen und bestaetigt hat — bei
   * Waagenetiketten aus dem Code vorbelegt. Nur was hier ankommt, zaehlt in
   * der Weggeworfen-Auswertung; eine abgeleitete Zahl wandert nie ungesehen
   * hinein.
   */
  readonly priceChf?: number | null;
}): Promise<ResolveResult> {
  const name = input.name.trim();
  if (name.length === 0) {
    return { ok: false, message: "Bitte einen Namen eingeben." };
  }

  const k = await kontext();
  if ("error" in k) return { ok: false, message: k.error };

  let result: Awaited<ReturnType<typeof resolveUnknownScan>>;
  try {
    result = await resolveUnknownScan({
      householdId: k.householdId,
      batchId: k.batchId,
      ean: input.ean,
      name,
      categoryId: input.categoryId,
      storage: input.storage ?? null,
      priceChf:
        typeof input.priceChf === "number" &&
        Number.isFinite(input.priceChf) &&
        input.priceChf >= 0
          ? input.priceChf
          : null,
    });
  } catch (error) {
    return unerwartet("scanZuordnenAction", error);
  }

  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/erfassen");
  return { ok: true, name };
}
