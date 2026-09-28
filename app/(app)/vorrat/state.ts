/**
 * Zustand der Schnellaktionen im Vorrat.
 *
 * Eigene Datei ohne 'use server' — aus einer Server-Aktionsdatei darf nur
 * Asynchrones als Wert exportiert werden.
 */
export type VorratState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export const VORRAT_INITIAL_STATE: VorratState = { status: "idle" };
