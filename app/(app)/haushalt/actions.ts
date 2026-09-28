"use server";

import { revalidatePath } from "next/cache";

import { currentContext } from "@/lib/services/current";
import {
  createInviteLink,
  removeMember,
  renameMyself,
} from "@/lib/services/household";

import type { HaushaltState } from "./state";

async function householdId(): Promise<string | null> {
  const context = await currentContext();
  return context.state === "ready" ? context.household.id : null;
}

/**
 * Erzeugt eine Einladung.
 *
 * Der Klartext-Schluessel wandert in den Zustand und wird EINMAL angezeigt.
 * Ein zweites Mal geht nicht — in der Datenbank liegt nur sein Hash. Das
 * ist kein Mangel, sondern der Grund, weshalb ein Datenbankleck niemandem
 * Zutritt zu einem Haushalt verschafft.
 */
export async function einladungErzeugenAction(
  _previous: HaushaltState,
  _formData: FormData,
): Promise<HaushaltState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const result = await createInviteLink(household);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/haushalt");
  return {
    status: "invited",
    url: result.data.url,
    expiresAt: result.data.expiresAt,
  };
}

export async function anzeigenameAendernAction(
  _previous: HaushaltState,
  formData: FormData,
): Promise<HaushaltState> {
  const household = await householdId();
  if (!household) return { status: "error", message: "Nicht angemeldet." };

  const result = await renameMyself(
    household,
    String(formData.get("anzeigename") ?? ""),
  );
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath("/haushalt");
  return { status: "done", message: "Anzeigename gespeichert." };
}

export async function mitgliedEntfernenAction(
  formData: FormData,
): Promise<void> {
  const household = await householdId();
  if (!household) return;

  await removeMember(household, String(formData.get("userId") ?? ""));
  revalidatePath("/haushalt");
}
