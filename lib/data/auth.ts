import "server-only";

import type { EmailOtpType, JwtPayload } from "@supabase/supabase-js";

import { authErrorMessage, type EmailTokenType } from "@/lib/domain/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Zugangsschicht fuer die Anmeldung. Nach der tragenden Regel aus dem Konzept
 * ist lib/data/ die einzige Stelle mit Supabase-Aufrufen. Ausnahme mit Ansage:
 * lib/supabase/middleware.ts ruft `getClaims()` selbst auf, weil im
 * Middleware-Laufzeitumfeld `next/headers` nicht zur Verfuegung steht.
 */

export type AuthResult =
  { ok: true } | { ok: false; code: string | null; message: string };

function failure(error: { code?: string | null; name?: string }): AuthResult {
  const code = error.code ?? null;
  return { ok: false, code, message: authErrorMessage(code) };
}

/**
 * Fordert einen Zauber-Link an.
 *
 * MUSS aus einer Server-Aktion oder einem Route-Handler aufgerufen werden,
 * nicht aus einer Server-Komponente: @supabase/ssr erzwingt den PKCE-Ablauf
 * und legt dabei ein Cookie `sb-<ref>-auth-token-code-verifier` an. Eine
 * Server-Komponente kann dieses Cookie nicht setzen — der spaetere Tausch
 * von Code gegen Sitzung schlaegt dann mit `bad_code_verifier` fehl.
 *
 * `shouldCreateUser: true` ist beabsichtigt: Wer eingeladen wurde, bekommt
 * beim ersten Link automatisch ein Konto. Ein getrennter Registrierungsschritt
 * waere fuer einen Familienhaushalt eine Huerde ohne Gegenwert.
 */
export async function sendMagicLink(
  email: string,
  emailRedirectTo: string,
): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  return error ? failure(error) : { ok: true };
}

/**
 * Tauscht den Code aus `/auth/callback?code=...` gegen eine Sitzung ein und
 * schreibt die Sitzungs-Cookies.
 *
 * Braucht das Code-Pruefer-Cookie aus demselben Browser, in dem der Link
 * angefordert wurde.
 */
export async function exchangeCodeForSession(
  code: string,
): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  return error ? failure(error) : { ok: true };
}

/**
 * Loest einen Token-Hash aus `/auth/confirm?token_hash=...&type=...` ein.
 *
 * Kommt ohne Code-Pruefer aus und funktioniert deshalb auch, wenn die Mail
 * auf einem anderen Geraet geoeffnet wird. Setzt eine angepasste Mailvorlage
 * voraus (siehe notes).
 */
export async function verifyEmailToken(
  tokenHash: string,
  type: EmailTokenType,
): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    // Die Aufrufer kennen nur den Domaenentyp; erst hier, an der Grenze zu
    // Supabase, wird daraus dessen eigener Typ. Beide Unions bestehen aus
    // denselben Zeichenketten — weicht Supabase davon ab, faellt es genau
    // an dieser Zeile auf und nicht irgendwo in der Anwendung.
    type: type satisfies EmailOtpType,
  });

  return error ? failure(error) : { ok: true };
}

/**
 * Meldet ab und loescht die Sitzungs-Cookies.
 *
 * `scope: 'local'` beendet nur diese eine Sitzung. Vorgabewert waere
 * 'global' — damit wuerde das Abmelden am Familien-Tablet auch das Handy
 * abmelden. Fuer einen Haushalt ist das falsch.
 */
export async function signOutCurrentSession(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signOut({ scope: "local" });

  return error ? failure(error) : { ok: true };
}

/**
 * Die geprueften Angaben zur angemeldeten Person — oder null.
 *
 * getClaims() prueft die Signatur des Zugriffstokens und liefert die Angaben
 * aus dem geprueften Token, nicht aus dem Cookie. Das ist serverseitig
 * vertrauenswuerdig. getSession() waere es NICHT.
 *
 * `claims.sub` ist die Nutzerkennung (auth.users.id) und damit der Schluessel
 * fuer household_members.
 */
export async function getVerifiedClaims(): Promise<JwtPayload | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  return data.claims;
}

/**
 * Der vollstaendige Nutzerdatensatz, frisch vom Auth-Server geholt.
 *
 * Kostet einen Netzwerkaufruf. Nur verwenden, wenn wirklich mehr gebraucht
 * wird als Kennung und E-Mail — etwa nach einer Aenderung der Adresse.
 * Fuer das blosse Pruefen der Identitaet reicht getVerifiedClaims().
 */
export async function getFreshUser() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
