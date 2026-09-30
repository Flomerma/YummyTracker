/**
 * Reine Anmelde-Regeln. Keine Datenbank, kein React, kein Netzwerk —
 * damit ohne laufende Infrastruktur testbar (siehe lib/domain/auth.test.ts).
 */

// Bewusst nachsichtig: Die endgueltige Pruefung macht Supabase. Diese hier
// verhindert nur, dass offensichtlicher Unsinn eine Anfrage ausloest.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/**
 * Prueft ein Weiterleitungsziel, bevor es verwendet wird.
 *
 * Ohne diese Pruefung waere jeder `?next=`-Parameter eine offene
 * Weiterleitung: ein Angreifer schickt einen Link auf die eigene Anmeldeseite,
 * und nach erfolgreicher Anmeldung landet das Opfer auf einer fremden Seite,
 * die wie yummytracker aussieht.
 *
 * Erlaubt sind nur Pfade innerhalb der eigenen Anwendung.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback; // absolute URL oder relativer Pfad
  if (raw.startsWith("//")) return fallback; // protokollrelativ: //boese.example
  if (raw.startsWith("/\\")) return fallback; // manche Browser lesen \ als /
  return raw;
}

/**
 * Uebersetzt die Fehlercodes von Supabase Auth in deutsche Saetze.
 * Quelle der Codes: supabase.com/docs/guides/auth/debugging/error-codes
 */
const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  over_email_send_rate_limit:
    "An diese Adresse wurden zu viele Links geschickt. Bitte einige Minuten warten.",
  over_request_rate_limit:
    "Zu viele Versuche in kurzer Zeit. Bitte einen Moment warten.",
  email_address_invalid:
    "Diese Adresse akzeptiert Supabase nicht. Beispiel- und Testdomains sind gesperrt.",
  email_address_not_authorized:
    "An diese Adresse darf noch nicht verschickt werden. Solange kein eigener Mailversand eingerichtet ist, erlaubt Supabase nur Adressen von Projektmitgliedern.",
  email_provider_disabled:
    "Der E-Mail-Anmeldeweg ist im Supabase-Projekt abgeschaltet.",
  otp_disabled:
    "Die Anmeldung per Zauber-Link ist im Supabase-Projekt abgeschaltet.",
  signup_disabled: "Neue Konten koennen derzeit nicht angelegt werden.",
  otp_expired:
    "Dieser Anmeldelink ist abgelaufen oder wurde bereits verwendet. Bitte einen neuen anfordern.",
  flow_state_not_found:
    "Der Anmeldevorgang ist nicht mehr bekannt. Das passiert, wenn der Link in einem anderen Browser oder auf einem anderen Geraet geoeffnet wird. Bitte einen neuen Link anfordern und ihn dort oeffnen, wo er angefordert wurde.",
  flow_state_expired:
    "Der Anmeldevorgang ist abgelaufen. Bitte einen neuen Link anfordern.",
  bad_code_verifier:
    "Der Anmeldevorgang passt nicht zu diesem Browser. Bitte einen neuen Link anfordern und ihn im selben Browser oeffnen.",
  validation_failed: "Die Eingabe war unvollstaendig oder im falschen Format.",

  // --- Anmeldung mit Passwort ------------------------------------------
  // Bewusst KEINE Auskunft darueber, ob die Adresse existiert: Sonst wird
  // das Anmeldeformular zum Verzeichnis darueber, wer ein Konto hat.
  invalid_credentials: "E-Mail-Adresse oder Passwort stimmt nicht.",
  weak_password:
    "Das Passwort ist zu kurz oder zu einfach. Es braucht mindestens 8 Zeichen.",
  user_already_exists:
    "Zu dieser Adresse gibt es schon ein Konto. Bitte anmelden statt registrieren.",
  email_exists:
    "Zu dieser Adresse gibt es schon ein Konto. Bitte anmelden statt registrieren.",
  email_not_confirmed:
    "Diese Adresse ist noch nicht bestaetigt. Im Supabase-Dashboard unter Authentication > Sign In / Providers die Bestaetigungspflicht abschalten.",
  same_password: "Das neue Passwort ist mit dem alten identisch.",
};

export function authErrorMessage(code: string | null | undefined): string {
  if (code && code in AUTH_ERROR_MESSAGES) return AUTH_ERROR_MESSAGES[code]!;
  return "Das hat leider nicht geklappt. Bitte nochmals versuchen.";
}

/**
 * Arten von Bestaetigungs-Token, die /auth/confirm annimmt.
 *
 * Bewusst hier als reine Zeichenketten-Union und nicht als Import aus dem
 * Supabase-Paket: Die Route soll entscheiden koennen, was sie akzeptiert,
 * ohne dafuer die Datenzugriffsschicht oder gar Supabase zu kennen
 * (Konzept 7.1). Die Zuordnung auf den Supabase-Typ passiert in lib/data.
 */
export const EMAIL_TOKEN_TYPES = [
  "magiclink",
  "email",
  "signup",
  "invite",
  "recovery",
  "email_change",
] as const;

export type EmailTokenType = (typeof EMAIL_TOKEN_TYPES)[number];

export function isEmailTokenType(
  value: string | null | undefined,
): value is EmailTokenType {
  return (
    value != null && (EMAIL_TOKEN_TYPES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------
 * Passwort
 * ---------------------------------------------------------------------- */

/**
 * Supabase weist Passwoerter unter dieser Laenge selbst ab. Hier steht
 * derselbe Wert, damit der Hinweis schon im Formular erscheint statt erst
 * nach einem Rundgang zum Server.
 */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Obergrenze, weil bcrypt nach 72 Byte abschneidet. Ohne diese Pruefung
 * waeren zwei lange Passwoerter, die sich erst ab Zeichen 73 unterscheiden,
 * gleichwertig — ein Fehler, der nie auffaellt.
 */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string };

/**
 * Prueft ein Passwort, bevor es ueberhaupt verschickt wird.
 *
 * Bewusst nur Laenge, keine Vorschriften ueber Sonderzeichen oder
 * Grossbuchstaben: Solche Regeln erzeugen erwiesenermassen schlechtere
 * Passwoerter ("Sommer2024!") und mehr Zettel am Bildschirm. Laenge ist
 * das, was zaehlt.
 */
export function validatePassword(
  raw: string | null | undefined,
): PasswordCheck {
  const value = typeof raw === "string" ? raw : "";

  if (value.length === 0) {
    return { ok: false, message: "Bitte ein Passwort eingeben." };
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Das Passwort braucht mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`,
    };
  }
  // In Byte messen, nicht in Zeichen: Ein Emoji belegt vier Byte, und
  // abgeschnitten wird nach Byte.
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: `Das Passwort darf hoechstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
    };
  }

  return { ok: true, value };
}
