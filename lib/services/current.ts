import "server-only";

import type { Household } from "@/lib/data/households";
import { currentUserId, listMyHouseholds } from "@/lib/services/household";

/**
 * In welchem Zustand befindet sich der Besucher?
 *
 * Drei Faelle, und jede Seite muss genau einen davon behandeln. Sie hier
 * einmal zu benennen erspart es, die Fallunterscheidung in jeder Seite neu
 * zu erfinden — und verhindert den haeufigsten Fehler dabei: den
 * angemeldeten Nutzer ohne Haushalt zu vergessen und ihn in eine Ansicht zu
 * schicken, die ohne Haushalt nicht existiert.
 */
export type Context =
  | { readonly state: "anonymous" }
  | { readonly state: "no-household"; readonly userId: string }
  | {
      readonly state: "ready";
      readonly userId: string;
      readonly household: Household;
      /** Alle Haushalte des Nutzers; im Normalfall genau einer. */
      readonly households: readonly Household[];
    };

/**
 * Bestimmt den aktiven Haushalt.
 *
 * Im MVP ist das schlicht der erste — laut Konzept gehoert ein Mensch zu
 * einem Haushalt. Mehrere sind technisch moeglich (jemand hilft in der WG
 * der Schwester aus), aber ein Umschalter dafuer ist bewusst nicht gebaut:
 * Er kostet eine Auswahl auf jedem Bildschirm und loest ein Problem, das
 * es noch nicht gibt. Sobald es auftritt, ist hier die Stelle.
 */
export async function currentContext(): Promise<Context> {
  const userId = await currentUserId();
  if (!userId) return { state: "anonymous" };

  const households = await listMyHouseholds();
  if (!households.ok || households.data.length === 0) {
    return { state: "no-household", userId };
  }

  return {
    state: "ready",
    userId,
    household: households.data[0]!,
    households: households.data,
  };
}
