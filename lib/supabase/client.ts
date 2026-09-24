import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Supabase-Client fuer Client-Komponenten (Browser).
 *
 * - Die Sitzung liegt in Cookies, nicht im localStorage. Das ist der ganze
 *   Zweck von @supabase/ssr: nur so kann der Server dieselbe Sitzung lesen.
 *   Eine `auth.storage`-Option wird ignoriert.
 * - `createBrowserClient` gibt im Browser standardmaessig immer dieselbe
 *   Instanz zurueck (Singleton). Die Funktion darf also in jeder Komponente
 *   aufgerufen werden, ohne dass mehrere Clients mit eigenem Token-
 *   Auffrischen entstehen.
 * - Die Cookie-Methoden werden hier bewusst NICHT konfiguriert. Ohne
 *   `cookies`-Option faellt die Bibliothek im Browser auf `document.cookie`
 *   zurueck, und das ist genau richtig.
 *
 * Gebraucht wird das ab Stufe 3 (Einkaufsliste in Echtzeit). Fuer die
 * Anmeldung selbst laeuft alles ueber den Server-Client.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
