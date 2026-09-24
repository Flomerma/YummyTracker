import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Diese Datei liegt im Projektstamm (neben app/ und package.json), nicht in
 * app/. Liegt sie falsch, wird sie stillschweigend nie aufgerufen und die
 * Anmeldung scheint zufaellig zu verfallen.
 *
 * NEXT.JS 15 vs. 16: In Next.js 16 wurde die Datei in `proxy.ts` und die
 * Funktion in `proxy` umbenannt. Die aktuelle Supabase-Dokumentation zeigt
 * bereits diese Fassung. Unter Next.js 15 wird eine `proxy.ts` NIE aufgerufen.
 * Hier gilt: `middleware.ts` mit `export async function middleware`.
 * Der Supabase-Teil darin ist in beiden Fassungen identisch.
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Alle Pfade ausser:
     * - _next/static, _next/image  (Bauartefakte)
     * - auth/                      (siehe Begruendung unten)
     * - favicon.ico, manifest      (statische Dateien)
     * - alles mit Bild- oder Schriftendung
     *
     * WARUM auth/ AUSGENOMMEN IST:
     * Die Route-Handler unter /auth setzen selbst Sitzungs-Cookies
     * (Code eintauschen, abmelden). Wuerde die Middleware davor ebenfalls
     * Cookies schreiben, haetten Middleware-Antwort und Handler-Antwort
     * konkurrierende Set-Cookie-Kopfzeilen fuer denselben Namen. Beim
     * Abmelden gewinnt dann unter Umstaenden das aufgefrischte statt des
     * geloeschten Cookies, und der Nutzer bleibt angemeldet.
     * Ausserdem brauchen diese Routen kein Auffrischen — sie bauen die
     * Sitzung gerade erst auf oder ab.
     */
    "/((?!_next/static|_next/image|auth/|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
