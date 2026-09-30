/**
 * Zustand des Anmeldeformulars.
 *
 * Eigene Datei ohne 'use server': Aus einer Server-Aktionsdatei darf nur
 * Asynchrones als Wert exportiert werden — ein Anfangszustand ist ein
 * Objekt und laesst den Bau sonst scheitern.
 */
export type AnmeldenState =
  { status: "idle" } | { status: "error"; message: string };

export const ANMELDEN_INITIAL_STATE: AnmeldenState = { status: "idle" };
