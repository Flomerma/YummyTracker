import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Pfade, die ohne Anmeldung erreichbar bleiben muessen.
 * `/auth/...` ist zusaetzlich bereits im Matcher von middleware.ts
 * ausgenommen — das hier ist die zweite Sicherung, falls der Matcher
 * spaeter geaendert wird.
 */
const PUBLIC_PREFIXES = ["/anmelden", "/auth"] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Uebertraegt Sitzungs-Cookies und Cache-Kopfzeilen auf eine andere Antwort.
 *
 * Notwendig, weil `NextResponse.redirect()` eine frische Antwort ist. Wer sie
 * ohne die aufgefrischten Cookies zurueckgibt, meldet den Nutzer bei der
 * naechsten Anfrage ab.
 *
 * Achtung: Die Supabase-Dokumentation zeigt hier `to.cookies.setAll(...)`.
 * Die Klasse `ResponseCookies` von Next.js 15 hat KEIN `setAll` — nur `set`,
 * `get`, `getAll`, `has`, `delete`. Deshalb die Schleife.
 */
function carryOver(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) to.headers.set(header, value);
  }
  return to;
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  // Kein Client im Modul-Gueltigkeitsbereich zwischenspeichern. Auf Vercel
  // teilen sich mehrere Anfragen denselben Prozess (Fluid Compute); ein
  // geteilter Client wuerde fremde Sitzungen vermischen.
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // 1. Neues Token in die ANFRAGE schreiben, damit die nachgelagerte
        //    Server-Komponente bereits das frische Token sieht und nicht
        //    selbst noch einmal aufzufrischen versucht. Auffrischen-Token
        //    sind einmal verwendbar — zwei parallele Versuche melden ab.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // 2. Antwort neu aufbauen, damit sie die geaenderte Anfrage traegt.
        supabaseResponse = NextResponse.next({ request });
        // 3. Dieselben Cookies an den Browser schicken.
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // 4. Cache-Kopfzeilen uebernehmen (zweiter Parameter, neu ab
        //    @supabase/ssr 0.12). Verhindert, dass Vercel Edge oder ein
        //    vorgelagerter Zwischenspeicher eine Antwort mit fremdem
        //    Sitzungs-Cookie ausliefert.
        for (const [key, value] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, value);
        }
      },
    },
  });

  // Zwischen createServerClient() und getClaims() darf NICHTS stehen.
  // Jede await-Stelle dazwischen kann dazu fuehren, dass das Auffrischen
  // erst nach dem Absenden der Antwort fertig wird — das neue Token ist
  // dann verloren und der Fehler ist kaum zu finden.
  //
  // getClaims() statt getSession(): getSession() liest die Sitzung nur aus
  // dem Cookie, ohne die Signatur zu pruefen. Ein Cookie laesst sich faelschen.
  // getClaims() prueft die Signatur — bei neuen Projekten mit asymmetrischen
  // Schluesseln lokal gegen die zwischengespeicherte Schluesselliste, bei
  // alten Projekten mit symmetrischem Geheimnis durch einen Aufruf des
  // Auth-Servers. Und getClaims() frischt die Sitzung auf, wenn das Token
  // bald ablaeuft — das ist es, was Nutzer angemeldet haelt.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const { pathname } = request.nextUrl;

  if (!claims && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/anmelden";
    url.search = `?weiter=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return carryOver(supabaseResponse, NextResponse.redirect(url));
  }

  if (claims && pathname === "/anmelden") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return carryOver(supabaseResponse, NextResponse.redirect(url));
  }

  // Diese Antwort — und keine andere — muss zurueckgegeben werden. Sie traegt
  // die Cookies, die setAll zuletzt geschrieben hat.
  return supabaseResponse;
}
