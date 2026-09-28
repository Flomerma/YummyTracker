"use server";

import { redirect } from "next/navigation";

import { createHousehold, joinHousehold } from "@/lib/services/household";

import type { EinstiegState } from "./state";

/**
 * Legt einen Haushalt an und geht direkt in den Vorrat.
 *
 * `redirect()` steht bewusst AUSSERHALB jeder Fehlerbehandlung: Es wirkt
 * ueber eine Ausnahme, die Next.js abfaengt. Stuende es in einem try-Block,
 * schluckte der catch die Umleitung und es passierte nichts.
 */
export async function haushaltAnlegenAction(
  _previous: EinstiegState,
  formData: FormData,
): Promise<EinstiegState> {
  const result = await createHousehold({
    name: String(formData.get("name") ?? ""),
    displayName: String(formData.get("anzeigename") ?? "") || null,
  });

  if (!result.ok) return { status: "error", message: result.message };

  redirect("/vorrat");
}

/**
 * Tritt ueber einen Einladungsschluessel bei.
 *
 * Das Feld nimmt den ganzen eingefuegten Link genauso an wie den blossen
 * Schluessel — `joinHousehold` siebt das auseinander. Wer einen Link aus
 * einem Chat kopiert, kopiert selten nur den hinteren Teil davon.
 */
export async function haushaltBeitretenAction(
  _previous: EinstiegState,
  formData: FormData,
): Promise<EinstiegState> {
  const result = await joinHousehold({
    token: String(formData.get("schluessel") ?? ""),
    displayName: String(formData.get("anzeigename") ?? "") || null,
  });

  if (!result.ok) return { status: "error", message: result.message };

  redirect("/vorrat");
}
