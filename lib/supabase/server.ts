import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Supabase-Client fuer alles, was auf dem Server laeuft:
 * Server-Komponenten, Server-Aktionen und Route-Handler.
 *
 * WARUM `async`: In Next.js 15 ist `cookies()` asynchron. Der Aufruf muss
 * deshalb `await createSupabaseServerClient()` lauten.
 *
 * WARUM DER try/catch UM `cookieStore.set`:
 *
 *   Eine Server-KOMPONENTE rendert, waehrend die HTTP-Antwort schon laeuft.
 *   Sie kann keine Set-Cookie-Kopfzeile mehr anhaengen; Next.js wirft dort
 *   bei `cookieStore.set(...)` einen Fehler. Eine Server-AKTION und ein
 *   Route-Handler laufen dagegen, bevor die Antwort feststeht — dort ist
 *   Schreiben erlaubt.
 *
 *   Derselbe Client wird aber in beiden Faellen gebraucht. Statt zwei
 *   Varianten zu bauen, wird der Schreibfehler geschluckt: In der Server-
 *   Komponente ist er folgenlos, WEIL die Middleware das Token unmittelbar
 *   davor schon aufgefrischt und das neue Cookie gesetzt hat.
 *
 *   Genau deshalb ist die Middleware nicht optional. Ohne sie faellt der
 *   Fehler still in den catch-Block, das aufgefrischte Token geht verloren,
 *   und Nutzer werden scheinbar zufaellig abgemeldet.
 *
 * WARUM DER ZWEITE PARAMETER `_headers` IGNORIERT WIRD:
 *
 *   Seit @supabase/ssr 0.12 uebergibt `setAll` zusaetzlich Cache-Kopfzeilen
 *   (Cache-Control, Expires, Pragma), die verhindern, dass ein CDN eine
 *   Antwort mit fremdem Sitzungs-Cookie zwischenspeichert. Aus einer Server-
 *   Komponente heraus lassen sich Antwort-Kopfzeilen nicht setzen. Das
 *   uebernimmt die Middleware (siehe lib/supabase/middleware.ts), die diese
 *   Kopfzeilen auswertet.
 *
 * `import 'server-only'` sorgt dafuer, dass der Bau abbricht, falls diese
 * Datei versehentlich aus einer Client-Komponente importiert wird.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, _headers) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Aufruf aus einer Server-Komponente. Unkritisch, solange die
          // Middleware die Sitzung auffrischt.
        }
      },
    },
  });
}
