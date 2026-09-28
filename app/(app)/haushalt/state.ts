/**
 * Zustand der Haushalts-Aktionen.
 *
 * Eigene Datei ohne 'use server' — aus einer Server-Aktionsdatei darf nur
 * Asynchrones als Wert exportiert werden.
 */
export type HaushaltState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | {
      status: "invited";
      /**
       * Der Klartext-Schluessel als fertiger Link. Er existiert NUR in
       * dieser einen Antwort — in der Datenbank liegt nur sein Hash. Wer
       * ihn verpasst, muss eine neue Einladung erzeugen.
       */
      url: string;
      expiresAt: string;
    }
  | { status: "error"; message: string };

export const HAUSHALT_INITIAL_STATE: HaushaltState = { status: "idle" };
