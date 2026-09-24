import { NextResponse, type NextRequest } from "next/server";

import { verifyEmailToken } from "@/lib/data/auth";
import { isEmailTokenType, safeNextPath } from "@/lib/domain/auth";

/**
 * Zweiter, robusterer Weg in die Sitzung.
 *
 * `verifyOtp` schickt den Token-Hash direkt an Supabase und bekommt die
 * Sitzung zurueck. Es braucht KEIN Code-Pruefer-Cookie. Damit funktioniert
 * dieser Weg auch, wenn die Mail auf dem Handy geoeffnet wird, der Link aber
 * am Rechner angefordert wurde — genau der Fall, an dem /auth/callback mit
 * `bad_code_verifier` scheitert.
 *
 * Voraussetzung: Die Mailvorlage "Magic Link" im Supabase-Dashboard muss
 * angepasst werden. Solange sie unveraendert ist, wird diese Route nie
 * aufgerufen und /auth/callback uebernimmt.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  if (!tokenHash || !isEmailTokenType(rawType)) {
    return redirectToError(request, "kein_token");
  }

  const result = await verifyEmailToken(tokenHash, rawType);

  if (!result.ok) {
    return redirectToError(request, result.code ?? "pruefung_fehlgeschlagen");
  }

  const target = request.nextUrl.clone();
  const parsed = new URL(next, "http://interner-platzhalter.invalid");
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = "";

  return NextResponse.redirect(target);
}

function redirectToError(request: NextRequest, code: string | null) {
  const target = request.nextUrl.clone();
  target.pathname = "/auth/fehler";
  target.search = code ? `?code=${encodeURIComponent(code)}` : "";
  return NextResponse.redirect(target);
}
