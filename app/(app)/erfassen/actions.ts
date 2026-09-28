"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { StorageLocation } from "@/lib/domain/types";
import { currentContext } from "@/lib/services/current";
import {
  captureLine,
  changeLine,
  confirmDraft,
  discardDraft,
  dropLine,
  loadOpenDraft,
} from "@/lib/services/intake";

import type { ErfassenState } from "./state";

async function householdId(): Promise<string | null> {
  const context = await currentContext();
  return context.state === "ready" ? context.household.id : null;
}

function istLagerort(value: string): value is StorageLocation {
  return value === "fridge" || value === "freezer" || value === "pantry";
}

/**
 * Eine Zeile erfassen — der Ablauf, an dem das Projekt haengt.
 *
 * EIN Rundgang zum Server erledigt alles: Produkt zuordnen, Menge
 * vereinheitlichen, Lagerort und Ablaufdatum vorschlagen, Zeile anlegen.
 * Jeder zusaetzliche Rundgang — erst suchen, dann auswaehlen, dann
 * bestaetigen — kostet Sekunden, und zehn davon hat der ganze Vorgang.
 */
export async function zeileErfassenAction(
  _previous: ErfassenState,
  formData: FormData,
): Promise<ErfassenState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const text = String(formData.get("text") ?? "").trim();
  if (text.length === 0) return { status: "idle" };

  const draft = await loadOpenDraft(household);
  if (!draft.ok) return { status: "error", message: draft.message };

  const mengeRoh = String(formData.get("menge") ?? "1").replace(",", ".");
  const menge = Number.parseFloat(mengeRoh);
  const ortRoh = String(formData.get("ort") ?? "");

  const result = await captureLine({
    householdId: household,
    batchId: draft.data.batch.id,
    rawText: text,
    quantity: Number.isFinite(menge) && menge > 0 ? menge : 1,
    storage: istLagerort(ortRoh) ? ortRoh : null,
  });

  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/erfassen");

  return {
    status: "added",
    label: result.data.productName ?? text,
    matched: result.data.productId !== null,
    expiresAt: result.data.suggestedExpiresAt,
  };
}

export async function zeileEntfernenAction(formData: FormData): Promise<void> {
  const household = await householdId();
  if (!household) return;

  const batchId = String(formData.get("batchId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");

  await dropLine(household, batchId, lineId);
  revalidatePath("/erfassen");
}

export async function zeileDatumAction(formData: FormData): Promise<void> {
  const household = await householdId();
  if (!household) return;

  const batchId = String(formData.get("batchId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  const datum = String(formData.get("expiresAt") ?? "").trim();

  await changeLine(household, batchId, lineId, {
    suggestedExpiresAt: datum || null,
  });
  revalidatePath("/erfassen");
}

/**
 * Uebernimmt den Entwurf in den Vorrat und geht dorthin.
 *
 * `redirect()` steht ausserhalb jeder Fehlerbehandlung — es wirkt ueber
 * eine Ausnahme, die ein catch sonst verschlucken wuerde.
 */
export async function entwurfUebernehmenAction(
  formData: FormData,
): Promise<void> {
  const household = await householdId();
  if (!household) return;

  const batchId = String(formData.get("batchId") ?? "");
  const result = await confirmDraft(household, batchId);
  if (!result.ok) return;

  revalidatePath("/vorrat");
  revalidatePath("/erfassen");
  redirect("/vorrat");
}

export async function entwurfVerwerfenAction(
  formData: FormData,
): Promise<void> {
  const household = await householdId();
  if (!household) return;

  await discardDraft(household, String(formData.get("batchId") ?? ""));
  revalidatePath("/erfassen");
}
