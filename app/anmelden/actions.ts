"use server";

import { getAppOrigin } from "@/lib/app-origin";
import { sendMagicLink } from "@/lib/data/auth";
import { isValidEmail, normalizeEmail, safeNextPath } from "@/lib/domain/auth";
import type { MagicLinkState } from "@/app/anmelden/state";

/**
 * Aus einer Datei mit 'use server' darf nur Asynchrones als Wert exportiert
 * werden. Typ und Anfangszustand liegen deshalb in ./state.ts.
 */
export async function requestMagicLinkAction(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const next = safeNextPath(String(formData.get("weiter") ?? "/"));

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Bitte eine gueltige E-Mail-Adresse eingeben.",
    };
  }

  // Absolute Adresse noetig: Supabase baut daraus den Link in der Mail.
  const origin = await getAppOrigin();
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  // Dieser Aufruf schreibt das PKCE-Cookie. Das geht nur hier, in einer
  // Server-Aktion — nicht beim Rendern der Seite.
  const result = await sendMagicLink(email, emailRedirectTo);

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  // Kein redirect() hier: Die Nutzerin bleibt auf der Seite und liest
  // "schau in dein Postfach". redirect() wuerde ausserdem eine Ausnahme
  // werfen und duerfte nie in einem try-Block stehen.
  return { status: "sent", email };
}
