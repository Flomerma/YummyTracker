"use client";

import { useActionState, useEffect, useRef } from "react";

import { zeileErfassenAction } from "@/app/(app)/erfassen/actions";
import {
  ERFASSEN_INITIAL_STATE,
  type ErfassenState,
} from "@/app/(app)/erfassen/state";
import { Button, Input, Notice, Select } from "@/components/ui";

/**
 * Die Schnelleingabe.
 *
 * DAS ERFOLGSKRITERIUM IST EINE ZAHL: ein Artikel in unter zehn Sekunden.
 * Jede Entscheidung hier ist daran ausgerichtet:
 *
 *  - Das Feld hat beim Laden den Fokus. Niemand soll erst hineintippen
 *    muessen, um tippen zu koennen.
 *  - Enter genuegt. Es gibt einen Knopf, aber er ist nicht der Weg.
 *  - Nach dem Absenden leert sich das Feld und bekommt den Fokus zurueck.
 *    Sechs Sachen auszupacken heisst sechsmal tippen und Enter — ohne
 *    einen einzigen Mausweg dazwischen.
 *  - Menge und Lagerort sind vorbelegt und bleiben stehen. Wer drei Sachen
 *    in den Kuehlschrank raeumt, stellt den Lagerort einmal ein.
 *  - Das Ablaufdatum wird gar nicht erst gefragt. Es kommt aus dem Katalog
 *    und laesst sich unten in der Liste korrigieren, wenn es daneben liegt.
 */
export function Schnelleingabe() {
  const [state, action, pending] = useActionState<ErfassenState, FormData>(
    zeileErfassenAction,
    ERFASSEN_INITIAL_STATE,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status !== "added") return;
    // Nur das Textfeld leeren — Menge und Lagerort sollen stehen bleiben,
    // sonst stellt man sie beim Auspacken fuer jeden Artikel neu ein.
    if (textRef.current) textRef.current.value = "";
    textRef.current?.focus();
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={action} className="flex flex-col gap-3">
        <Input
          ref={textRef}
          name="text"
          autoFocus
          required
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="enter"
          placeholder="Was hast du eingekauft?"
          aria-label="Lebensmittel"
        />

        <div className="flex gap-2">
          <label className="w-24">
            <span className="sr-only">Menge</span>
            <Input
              name="menge"
              type="text"
              inputMode="decimal"
              defaultValue="1"
              aria-label="Menge"
            />
          </label>

          <label className="flex-1">
            <span className="sr-only">Lagerort</span>
            <Select name="ort" defaultValue="" aria-label="Lagerort">
              <option value="">Lagerort automatisch</option>
              <option value="fridge">Kühlschrank</option>
              <option value="freezer">Tiefkühler</option>
              <option value="pantry">Vorrat</option>
            </Select>
          </label>

          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Hinzu"}
          </Button>
        </div>
      </form>

      {state.status === "error" && (
        <Notice tone="error">{state.message}</Notice>
      )}

      {state.status === "added" && (
        <p role="status" className="text-xs leading-relaxed text-neutral-500">
          <strong className="font-medium text-neutral-800">
            {state.label}
          </strong>{" "}
          hinzugefügt
          {state.matched
            ? state.expiresAt
              ? ` — Ablauf geschätzt auf ${state.expiresAt}.`
              : " — kein Haltbarkeitswert bekannt, bitte unten ergänzen."
            : " als Freitext, kein Katalogeintrag erkannt."}
        </p>
      )}
    </div>
  );
}
