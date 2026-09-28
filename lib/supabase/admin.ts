import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseUrl } from "@/lib/supabase/env";

/**
 * ======================================================================
 * DER ALLMAECHTIGE SUPABASE-CLIENT. UMGEHT ALLE ZEILEN-SICHERHEITSREGELN.
 * ======================================================================
 *
 * Dieser Client meldet sich mit dem Geheimschluessel des Projekts an und
 * erhaelt damit die Rolle `service_role`. Fuer sie gilt:
 *
 *   * RLS wird NICHT ausgewertet. Jede Zeile jeder Tabelle ist sichtbar
 *     und beschreibbar, auch die fremder Haushalte.
 *   * `auth.uid()` ist NULL. Alles, was in der Datenbank per Vorgabewert
 *     daran haengt (products.created_by, intake_batches.created_by),
 *     bleibt leer, wenn es nicht ausdruecklich mitgegeben wird.
 *
 * Daraus folgen drei Regeln, die nicht verhandelbar sind:
 *
 *   1. DIESE DATEI DARF DEN BROWSER NIE ERREICHEN. `import 'server-only'`
 *      laesst den Bau scheitern, sobald sie aus einer Client-Komponente
 *      importiert wird. Der Schluessel traegt bewusst KEIN NEXT_PUBLIC_-
 *      Praefix — Next.js ersetzt nur solche Namen im Browserbuendel, alles
 *      andere waere dort `undefined`.
 *
 *   2. JEDER AUFRUF BRAUCHT VORHER EINE EIGENE ZUGEHOERIGKEITSPRUEFUNG.
 *      Ebene 1 des Zugriffsschutzes (Konzept 7.4) faellt hier weg. Wer
 *      diesen Client benutzt, muss Ebene 2 in lib/services vollstaendig
 *      selbst leisten — und zwar VOR dem Aufruf, nicht danach.
 *
 *   3. NUR FUER DAS, WOFUER ES KEINEN ANDEREN WEG GIBT. In Stufe 1 ist das
 *      genau eine Sache: ein haushaltseigenes Produkt anlegen. Der Katalog
 *      ist fuer `authenticated` absichtlich nur lesbar (Migration 1,
 *      Abschnitt 5), damit ein Fehler in der Erfassungsmaske keine
 *      Tippfehler ueber alle Haushalte verteilt. Lesen, Eingang und Vorrat
 *      laufen weiter ueber den gewoehnlichen Client aus
 *      lib/supabase/server.ts.
 *
 * ----------------------------------------------------------------------
 * WARUM ZWEI VARIABLENNAMEN
 * ----------------------------------------------------------------------
 * Supabase benennt den Geheimschluessel gerade um: neue Projekte zeigen
 * einen "secret key" (`sb_secret_…`), aeltere den "service_role key" (ein
 * JWT, `eyJ…`). Beide erfuellen denselben Zweck. Hier werden beide Namen
 * akzeptiert, damit die Einrichtung nicht an einer Benennungsfrage
 * scheitert — dieselbe Ueberlegung wie beim oeffentlichen Schluessel in
 * lib/supabase/env.ts.
 *
 * ----------------------------------------------------------------------
 * WARUM EINE FUNKTION UND KEINE KONSTANTE
 * ----------------------------------------------------------------------
 * Wie in lib/supabase/env.ts begruendet: eine Konstante auf Modulebene
 * wird beim `next build` waehrend "Collecting page data" ausgewertet, also
 * lange vor der ersten Anfrage. Ein fehlender Schluessel liesse damit den
 * BAU scheitern statt die Anfrage — keine CI ohne Produktivschluessel.
 * Verzoegert ausgewertet tritt der Fehler dort auf, wo er hingehoert.
 */

function secretKey(): string {
  // Ausgeschrieben statt ueber eine Schleife: die woertliche Schreibweise
  // ist die einzige, die jedes Buendelwerkzeug zuverlaessig erkennt.
  const value =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error(
      "Umgebungsvariable SUPABASE_SECRET_KEY (oder SUPABASE_SERVICE_ROLE_KEY) " +
        "fehlt. Sie wird nur serverseitig gebraucht, um den Katalog zu " +
        "schreiben. Bitte in .env.local eintragen (Vorlage: .env.example) " +
        "und den Entwicklungsserver neu starten. Auf Vercel: Project " +
        "Settings > Environment Variables — und dort NICHT mit dem Praefix " +
        "NEXT_PUBLIC_, sonst landet der Schluessel im Browser.",
    );
  }

  return value;
}

/**
 * Ist der Geheimschluessel ueberhaupt hinterlegt?
 *
 * Fuer Stellen, die ohne ihn einen verstaendlichen Satz anzeigen wollen,
 * statt eine Ausnahme bis in die Oberflaeche durchschlagen zu lassen. Das
 * Anlegen eines eigenen Produkts ist ein Zusatzweg; die Erfassung als
 * Freitext funktioniert auch ohne.
 */
export function hasSupabaseAdminConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

/**
 * Baut den Client mit `service_role`.
 *
 * Bewusst ohne Sitzungsverwaltung: Dieser Client hat keine Sitzung und
 * darf auch keine bekommen. Wuerde er Cookies lesen oder schreiben, koennte
 * eine Anfrage versehentlich das Sitzungstoken eines Nutzers mit dem
 * Geheimschluessel vermischen.
 *
 * Kein Zwischenspeichern ueber mehrere Anfragen hinweg: Der Client ist
 * billig zu bauen, und ein modulweit geteiltes Objekt in einer
 * serverlosen Umgebung ist eine Einladung, versehentlich Zustand zwischen
 * Anfragen verschiedener Nutzer zu teilen.
 */
export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(supabaseUrl(), secretKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
