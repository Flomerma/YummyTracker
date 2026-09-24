import { NextResponse, type NextRequest } from "next/server";

import { exchangeCodeForSession } from "@/lib/data/auth";
import { safeNextPath } from "@/lib/domain/auth";

/**
 * Rueckleitung fuer den PKCE-Ablauf.
 *
 * Funktioniert mit der UNVERAENDERTEN Mailvorlage von Supabase
 * ({{ .ConfirmationURL }}): Der Link fuehrt zuerst auf
 * <projekt>.supabase.co/auth/v1/verify, und weil @supabase/ssr immer
 * `flowType: 'pkce'` erzwingt, leitet Supabase von dort mit `?code=...` auf
 * die Adresse weiter, die in `emailRedirectTo` stand.
 *
 * Ein Route-Handler DARF Cookies setzen — im Gegensatz zu einer
 * Server-Komponente. Genau deshalb steht der Tausch hier und nicht in einer
 * Seite und auch nicht in der Middleware.
 *
 * Dieselbe Route bedient spaeter auch OAuth-Anbieter, falls einmal
 * "Mit Google anmelden" dazukommt.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Supabase haengt bei Fehlern error, error_code und error_description an.
  const providerErrorCode = searchParams.get("error_code");
  const providerError = searchParams.get("error");

  if (providerError || providerErrorCode) {
    return redirectToError(request, providerErrorCode ?? providerError);
  }

  if (!code) {
    return redirectToError(request, "kein_code");
  }

  const result = await exchangeCodeForSession(code);

  if (!result.ok) {
    return redirectToError(request, result.code ?? "tausch_fehlgeschlagen");
  }

  return NextResponse.redirect(buildUrl(request, next));
}

/**
 * Baut die Zieladresse aus `request.nextUrl`, nicht aus `new URL(request.url)`.
 *
 * `nextUrl` ist die von Next.js normalisierte Adresse und traegt hinter dem
 * Vercel-Lastverteiler bereits den nach aussen sichtbaren Host. `request.url`
 * kann dagegen den internen Host enthalten — dann landet der Nutzer nach der
 * Anmeldung auf einer Adresse, die es von aussen nicht gibt.
 */
function buildUrl(request: NextRequest, pathWithQuery: string): URL {
  const target = request.nextUrl.clone();
  const parsed = new URL(pathWithQuery, "http://interner-platzhalter.invalid");
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = "";
  return target;
}

function redirectToError(request: NextRequest, code: string | null) {
  const target = request.nextUrl.clone();
  target.pathname = "/auth/fehler";
  target.search = code ? `?code=${encodeURIComponent(code)}` : "";
  return NextResponse.redirect(target);
}
