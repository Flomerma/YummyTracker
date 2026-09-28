import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { INVITE_TOKEN_PARAM } from "@/lib/domain/invite";
import { currentContext } from "@/lib/services/current";

export const metadata: Metadata = {
  title: "Einladung — yummytracker",
};

/**
 * Das Ziel des Einladungslinks.
 *
 * Diese Seite zeigt selbst nichts an, sie sortiert nur:
 *
 *  - Nicht angemeldet? Erst anmelden — und den Schluessel dabei mitnehmen,
 *    damit er nach der Anmeldung nicht verloren ist. Genau daran scheitern
 *    Einladungsablaeufe sonst: Man klickt den Link, meldet sich an, landet
 *    irgendwo, und der Link ist weg.
 *  - Schon in einem Haushalt? Der Beitritt ist trotzdem moeglich, aber
 *    nicht der Normalfall — deshalb ueber die Einstiegsseite mit dem
 *    vorbelegten Schluessel, wo man sieht, was passiert.
 *  - Angemeldet ohne Haushalt? Direkt zum Einstieg, Schluessel vorbelegt.
 *
 * Der Schluessel wird hier ABSICHTLICH nicht eingeloest. Ein Mail-Scanner
 * oder Link-Vorlader ruft jede Adresse in einer Nachricht vorsorglich per
 * GET auf — ein Einmal-Schluessel waere dann verbraucht, bevor ein Mensch
 * ihn anklickt. Eingeloest wird erst beim Absenden des Formulars.
 */
export default async function BeitretenSeite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const roh = params[INVITE_TOKEN_PARAM];
  const schluessel = Array.isArray(roh) ? roh[0] : roh;

  // Die Typpruefung fuer Routen kennt nur feste Literale; dieser Pfad
  // entsteht zur Laufzeit. Das Ziel ist hier fest verdrahtet (/einstieg),
  // nur der Schluessel ist beweglich — und der ist prozent-kodiert.
  const ziel = (
    schluessel
      ? `/einstieg?${INVITE_TOKEN_PARAM}=${encodeURIComponent(schluessel)}`
      : "/einstieg"
  ) as Route;

  const context = await currentContext();

  if (context.state === "anonymous") {
    redirect(`/anmelden?weiter=${encodeURIComponent(ziel)}` as Route);
  }

  redirect(ziel);
}
