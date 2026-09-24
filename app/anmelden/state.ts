/**
 * Zustand des Anmeldeformulars.
 *
 * Bewusst eine eigene Datei OHNE 'use server': Aus einer Server-Aktionsdatei
 * darf ausschliesslich Asynchrones als Wert exportiert werden. Ein Objekt wie
 * der Anfangszustand laesst den Bau sonst mit
 * "A 'use server' file can only export async functions, found object"
 * scheitern. Typen allein waeren unproblematisch — sie verschwinden beim
 * Uebersetzen —, aber der Anfangszustand ist ein echter Wert.
 */
export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export const MAGIC_LINK_INITIAL_STATE: MagicLinkState = { status: "idle" };
