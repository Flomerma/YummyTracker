/**
 * Zustaende der beiden Einstiegsformulare.
 *
 * Eigene Datei ohne 'use server': Aus einer Server-Aktionsdatei darf nur
 * Asynchrones als Wert exportiert werden — ein Anfangszustand ist ein
 * Objekt und laesst den Bau sonst scheitern.
 */
export type EinstiegState =
  { status: "idle" } | { status: "error"; message: string };

export const EINSTIEG_INITIAL_STATE: EinstiegState = { status: "idle" };
