"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { signInWithPassword, signUpWithPassword } from "@/lib/data/auth";
import {
  isValidEmail,
  normalizeEmail,
  safeNextPath,
  validatePassword,
} from "@/lib/domain/auth";

import type { AnmeldenState } from "./state";

/**
 * Anmelden oder registrieren, je nachdem welcher Knopf gedrueckt wurde.
 *
 * Eine Aktion fuer beides, weil sich nur ein Aufruf unterscheidet — zwei
 * Aktionen waeren zwei Formulare, zwei Zustaende und zweimal dieselbe
 * Pruefung.
 *
 * Es wird KEINE Mail verschickt. Voraussetzung dafuer ist, dass im
 * Supabase-Dashboard unter Authentication > Sign In / Providers > Email
 * die Bestaetigungspflicht ("Confirm email") abgeschaltet ist. Ist sie
 * aktiv, meldet lib/data/auth.ts das ausdruecklich zurueck, statt eine
 * Anmeldung vorzutaeuschen, die keine ist.
 *
 * `redirect()` steht ausserhalb jeder Fehlerbehandlung: Es wirkt ueber
 * eine Ausnahme, die ein catch verschlucken wuerde.
 */
export async function anmeldenAction(
  _previous: AnmeldenState,
  formData: FormData,
): Promise<AnmeldenState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const next = safeNextPath(String(formData.get("weiter") ?? "/"));
  const registrieren = String(formData.get("modus") ?? "") === "registrieren";

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Bitte eine gueltige E-Mail-Adresse eingeben.",
    };
  }

  const password = validatePassword(String(formData.get("passwort") ?? ""));
  if (!password.ok) {
    return { status: "error", message: password.message };
  }

  const result = registrieren
    ? await signUpWithPassword(email, password.value)
    : await signInWithPassword(email, password.value);

  if (!result.ok) return { status: "error", message: result.message };

  redirect(next as Route);
}
