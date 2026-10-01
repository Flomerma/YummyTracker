import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  databaseErrorMessage,
  householdErrorMessage,
  isErrorMarker,
} from "@/lib/domain/invite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Zugriffsschicht fuer den Haushalt. Nach der tragenden Regel aus Konzept 7.1
 * ist lib/data/ die einzige Stelle mit Supabase-Aufrufen; dieses Modul ist es
 * fuer households, household_members und household_invites.
 *
 * Die Schicht ist bewusst duenn: sie ruft auf, uebersetzt Spaltennamen nach
 * camelCase und macht aus einem Fehler einen Satz. Sie prueft keine Rechte.
 * Ebene 1 des Zugriffsschutzes sind die Zeilen-Sicherheitsregeln in der
 * Datenbank, Ebene 2 liegt in lib/services/household.ts (Konzept 7.4).
 *
 * ----------------------------------------------------------------------
 * ZWEI DINGE, DIE MAN UEBER POSTGREST WISSEN MUSS
 * ----------------------------------------------------------------------
 *
 * 1. DIE FORM DER ANTWORT HAENGT AM RUECKGABETYP DER FUNKTION.
 *
 *    PostgREST baut den Antwortkoerper in `asJsonF` (Query/SqlFragment.hs)
 *    und unterscheidet dabei vier Faelle:
 *
 *      returns <composite>   -> json_agg(t)->0            -> ein OBJEKT
 *      returns <skalar>      -> json_agg(t.pgrst_scalar)->0 -> ein WERT
 *      returns setof <skalar>-> json_agg(t.pgrst_scalar)   -> ein ARRAY
 *      returns table (...)   -> json_agg(t)               -> ein ARRAY
 *      returns void          -> 204, leerer Koerper
 *
 *    Fuer die Stufe-0-Funktionen heisst das konkret:
 *
 *      create_household         returns public.households  -> Objekt
 *      create_household_invite  returns table (...)        -> Array
 *      join_household_with_invite returns uuid             -> Zeichenkette
 *      revoke_household_invite  returns void               -> null
 *
 *    Nur beim Array ist `.single()` richtig. Bei den anderen dreien waere es
 *    im besten Fall ueberfluessig und im schlechtesten irrefuehrend.
 *
 * 2. DER FEHLERCODE STEHT IM DETAIL-FELD, NICHT IN DER MELDUNG.
 *
 *    Die Migrationen werfen ihre Ausnahmen mit
 *      raise exception 'Deutscher Satz.' using detail = 'not_a_member'
 *    PostgREST reicht DETAIL als `error.details` durch. Verglichen wird
 *    ausschliesslich dagegen — ein Meldungstext ist Anzeige, keine
 *    Schnittstelle, und wuerde bei der ersten Umformulierung brechen.
 */

/* -------------------------------------------------------------------------
 * Ergebnisform
 * ---------------------------------------------------------------------- */

/**
 * Dieselbe Machart wie `AuthResult` in lib/data/auth.ts, nur mit Nutzlast.
 *
 * `code` traegt im Fehlerfall den Marker aus dem DETAIL-Feld, falls einer da
 * ist, sonst den SQLSTATE oder den PostgREST-Code. Eine Oberflaeche kann
 * darauf verzweigen; `message` ist fuer Menschen.
 */
export type HouseholdResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: string | null;
      readonly message: string;
    };

export function householdFailure(code: string | null): HouseholdResult<never> {
  // Ohne Datenbankfehler zur Hand — die Aufrufer melden hier eigene Marker
  // wie "not_a_member". databaseErrorMessage faellt ohne Meldungstext
  // ohnehin hierauf zurueck.
  return { ok: false, code, message: householdErrorMessage(code) };
}

/**
 * Bestimmt den Code aus einem PostgREST-Fehler.
 *
 * Reihenfolge mit Grund: `details` traegt bei unseren eigenen Funktionen den
 * Marker — aber eben nicht immer. Das Feld ist bei Postgres-Fehlern das
 * DETAIL der Ausnahme und bei PostgREST-eigenen Fehlern ein ganzer Satz; bei
 * PGRST116 zum Beispiel "The result contains 0 rows". `isErrorMarker` siebt
 * das aus, damit so ein Satz nicht als Fehlercode in die Oberflaeche
 * durchgereicht wird. Bleibt nichts uebrig, ist der SQLSTATE (bzw. bei
 * PostgREST-eigenen Fehlern dessen Code) die naechstbeste Auskunft.
 */
function errorCode(error: PostgrestError): string | null {
  const detail = error.details?.trim();
  if (isErrorMarker(detail)) return detail!;

  const code = error.code?.trim();
  return code ? code : null;
}

function failure(error: PostgrestError): HouseholdResult<never> {
  const code = errorCode(error);
  // Mit dem Meldungstext, weil SQLSTATE 42501 zwei grundverschiedene Dinge
  // bedeuten kann: fehlendes Recht (meist eine nicht eingespielte
  // Migration) oder tatsaechlich ein fremder Haushalt.
  return {
    ok: false,
    code,
    message: databaseErrorMessage(code, error.message),
  };
}

/* -------------------------------------------------------------------------
 * Zeilenformen
 * ---------------------------------------------------------------------- */

export type HouseholdRole = "owner" | "member";

export interface Household {
  readonly id: string;
  readonly name: string;
  /** null, wenn das Konto des Erstellers geloescht wurde. */
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HouseholdMember {
  readonly householdId: string;
  readonly userId: string;
  readonly role: HouseholdRole;
  readonly displayName: string | null;
  readonly joinedAt: string;
  readonly updatedAt: string;
}

/**
 * Eine Einladung, wie sie gelesen werden kann.
 *
 * `token_hash` fehlt hier mit Absicht. Die Spalte ist fuer Mitglieder zwar
 * lesbar (aus dem Hash laesst sich nichts zurueckrechnen), aber sie hat in
 * keiner Ansicht etwas zu suchen und soll deshalb gar nicht erst aus der
 * Zugriffsschicht herauskommen.
 */
export interface HouseholdInvite {
  readonly id: string;
  readonly householdId: string;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly usedAt: string | null;
  readonly usedBy: string | null;
}

/** Das Ergebnis von `create_household_invite` — der Klartext genau einmal. */
export interface CreatedInvite {
  readonly id: string;
  /**
   * Der Klartext-Schluessel. Existiert nur in dieser einen Antwort; in der
   * Datenbank liegt ausschliesslich sein SHA-256-Hash. Er darf protokolliert
   * werden so wenig wie ein Passwort.
   */
  readonly token: string;
  readonly expiresAt: string;
}

/* -------------------------------------------------------------------------
 * Umwandlung der Rohzeilen
 * ---------------------------------------------------------------------- */

// Ohne generierte Datenbanktypen (npm run db:types) ist der Client untypisiert
// und liefert `any`. Diese Formen sind der Vertrag, den diese Datei annimmt;
// die Auswahl in den select()-Aufrufen unten haelt ihn ein.

interface RawHousehold {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RawMember {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  display_name: string | null;
  joined_at: string;
  updated_at: string;
}

interface RawInvite {
  id: string;
  household_id: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
}

const HOUSEHOLD_COLUMNS = "id, name, created_by, created_at, updated_at";
const MEMBER_COLUMNS =
  "household_id, user_id, role, display_name, joined_at, updated_at";
const INVITE_COLUMNS =
  "id, household_id, created_by, created_at, expires_at, used_at, used_by";

function toHousehold(row: RawHousehold): Household {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMember(row: RawMember): HouseholdMember {
  return {
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    joinedAt: row.joined_at,
    updatedAt: row.updated_at,
  };
}

function toInvite(row: RawInvite): HouseholdInvite {
  return {
    id: row.id,
    householdId: row.household_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedBy: row.used_by,
  };
}

/* -------------------------------------------------------------------------
 * Schreiben ueber die Datenbankfunktionen
 * ---------------------------------------------------------------------- */

/**
 * Legt einen Haushalt an. Der Aufrufer wird per Trigger Eigentuemer.
 *
 * `create_household` ist mit `returns public.households` deklariert, also ein
 * einzelner Verbundtyp. PostgREST liefert dafuer bereits ein Objekt — kein
 * `.single()`. Mit `.single()` waere es nicht falsch, aber es wuerde
 * suggerieren, hier komme ein Array an, und genau diese Verwechslung ist bei
 * der Nachbarfunktion `create_household_invite` ein Laufzeitfehler.
 */
export async function createHousehold(
  name: string,
  displayName: string | null,
): Promise<HouseholdResult<Household>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_household", {
    p_name: name,
    p_display_name: displayName,
  });

  if (error) return failure(error);
  if (!data) return householdFailure("empty_result");

  return { ok: true, data: toHousehold(data as RawHousehold) };
}

/**
 * Erzeugt eine Einladung und gibt den Klartext-Schluessel zurueck.
 *
 * `create_household_invite` ist mit `returns table (...)` deklariert, also
 * mengenwertig. PostgREST liefert dafuer ein ARRAY, auch wenn genau eine
 * Zeile darin steht. `.single()` ist hier deshalb Pflicht und nicht Geschmack:
 * ohne es waere `data.invite_token` schlicht `undefined`, und der Fehler
 * faellt erst auf, wenn jemand einen leeren Link verschickt.
 *
 * @param validityInterval Textform einer Postgres-`interval`, z. B.
 *   "10080 minutes" (siehe `inviteValidityInterval` in lib/domain/invite.ts).
 *   `null` uebernimmt die Vorgabe der Funktion von sieben Tagen.
 */
export async function createHouseholdInvite(
  householdId: string,
  validityInterval: string | null,
): Promise<HouseholdResult<CreatedInvite>> {
  const supabase = await createSupabaseServerClient();

  // Den Schluessel weglassen statt null senden: nur dann greift der
  // Vorgabewert der Funktion. Ein explizites null waere ein Wert.
  const args: Record<string, unknown> = { p_household_id: householdId };
  if (validityInterval !== null) args.p_valid_for = validityInterval;

  const { data, error } = await supabase
    .rpc("create_household_invite", args)
    .single();

  if (error) return failure(error);
  if (!data) return householdFailure("empty_result");

  const row = data as {
    invite_id: string;
    invite_token: string;
    invite_expires_at: string;
  };

  return {
    ok: true,
    data: {
      id: row.invite_id,
      token: row.invite_token,
      expiresAt: row.invite_expires_at,
    },
  };
}

/**
 * Loest einen Einladungsschluessel ein und liefert die Kennung des Haushalts.
 *
 * `returns uuid` ist ein Skalar: PostgREST antwortet mit der blossen
 * Zeichenkette, nicht mit `{ "join_household_with_invite": "…" }`.
 *
 * Diese Funktion ist der einzige Weg in einen fremden Haushalt. Sie muss es
 * sein: Wer beitreten will, ist noch kein Mitglied, und die SELECT-Richtlinie
 * auf household_invites verbirgt die Einladungszeile genau vor ihm.
 */
export async function joinHouseholdWithInvite(
  token: string,
  displayName: string | null,
): Promise<HouseholdResult<string>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("join_household_with_invite", {
    p_token: token,
    p_display_name: displayName,
  });

  if (error) return failure(error);
  if (typeof data !== "string" || data === "") {
    return householdFailure("empty_result");
  }

  return { ok: true, data };
}

/**
 * Nimmt eine Einladung zurueck.
 *
 * `returns void`: PostgREST antwortet mit 204 und leerem Koerper, `data` ist
 * null. Das Ausbleiben eines Fehlers ist hier das Ergebnis.
 */
export async function revokeHouseholdInvite(
  inviteId: string,
): Promise<HouseholdResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("revoke_household_invite", {
    p_invite_id: inviteId,
  });

  if (error) return failure(error);

  return { ok: true, data: null };
}

/* -------------------------------------------------------------------------
 * Lesen
 * ---------------------------------------------------------------------- */

/**
 * Die Haushalte des angemeldeten Kontos.
 *
 * Es gibt keine Bedingung auf die Benutzerkennung: die Richtlinie
 * households_select_member filtert bereits auf
 * `id in (select private.current_household_ids())`. Eine zusaetzliche
 * `.eq('created_by', …)` waere sogar falsch — wer beigetreten ist, hat den
 * Haushalt nicht angelegt.
 */
export async function listOwnHouseholds(): Promise<
  HouseholdResult<readonly Household[]>
> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("households")
    .select(HOUSEHOLD_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) return failure(error);

  return { ok: true, data: ((data ?? []) as RawHousehold[]).map(toHousehold) };
}

/**
 * Ein einzelner Haushalt, oder null, wenn er nicht existiert oder nicht
 * sichtbar ist. Die beiden Faelle sind hier bewusst nicht unterscheidbar —
 * sonst liesse sich ueber die Antwort pruefen, ob eine Kennung existiert.
 */
export async function getHousehold(
  householdId: string,
): Promise<HouseholdResult<Household | null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("households")
    .select(HOUSEHOLD_COLUMNS)
    .eq("id", householdId)
    .maybeSingle();

  if (error) return failure(error);

  return {
    ok: true,
    data: data ? toHousehold(data as RawHousehold) : null,
  };
}

/**
 * Die Mitglieder eines Haushalts.
 *
 * Fuer Nichtmitglieder liefert die Richtlinie eine leere Liste, keinen
 * Fehler. Das ist gewollt, und lib/services baut darauf die zweite
 * Schutzebene: eine leere Liste heisst "kein Zugriff".
 */
export async function listHouseholdMembers(
  householdId: string,
): Promise<HouseholdResult<readonly HouseholdMember[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("household_members")
    .select(MEMBER_COLUMNS)
    .eq("household_id", householdId)
    .order("joined_at", { ascending: true });

  if (error) return failure(error);

  return { ok: true, data: ((data ?? []) as RawMember[]).map(toMember) };
}

/**
 * Alle Einladungen eines Haushalts, die neueste zuerst — auch die bereits
 * verwendeten und abgelaufenen. Was davon angezeigt wird, entscheidet die
 * Dienst-Schicht; das Aussortieren hier wuerde einen zweiten Aufruf noetig
 * machen, sobald jemand eine Verlaufsliste sehen will.
 */
export async function listHouseholdInvites(
  householdId: string,
): Promise<HouseholdResult<readonly HouseholdInvite[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("household_invites")
    .select(INVITE_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) return failure(error);

  return { ok: true, data: ((data ?? []) as RawInvite[]).map(toInvite) };
}

/* -------------------------------------------------------------------------
 * Schreiben direkt auf den Tabellen
 * ---------------------------------------------------------------------- */

/**
 * Entfernt ein Mitglied.
 *
 * `.select()` am Ende ist kein Beiwerk. Ein DELETE, das durch eine Richtlinie
 * herausgefiltert wird, meldet keinen Fehler — es loescht null Zeilen und
 * meldet Erfolg. Ohne die zurueckgegebene Zeile wuerde die Oberflaeche
 * "entfernt" anzeigen, obwohl nichts geschehen ist. Null Zeilen heisst hier
 * deshalb: nicht erlaubt.
 *
 * Der Schutz des letzten Eigentuemers kommt dagegen als echter Fehler
 * (Trigger, Marker `last_owner_protected`) und nicht als leeres Ergebnis —
 * genau deshalb steht er in Migration 2 als Trigger und nicht als Richtlinie.
 */
export async function removeHouseholdMember(
  householdId: string,
  userId: string,
): Promise<HouseholdResult<null>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .select("user_id");

  if (error) return failure(error);
  if (!data || data.length === 0) return householdFailure("not_allowed");

  return { ok: true, data: null };
}

/**
 * Aendert den Anzeigenamen eines Mitglieds.
 *
 * Schreibbar ist ausschliesslich die eigene Zeile (Richtlinie
 * household_members_update_own_display_name) und ausschliesslich diese eine
 * Spalte (Spaltenrecht aus Migration 1). `userId` steht trotzdem als
 * Parameter da: diese Schicht prueft nichts, sie fuehrt aus. Wer hier fremd
 * schreiben will, bekommt null Zeilen zurueck — siehe oben.
 *
 * `null` loescht den Anzeigenamen. Der leere String waere ein Verstoss gegen
 * household_members_display_name_length und darf hier nicht ankommen.
 */
export async function setMemberDisplayName(
  householdId: string,
  userId: string,
  displayName: string | null,
): Promise<HouseholdResult<HouseholdMember>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("household_members")
    .update({ display_name: displayName })
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .select(MEMBER_COLUMNS);

  if (error) return failure(error);

  const rows = (data ?? []) as RawMember[];
  if (rows.length === 0) return householdFailure("not_allowed");

  return { ok: true, data: toMember(rows[0]!) };
}
