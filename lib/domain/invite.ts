/**
 * Reine Regeln rund um Haushalt, Anzeigename und Einladungslink.
 *
 * Keine Datenbank, kein React, kein Netzwerk (Konzept 7.1). Alles hier ist
 * ohne laufende Infrastruktur pruefbar — siehe lib/domain/invite.test.ts.
 *
 * Die Grenzwerte spiegeln bewusst die Bedingungen aus den Stufe-0-Migrationen.
 * Sie ersetzen sie nicht: Die Datenbank bleibt die letzte Instanz. Diese
 * Pruefungen sorgen nur dafuer, dass eine Eingabe, die ohnehin scheitern
 * wuerde, gar nicht erst als Anfrage losgeschickt wird und dass die Person
 * davor einen verstaendlichen Satz sieht statt einer Postgres-Meldung.
 */

/* -------------------------------------------------------------------------
 * Ergebnis einer Pruefung
 * ---------------------------------------------------------------------- */

/**
 * Bewusst dieselbe Form wie die Ergebnisse der Zugriffsschicht
 * (`ok` / `code` / `message`), damit ein gescheiterter Vorab-Check in
 * lib/services/ ohne Umbau weitergereicht werden kann.
 */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

function invalid(code: string): ValidationResult<never> {
  return { ok: false, code, message: householdErrorMessage(code) };
}

/* -------------------------------------------------------------------------
 * Namen
 * ---------------------------------------------------------------------- */

/** Aus `households_name_length`: char_length(btrim(name)) between 1 and 80. */
export const HOUSEHOLD_NAME_MAX_LENGTH = 80;

/** Aus `household_members_display_name_length`: between 1 and 60. */
export const DISPLAY_NAME_MAX_LENGTH = 60;

/**
 * Trimmt und faltet jede Folge von Leerraum zu genau einem Leerzeichen.
 *
 * Postgres macht nur `btrim`. Das Falten passiert trotzdem hier und nicht
 * dort, weil der gefaltete Wert auch der ist, der verschickt wird — Pruefung
 * und gespeicherter Wert koennen also nicht auseinanderlaufen. Nebenwirkung
 * mit Absicht: eingefuegte Zeilenumbrueche und geschuetzte Leerzeichen aus
 * einem Chat-Fenster verschwinden, statt im Haushaltsnamen zu landen.
 */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim();
}

/**
 * Zaehlt Zeichen so, wie Postgres `char_length` es tut: in Codepunkten.
 *
 * `"…".length` zaehlt UTF-16-Einheiten. Ein Emoji waere damit zwei Zeichen,
 * fuer Postgres aber eines — ein Name aus 45 Emoji wuerde hier abgelehnt,
 * obwohl die Datenbank ihn annimmt.
 */
function characterCount(value: string): number {
  return [...value].length;
}

export function validateHouseholdName(
  raw: string | null | undefined,
): ValidationResult<string> {
  const value = normalizeName(raw ?? "");

  if (value === "") return invalid("household_name_empty");
  if (characterCount(value) > HOUSEHOLD_NAME_MAX_LENGTH) {
    return invalid("household_name_too_long");
  }

  return { ok: true, value };
}

/**
 * Der Anzeigename ist freiwillig. Leer heisst ausdruecklich `null` und nicht
 * `''`: die Spalte ist nullable, und die CHECK-Bedingung verbietet den leeren
 * String. Ein leeres Feld im Formular darf deshalb nicht als leerer String
 * durchgereicht werden.
 */
export function validateDisplayName(
  raw: string | null | undefined,
): ValidationResult<string | null> {
  const value = normalizeName(raw ?? "");

  if (value === "") return { ok: true, value: null };
  if (characterCount(value) > DISPLAY_NAME_MAX_LENGTH) {
    return invalid("display_name_too_long");
  }

  return { ok: true, value };
}

/* -------------------------------------------------------------------------
 * Einladungslink
 * ---------------------------------------------------------------------- */

/** Pfad der Beitrittsseite. Einzige Stelle, an der er festgelegt wird. */
export const INVITE_PATH = "/beitreten";

/** Name des Abfrageparameters, der den Schluessel traegt. */
export const INVITE_TOKEN_PARAM = "schluessel";

/**
 * Laenge, die `create_household_invite()` erzeugt: 24 Zufallsbytes,
 * base64url kodiert, ergeben genau 32 Zeichen ohne Fuellzeichen.
 * Nur als Dokumentation — geprueft wird gegen eine Spanne, damit eine
 * spaetere Aenderung in der Migration nicht still jeden Beitritt blockiert.
 */
export const INVITE_TOKEN_LENGTH = 32;

const INVITE_TOKEN_MIN_LENGTH = 16;
const INVITE_TOKEN_MAX_LENGTH = 128;

/** base64url: A–Z a–z 0–9 - _ , ohne '+' , '/' und ohne '='. */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Baut die vollstaendige Adresse, die ein Mitglied per Chat weitergibt.
 *
 * `encodeURIComponent` ist bei einem base64url-Schluessel technisch folgenlos
 * — genau das ist der Punkt des Alphabets. Es steht trotzdem hier, damit ein
 * anders erzeugter oder manipulierter Wert die Adresse nicht aufbrechen kann.
 */
export function buildInviteUrl(origin: string, token: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  const value = encodeURIComponent(token.trim());

  return `${base}${INVITE_PATH}?${INVITE_TOKEN_PARAM}=${value}`;
}

/**
 * Holt den Schluessel aus dem, was jemand tatsaechlich eingefuegt hat.
 *
 * Erlaubt beides: den blossen Schluessel und die ganze Adresse. Wer einen
 * Link aus dem Chat kopiert, kopiert in aller Regel den Link — daran darf
 * der Beitritt nicht scheitern.
 *
 * Bewusst mit einem Muster statt mit `new URL()`: ein blosser Schluessel ist
 * keine gueltige Adresse, `new URL()` braucht also ohnehin eine Fallunter-
 * scheidung, und eine Basisadresse haette diese Schicht gar nicht.
 */
export function extractInviteToken(
  raw: string | null | undefined,
): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;

  const fromUrl = new RegExp(`[?&]${INVITE_TOKEN_PARAM}=([^&#\\s]*)`).exec(
    value,
  );
  if (fromUrl) {
    const encoded = fromUrl[1] ?? "";
    let decoded: string;
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      // Einzelnes '%' im Link: nicht dekodierbar, aber auch nicht leer.
      decoded = encoded;
    }
    return decoded.trim() === "" ? null : decoded.trim();
  }

  return value;
}

/**
 * Prueft die Form des Schluessels, bevor deswegen die Datenbank befragt wird.
 *
 * Die Spanne ist absichtlich weiter als die 32 Zeichen aus der Migration:
 * offensichtlicher Unsinn (Leerzeichen, spitze Klammern, ein halber Satz)
 * faellt durch, eine spaetere Aenderung der Schluessellaenge aber nicht.
 */
export function validateInviteToken(
  raw: string | null | undefined,
): ValidationResult<string> {
  const value = extractInviteToken(raw);

  if (value === null) return invalid("invite_token_missing");
  if (
    value.length < INVITE_TOKEN_MIN_LENGTH ||
    value.length > INVITE_TOKEN_MAX_LENGTH ||
    !INVITE_TOKEN_PATTERN.test(value)
  ) {
    return invalid("invite_token_malformed");
  }

  return { ok: true, value };
}

/* -------------------------------------------------------------------------
 * Gueltigkeitsdauer
 * ---------------------------------------------------------------------- */

/**
 * Die Grenzen stammen aus `create_household_invite()`:
 *   p_valid_for < interval '5 minutes' or p_valid_for > interval '30 days'
 *
 * Gerechnet wird in Minuten, weil das die einzige Einheit ist, die beide
 * Enden dieser Spanne ohne Bruchzahl trifft.
 */
export const MIN_INVITE_VALIDITY_MINUTES = 5;
export const MAX_INVITE_VALIDITY_MINUTES = 30 * 24 * 60;
export const DEFAULT_INVITE_VALIDITY_MINUTES = 7 * 24 * 60;

export function validateInviteValidity(
  minutes: number | null | undefined,
): ValidationResult<number> {
  if (minutes == null) {
    return { ok: true, value: DEFAULT_INVITE_VALIDITY_MINUTES };
  }
  if (!Number.isInteger(minutes)) return invalid("invalid_validity");
  if (
    minutes < MIN_INVITE_VALIDITY_MINUTES ||
    minutes > MAX_INVITE_VALIDITY_MINUTES
  ) {
    return invalid("invalid_validity");
  }

  return { ok: true, value: minutes };
}

/**
 * Die Textform, die Postgres als `interval` liest. PostgREST setzt den Wert
 * in `json_to_recordset(... "p_valid_for" interval)` ein, die Umwandlung
 * uebernimmt also die Eingabefunktion des Typs.
 */
export function inviteValidityInterval(minutes: number): string {
  return `${minutes} minutes`;
}

/* -------------------------------------------------------------------------
 * Fehlermeldungen
 * ---------------------------------------------------------------------- */

/**
 * Die maschinenlesbaren Marker aus dem DETAIL-Feld der Datenbankfunktionen
 * (Stufe-0-Migration 3 und der Eigentuemer-Schutz aus Migration 2), dazu die
 * Codes der Pruefungen dieser Datei und ein Auffangnetz aus SQLSTATEs und
 * PostgREST-Codes.
 *
 * Verglichen wird ausschliesslich gegen diese Marker, nie gegen
 * Meldungstexte: Texte sind Anzeige, keine Schnittstelle.
 */
const HOUSEHOLD_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // --- Marker der Datenbankfunktionen -----------------------------------
  not_authenticated: "Dafuer braucht es eine Anmeldung.",
  not_a_member: "Dieser Haushalt gehoert nicht zu diesem Konto.",
  not_allowed:
    "Dafuer fehlt die Berechtigung. Nur wer den Haushalt angelegt hat, darf das.",
  invite_not_found:
    "Diese Einladung ist ungueltig. Bitte im Haushalt einen neuen Link erzeugen lassen.",
  invite_already_used:
    "Diese Einladung wurde bereits verwendet. Jeder Link gilt genau einmal.",
  invite_expired:
    "Diese Einladung ist abgelaufen. Bitte einen neuen Link anfordern.",
  last_owner_protected:
    "Der letzte Eigentuemer eines Haushalts kann nicht entfernt werden. Vorher jemand anderen zum Eigentuemer machen oder den ganzen Haushalt loeschen.",
  invalid_validity:
    "Die Gueltigkeitsdauer muss zwischen 5 Minuten und 30 Tagen liegen.",

  // --- Codes der Pruefungen dieser Datei ---------------------------------
  household_name_empty: "Der Haushalt braucht einen Namen.",
  household_name_too_long: `Der Name des Haushalts darf hoechstens ${HOUSEHOLD_NAME_MAX_LENGTH} Zeichen lang sein.`,
  display_name_too_long: `Der Anzeigename darf hoechstens ${DISPLAY_NAME_MAX_LENGTH} Zeichen lang sein.`,
  invite_token_missing: "Dieser Link enthaelt keinen Einladungsschluessel.",
  invite_token_malformed:
    "Dieser Einladungslink ist unvollstaendig oder beschaedigt. Am besten noch einmal ganz kopieren.",

  // --- Codes der Zugriffsschicht -----------------------------------------
  empty_result:
    "Die Datenbank hat nichts zurueckgegeben. Bitte nochmals versuchen.",

  // --- Auffangnetz: SQLSTATE und PostgREST -------------------------------
  // 42501 kommt auch dann, wenn ein Recht fehlt statt einer Richtlinie.
  "42501": "Kein Zugriff auf diesen Haushalt.",
  // 23514: eine CHECK-Bedingung. Die Vorab-Pruefungen sollten das abfangen.
  "23514": "Diese Eingabe akzeptiert die Datenbank nicht.",
  "23505": "Das gibt es bereits.",
  PGRST301: "Die Anmeldung ist abgelaufen. Bitte neu anmelden.",
  PGRST202:
    "Diese Datenbankfunktion ist nicht bekannt. Vermutlich fehlt eine Migration.",
  PGRST116: "Die Datenbank hat nicht genau einen Datensatz geliefert.",
};

export function householdErrorMessage(code: string | null | undefined): string {
  if (code && code in HOUSEHOLD_ERROR_MESSAGES) {
    return HOUSEHOLD_ERROR_MESSAGES[code]!;
  }
  return "Das hat leider nicht geklappt. Bitte nochmals versuchen.";
}

/**
 * Prueft, ob eine Zeichenkette ueberhaupt die Form eines Markers hat.
 *
 * Gebraucht von lib/data: das DETAIL-Feld traegt nicht immer einen Marker.
 * Bei einer verletzten CHECK-Bedingung steht dort zum Beispiel
 * "Failing row contains (…)". Ohne diese Pruefung wuerde so ein Satz als
 * Fehlercode in die Oberflaeche durchgereicht.
 */
export function isErrorMarker(value: string | null | undefined): boolean {
  return value != null && /^[a-z][a-z0-9_]{2,48}$/.test(value);
}

/* -------------------------------------------------------------------------
 * Fehler, die nach demselben Code aussehen und es nicht sind
 * ---------------------------------------------------------------------- */

/**
 * Uebersetzt einen Datenbankfehler und unterscheidet dabei zwei Faelle,
 * die PostgreSQL unter DERSELBEN Kennung meldet.
 *
 * ANLASS: Ein Nutzer bekam "Kein Zugriff auf diesen Haushalt." zu sehen,
 * obwohl es sein eigener war. Die Wahrheit war eine andere: Der Code lag
 * auf dem Server, die zugehoerige Migration aber noch nicht in der
 * Datenbank — es fehlte ein RECHT, kein Zugang. Die Meldung schickte damit
 * auf die falsche Faehrte, und zwar auf eine, auf der man lange suchen
 * kann.
 *
 * SQLSTATE 42501 heisst "insufficient_privilege" und deckt beides ab:
 *
 *   "permission denied for table X"
 *       -> Der Rolle fehlt ein GRANT. In diesem Projekt praktisch immer
 *          eine nicht eingespielte Migration.
 *
 *   "new row violates row-level security policy for table X"
 *       -> Das Recht ist da, die Richtlinie greift. Hier ist es wirklich
 *          ein fremder Haushalt.
 *
 * Unterscheidbar sind sie nur am Meldungstext, nicht am Code. Deshalb
 * nimmt diese Funktion beides entgegen.
 */
export function databaseErrorMessage(
  code: string | null | undefined,
  rawMessage?: string | null,
): string {
  if (code === "42501") {
    const text = (rawMessage ?? "").toLowerCase();

    if (text.includes("permission denied")) {
      return (
        "Diesem Konto fehlt ein Recht in der Datenbank. Das passiert fast " +
        "immer, wenn eine Migration noch nicht eingespielt ist — in der " +
        "Entwicklung hilft npm run db:push."
      );
    }
    if (text.includes("row-level security")) {
      return "Dieser Eintrag gehoert zu einem anderen Haushalt.";
    }
  }

  return householdErrorMessage(code);
}
