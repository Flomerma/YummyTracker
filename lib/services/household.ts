import "server-only";

import { getAppOrigin } from "@/lib/app-origin";
import { getVerifiedClaims } from "@/lib/data/auth";
import {
  createHousehold as dbCreateHousehold,
  createHouseholdInvite as dbCreateInvite,
  getHousehold as dbGetHousehold,
  householdFailure,
  joinHouseholdWithInvite as dbJoinWithInvite,
  listHouseholdInvites as dbListInvites,
  listHouseholdMembers as dbListMembers,
  listOwnHouseholds as dbListOwnHouseholds,
  removeHouseholdMember as dbRemoveMember,
  revokeHouseholdInvite as dbRevokeInvite,
  setMemberDisplayName as dbSetDisplayName,
  type Household,
  type HouseholdInvite,
  type HouseholdMember,
  type HouseholdResult,
} from "@/lib/data/households";
import {
  buildInviteUrl,
  inviteValidityInterval,
  validateDisplayName,
  validateHouseholdName,
  validateInviteToken,
  validateInviteValidity,
} from "@/lib/domain/invite";

/**
 * Anwendungsfaelle rund um den Haushalt (Konzept 7.1, Schicht lib/services).
 *
 * Diese Schicht kennt Supabase nicht — der Linter setzt das durch. Sie setzt
 * drei Dinge zusammen:
 *
 *   1. die reinen Pruefungen aus lib/domain/invite.ts,
 *   2. die Aufrufe aus lib/data/households.ts,
 *   3. EBENE 2 DES ZUGRIFFSSCHUTZES (Konzept 7.4).
 *
 * Zu Punkt 3, weil er der Grund fuer die Existenz dieser Datei ist:
 *
 *   Ebene 1 sind die Zeilen-Sicherheitsregeln. Waere eine davon zu weit
 *   gefasst, wuerde eine Abfrage stillschweigend fremde Zeilen liefern und
 *   niemand merkte es. Ebene 2 prueft deshalb hier noch einmal ausdruecklich:
 *   Vor jeder Aktion an einem Haushalt wird dessen Mitgliederliste geholt und
 *   darin die EIGENE, aus dem geprueften Token stammende Benutzerkennung
 *   gesucht. Erst wenn sie dort steht, passiert etwas.
 *
 *   Diese Pruefung haengt nicht daran, dass die Richtlinie richtig filtert:
 *   Selbst wenn sie die Mitglieder eines fremden Haushalts durchliesse, waere
 *   die eigene Kennung nicht darunter, und die Aktion bricht ab.
 *
 *   Was sie nicht kann: eine zu weit gefasste Richtlinie beim reinen Lesen
 *   ersetzen. Wer Mitglied ist, sieht, was die Richtlinie ihn sehen laesst.
 *   Dafuer ist der Nachweis in supabase/testing/10_rls_stufe0.sql zustaendig.
 */

export type { Household, HouseholdInvite, HouseholdMember, HouseholdResult };

/* -------------------------------------------------------------------------
 * Bausteine
 * ---------------------------------------------------------------------- */

/**
 * Die Benutzerkennung aus dem geprueften Zugriffstoken.
 *
 * `getVerifiedClaims()` prueft die Signatur; der Wert stammt also nicht aus
 * einem Cookie, dem man glauben muesste. `sub` ist `auth.users.id` und damit
 * derselbe Schluessel, den `auth.uid()` in der Datenbank sieht.
 */
export async function currentUserId(): Promise<string | null> {
  const claims = await getVerifiedClaims();
  const sub = claims?.sub;

  return typeof sub === "string" && sub !== "" ? sub : null;
}

export interface Membership {
  readonly userId: string;
  readonly me: HouseholdMember;
  readonly members: readonly HouseholdMember[];
}

/**
 * Ebene 2: stellt fest, dass die anfragende Person wirklich Mitglied dieses
 * Haushalts ist, und liefert gleich die Mitgliederliste mit — die brauchen
 * die Aufrufer ohnehin, ein zweiter Rundgang waere verschenkt.
 */
export async function requireMembership(
  householdId: string,
): Promise<HouseholdResult<Membership>> {
  const userId = await currentUserId();
  if (!userId) return householdFailure("not_authenticated");

  const members = await dbListMembers(householdId);
  if (!members.ok) return members;

  const me = members.data.find((member) => member.userId === userId);
  if (!me) return householdFailure("not_a_member");

  return { ok: true, data: { userId, me, members: members.data } };
}

/* -------------------------------------------------------------------------
 * Haushalt anlegen und ansehen
 * ---------------------------------------------------------------------- */

export interface CreateHouseholdInput {
  readonly name: string;
  /** Freiwillig. Leer heisst: kein Anzeigename. */
  readonly displayName?: string | null;
}

/**
 * Legt einen Haushalt an. Der Aufrufer wird dabei Eigentuemer — das erledigt
 * der Trigger in der Datenbank, nicht diese Schicht.
 *
 * Hier gibt es keine Mitgliedschaftspruefung, weil es noch nichts gibt, in
 * dem man Mitglied sein koennte. Angemeldet sein muss man trotzdem: ohne
 * `auth.uid()` scheitert schon die INSERT-Richtlinie.
 */
export async function createHousehold(
  input: CreateHouseholdInput,
): Promise<HouseholdResult<Household>> {
  const userId = await currentUserId();
  if (!userId) return householdFailure("not_authenticated");

  const name = validateHouseholdName(input.name);
  if (!name.ok) return name;

  const displayName = validateDisplayName(input.displayName);
  if (!displayName.ok) return displayName;

  return dbCreateHousehold(name.value, displayName.value);
}

/** Alle Haushalte des angemeldeten Kontos, aeltester zuerst. */
export async function listMyHouseholds(): Promise<
  HouseholdResult<readonly Household[]>
> {
  const userId = await currentUserId();
  if (!userId) return householdFailure("not_authenticated");

  return dbListOwnHouseholds();
}

export interface HouseholdOverview {
  readonly household: Household;
  readonly members: readonly HouseholdMember[];
  /** Noch nicht eingeloeste und noch nicht abgelaufene Einladungen. */
  readonly openInvites: readonly HouseholdInvite[];
  /** Die eigene Zeile — fuer "darf ich das?" in der Oberflaeche. */
  readonly me: HouseholdMember;
}

/**
 * Alles, was der Bildschirm "Haushalt" braucht, in einem Aufruf.
 *
 * Der Klartext-Schluessel der offenen Einladungen ist hier bewusst NICHT
 * dabei und kann es auch nicht sein: Er existiert nur im Rueckgabewert von
 * `create_household_invite`. Wer den Link noch einmal braucht, erzeugt eine
 * neue Einladung.
 */
export async function loadHouseholdOverview(
  householdId: string,
  now: Date = new Date(),
): Promise<HouseholdResult<HouseholdOverview>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const household = await dbGetHousehold(householdId);
  if (!household.ok) return household;
  if (!household.data) return householdFailure("not_a_member");

  const invites = await dbListInvites(householdId);
  if (!invites.ok) return invites;

  const openInvites = invites.data.filter(
    (invite) =>
      invite.usedAt === null && Date.parse(invite.expiresAt) > now.getTime(),
  );

  return {
    ok: true,
    data: {
      household: household.data,
      members: membership.data.members,
      openInvites,
      me: membership.data.me,
    },
  };
}

/* -------------------------------------------------------------------------
 * Einladen und beitreten
 * ---------------------------------------------------------------------- */

export interface InviteLink {
  readonly inviteId: string;
  /** Die vollstaendige Adresse zum Weitergeben. */
  readonly url: string;
  /** Der blosse Schluessel, falls jemand ihn separat anzeigen will. */
  readonly token: string;
  readonly expiresAt: string;
}

/**
 * Erzeugt eine Einladung und baut daraus den fertigen Link.
 *
 * Einladen darf jedes Mitglied, nicht nur der Eigentuemer — Konzept 3.4:
 * alle sind gleichberechtigt, die Ausnahme betrifft nur Entfernen und
 * Loeschen. `create_household_invite` sieht das genauso.
 *
 * Die Adresse kommt aus `getAppOrigin()` und nicht aus einer festen
 * Umgebungsvariablen: in einer Vercel-Vorschau hat jede Bereitstellung ihre
 * eigene, und ein Link auf die Produktionsadresse wuerde den Zweig, den man
 * gerade prueft, gar nicht testen.
 *
 * @param validityMinutes 5 bis 43200 (30 Tage); `null` = sieben Tage.
 */
export async function createInviteLink(
  householdId: string,
  validityMinutes: number | null = null,
): Promise<HouseholdResult<InviteLink>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const validity = validateInviteValidity(validityMinutes);
  if (!validity.ok) return validity;

  const invite = await dbCreateInvite(
    householdId,
    inviteValidityInterval(validity.value),
  );
  if (!invite.ok) return invite;

  const origin = await getAppOrigin();

  return {
    ok: true,
    data: {
      inviteId: invite.data.id,
      url: buildInviteUrl(origin, invite.data.token),
      token: invite.data.token,
      expiresAt: invite.data.expiresAt,
    },
  };
}

/**
 * Nimmt eine Einladung zurueck.
 *
 * Ebene 2 hat hier zwei Teile: Mitglied des Haushalts sein, UND die Einladung
 * muss wirklich zu diesem Haushalt gehoeren. Ohne den zweiten Teil koennte
 * jemand mit einem eigenen Haushalt eine fremde Einladungskennung ausprobieren
 * und sich dabei auf die Pruefung in `revoke_household_invite` verlassen.
 * Die prueft zwar richtig — aber darauf soll man sich eben nicht verlassen.
 */
export async function revokeInviteLink(
  householdId: string,
  inviteId: string,
): Promise<HouseholdResult<null>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const invites = await dbListInvites(householdId);
  if (!invites.ok) return invites;

  const invite = invites.data.find((candidate) => candidate.id === inviteId);
  if (!invite) return householdFailure("invite_not_found");

  return dbRevokeInvite(inviteId);
}

export interface JoinHouseholdInput {
  /** Der Schluessel oder die ganze eingefuegte Adresse. */
  readonly token: string | null | undefined;
  readonly displayName?: string | null;
}

/**
 * Tritt einem Haushalt bei.
 *
 * Der einzige Anwendungsfall ohne Mitgliedschaftspruefung, und zwar
 * zwangslaeufig: Wer beitritt, ist noch kein Mitglied. Die Pruefung
 * uebernimmt der Schluessel selbst — er ist einmalig verwendbar, laeuft ab
 * und liegt nur als Hash in der Datenbank. Angemeldet sein muss man, sonst
 * gaebe es keine Kennung, die man eintragen koennte.
 *
 * Zurueck kommt die Kennung des Haushalts, damit die aufrufende Seite direkt
 * dorthin weiterleiten kann.
 */
export async function joinHousehold(
  input: JoinHouseholdInput,
): Promise<HouseholdResult<string>> {
  const userId = await currentUserId();
  if (!userId) return householdFailure("not_authenticated");

  const token = validateInviteToken(input.token);
  if (!token.ok) return token;

  const displayName = validateDisplayName(input.displayName);
  if (!displayName.ok) return displayName;

  return dbJoinWithInvite(token.value, displayName.value);
}

/* -------------------------------------------------------------------------
 * Mitglieder
 * ---------------------------------------------------------------------- */

/**
 * Entfernt ein Mitglied.
 *
 * Ebene 2 prueft hier mehr als die blosse Mitgliedschaft:
 *
 *  * Nur ein Eigentuemer darf entfernen (Konzept 3.4). Die Richtlinie
 *    household_members_delete_owner sagt dasselbe, wuerde die Zeile aber nur
 *    stumm herausfiltern; hier gibt es dafuer einen Satz.
 *  * Der letzte Eigentuemer bleibt. Der Trigger in der Datenbank haelt das
 *    ebenfalls fest und ist die verbindliche Instanz — diese Vorabpruefung
 *    spart nur den Fehlschlag und erklaert genauer.
 */
export async function removeMember(
  householdId: string,
  userId: string,
): Promise<HouseholdResult<null>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const { me, members } = membership.data;
  if (me.role !== "owner") return householdFailure("not_allowed");

  const target = members.find((member) => member.userId === userId);
  if (!target) return householdFailure("not_a_member");

  const owners = members.filter((member) => member.role === "owner");
  if (target.role === "owner" && owners.length <= 1) {
    return householdFailure("last_owner_protected");
  }

  return dbRemoveMember(householdId, userId);
}

/**
 * Aendert den eigenen Anzeigenamen in einem Haushalt.
 *
 * Die Kennung kommt aus dem geprueften Token und wird nicht als Parameter
 * angenommen. Damit gibt es von dieser Schicht aus keinen Weg, den
 * Anzeigenamen eines anderen Mitglieds zu setzen — unabhaengig davon, was
 * Richtlinie und Spaltenrecht in der Datenbank erlauben.
 *
 * Ein leeres Feld loescht den Anzeigenamen.
 */
export async function renameMyself(
  householdId: string,
  displayNameInput: string | null | undefined,
): Promise<HouseholdResult<HouseholdMember>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const displayName = validateDisplayName(displayNameInput);
  if (!displayName.ok) return displayName;

  return dbSetDisplayName(
    householdId,
    membership.data.userId,
    displayName.value,
  );
}
