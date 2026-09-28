/**
 * Zustand der Schnelleingabe.
 *
 * Eigene Datei ohne 'use server' — aus einer Server-Aktionsdatei darf nur
 * Asynchrones als Wert exportiert werden.
 */
export type ErfassenState =
  | { status: "idle" }
  | {
      status: "added";
      /** Was erfasst wurde — kurz bestaetigen, dann weitermachen. */
      label: string;
      /** Wurde ein Katalogprodukt erkannt, oder ist es Freitext? */
      matched: boolean;
      /** Vorgeschlagenes Ablaufdatum, falls eines ermittelt wurde. */
      expiresAt: string | null;
    }
  | { status: "error"; message: string };

export const ERFASSEN_INITIAL_STATE: ErfassenState = { status: "idle" };
