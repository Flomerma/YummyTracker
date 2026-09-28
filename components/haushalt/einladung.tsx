"use client";

import { useActionState, useState } from "react";

import { einladungErzeugenAction } from "@/app/(app)/haushalt/actions";
import {
  HAUSHALT_INITIAL_STATE,
  type HaushaltState,
} from "@/app/(app)/haushalt/state";
import { Button, Input, Notice } from "@/components/ui";

/**
 * Einladung erzeugen und weitergeben.
 *
 * DER SCHLUESSEL IST NUR EINMAL SICHTBAR. Danach liegt in der Datenbank
 * nur noch sein Hash — es gibt keinen Weg, ihn wieder anzuzeigen. Das
 * steht hier ausdruecklich, sonst sucht jemand den Link spaeter
 * vergeblich und haelt es fuer einen Fehler.
 */
export function EinladungErzeugen() {
  const [state, action, pending] = useActionState<HaushaltState, FormData>(
    einladungErzeugenAction,
    HAUSHALT_INITIAL_STATE,
  );
  const [kopiert, setKopiert] = useState(false);

  async function kopieren(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setKopiert(true);
      window.setTimeout(() => setKopiert(false), 2000);
    } catch {
      // Ohne Zwischenablage-Recht bleibt das Feld zum Markieren da.
      setKopiert(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {state.status === "error" && (
        <Notice tone="error">{state.message}</Notice>
      )}

      {state.status === "invited" ? (
        <>
          <Notice>
            <strong className="font-medium">
              Diesen Link jetzt weitergeben.
            </strong>{" "}
            Er lässt sich später nicht noch einmal anzeigen — gespeichert ist
            nur eine Prüfsumme. Gültig bis{" "}
            {new Date(state.expiresAt).toLocaleDateString("de-CH", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
            .
          </Notice>

          <div className="flex gap-2">
            <Input
              readOnly
              value={state.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Einladungslink"
            />
            <Button type="button" onClick={() => kopieren(state.url)}>
              {kopiert ? "Kopiert" : "Kopieren"}
            </Button>
          </div>

          <form action={action}>
            <Button type="submit" variant="ghost" disabled={pending}>
              Weiteren Link erzeugen
            </Button>
          </form>
        </>
      ) : (
        <form action={action} className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-neutral-600">
            Erzeuge einen Link und schick ihn per Chat. Er gilt sieben Tage und
            lässt sich genau einmal verwenden.
          </p>
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Wird erzeugt …" : "Einladungslink erzeugen"}
          </Button>
        </form>
      )}
    </div>
  );
}
