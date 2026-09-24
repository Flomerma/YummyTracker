/**
 * Zentrale Stelle fuer die oeffentlichen Supabase-Variablen.
 *
 * WICHTIG — Next.js ersetzt `process.env.NEXT_PUBLIC_XY` beim Bauen durch den
 * Literalwert, aber NUR wenn der Ausdruck woertlich so im Quelltext steht.
 * Deshalb darf hier weder `process.env[name]` noch
 * `const { NEXT_PUBLIC_SUPABASE_URL } = process.env` stehen — im Browser waere
 * der Wert dann `undefined`. Die Zugriffe unten sind bewusst ausgeschrieben.
 * Dass sie in einer Funktion stehen, aendert daran nichts; entscheidend ist
 * allein die woertliche Schreibweise.
 *
 * WARUM FUNKTIONEN UND KEINE KONSTANTEN — Konstanten auf Modulebene werden
 * ausgewertet, sobald das Modul geladen wird. Beim `next build` passiert das
 * waehrend "Collecting page data", also lange bevor je eine Anfrage kommt.
 * Eine fehlende Variable liesse damit den BAU scheitern statt die Anfrage:
 * kein Bau ohne Zugangsdaten, keine CI ohne Produktivschluessel, und ein
 * Fehler, der nach einem Programmierfehler aussieht statt nach einer
 * fehlenden Einstellung. Verzoegert ausgewertet tritt der Fehler dort auf,
 * wo er hingehoert — beim ersten Zugriff zur Laufzeit.
 *
 * Zum oeffentlichen Schluessel: Supabase benennt ihn gerade um. Neue Projekte
 * zeigen einen "publishable key" (`sb_publishable_…`), aeltere den "anon key"
 * (ein JWT, `eyJ…`). Beide erfuellen denselben Zweck und beide sind fuer den
 * Browser bestimmt — sie gewaehren nichts ausserhalb der Zeilen-Sicherheits-
 * regeln. Hier werden beide Namen akzeptiert, damit die Einrichtung nicht an
 * einer Benennungsfrage scheitert.
 */

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Bitte in .env.local eintragen ` +
        `(Vorlage: .env.example) und den Entwicklungsserver neu starten. ` +
        `Auf Vercel: Project Settings > Environment Variables, fuer alle drei ` +
        `Umgebungen (Production, Preview, Development).`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
  );
}

export function supabasePublishableKey(): string {
  return required(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (oder NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  );
}

/**
 * Sind die Zugangsdaten ueberhaupt gesetzt? Fuer Stellen, die ohne Supabase
 * einen sinnvollen Ersatz anzeigen wollen, statt eine Ausnahme zu werfen.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
