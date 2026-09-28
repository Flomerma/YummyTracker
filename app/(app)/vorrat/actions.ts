"use server";

import { revalidatePath } from "next/cache";

import { currentContext } from "@/lib/services/current";
import {
  correctExpiry,
  markOpened,
  resolveItem,
} from "@/lib/services/inventory";

import type { VorratState } from "./state";

/**
 * Die drei Schnellaktionen aus Konzept 4.2, als Server-Aktionen.
 *
 * Der Haushalt kommt aus der Sitzung, nicht aus dem Formular. Kaeme er aus
 * dem Formular, koennte man ihn faelschen — die Dienstschicht wuerde es
 * zwar bemerken, aber eine Kennung, die nie aus dem Browser kommt, kann
 * auch nie manipuliert sein.
 */
async function householdId(): Promise<string | null> {
  const context = await currentContext();
  return context.state === "ready" ? context.household.id : null;
}

function refresh() {
  revalidatePath("/vorrat");
}

export async function artikelErledigenAction(
  _previous: VorratState,
  formData: FormData,
): Promise<VorratState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const itemId = String(formData.get("itemId") ?? "");
  const raw = String(formData.get("status") ?? "");
  if (raw !== "consumed" && raw !== "discarded") {
    return { status: "error", message: "Unbekannte Aktion." };
  }

  const result = await resolveItem(household, itemId, raw);
  if (!result.ok) return { status: "error", message: result.message };

  refresh();
  return {
    status: "done",
    message:
      raw === "consumed"
        ? "Als gegessen vermerkt."
        : "Als weggeworfen vermerkt.",
  };
}

export async function ablaufKorrigierenAction(
  _previous: VorratState,
  formData: FormData,
): Promise<VorratState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const itemId = String(formData.get("itemId") ?? "");
  const datum = String(formData.get("expiresAt") ?? "").trim();

  const result = await correctExpiry(household, itemId, datum || null);
  if (!result.ok) return { status: "error", message: result.message };

  refresh();
  return { status: "done", message: "Datum aktualisiert." };
}

export async function artikelGeoeffnetAction(
  _previous: VorratState,
  formData: FormData,
): Promise<VorratState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const result = await markOpened(
    household,
    String(formData.get("itemId") ?? ""),
  );
  if (!result.ok) return { status: "error", message: result.message };

  refresh();
  return { status: "done", message: "Als geöffnet vermerkt." };
}
