"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";

import { haushaltAnlegenAction, haushaltBeitretenAction } from "./actions";
import { EINSTIEG_INITIAL_STATE, type EinstiegState } from "./state";

export function HaushaltAnlegenFormular() {
  const [state, action, pending] = useActionState<EinstiegState, FormData>(
    haushaltAnlegenAction,
    EINSTIEG_INITIAL_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" && (
        <Notice tone="error">{state.message}</Notice>
      )}

      <Field
        label="Name des Haushalts"
        htmlFor="name"
        hint="Zum Beispiel „Familie Muster“ oder „WG Bahnhofstrasse“."
      >
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Familie Muster"
        />
      </Field>

      <Field
        label="Dein Anzeigename"
        htmlFor="anzeigename"
        hint="Freiwillig. So sehen dich die anderen im Haushalt."
      >
        <Input
          id="anzeigename"
          name="anzeigename"
          maxLength={60}
          autoComplete="given-name"
          placeholder="Anna"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Wird angelegt …" : "Haushalt anlegen"}
      </Button>
    </form>
  );
}

export function HaushaltBeitretenFormular({
  vorbelegterSchluessel,
}: {
  vorbelegterSchluessel?: string;
}) {
  const [state, action, pending] = useActionState<EinstiegState, FormData>(
    haushaltBeitretenAction,
    EINSTIEG_INITIAL_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" && (
        <Notice tone="error">{state.message}</Notice>
      )}

      <Field
        label="Einladungslink oder Schlüssel"
        htmlFor="schluessel"
        hint="Du kannst den ganzen Link einfügen, den du bekommen hast."
      >
        <Input
          id="schluessel"
          name="schluessel"
          required
          defaultValue={vorbelegterSchluessel}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://… oder der Schlüssel"
        />
      </Field>

      <Field
        label="Dein Anzeigename"
        htmlFor="anzeigename-beitritt"
        hint="Freiwillig."
      >
        <Input
          id="anzeigename-beitritt"
          name="anzeigename"
          maxLength={60}
          autoComplete="given-name"
          placeholder="Beat"
        />
      </Field>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Wird geprüft …" : "Beitreten"}
      </Button>
    </form>
  );
}
