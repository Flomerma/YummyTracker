"use client";

import { useActionState } from "react";

import { anzeigenameAendernAction } from "@/app/(app)/haushalt/actions";
import {
  HAUSHALT_INITIAL_STATE,
  type HaushaltState,
} from "@/app/(app)/haushalt/state";
import { Button, Field, Input, Notice } from "@/components/ui";

export function AnzeigenameFormular({ aktuell }: { aktuell: string | null }) {
  const [state, action, pending] = useActionState<HaushaltState, FormData>(
    anzeigenameAendernAction,
    HAUSHALT_INITIAL_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.status === "error" && (
        <Notice tone="error">{state.message}</Notice>
      )}
      {state.status === "done" && <Notice>{state.message}</Notice>}

      <Field
        label="Dein Anzeigename"
        htmlFor="anzeigename"
        hint="So sehen dich die anderen. Leer lassen entfernt ihn."
      >
        <Input
          id="anzeigename"
          name="anzeigename"
          defaultValue={aktuell ?? ""}
          maxLength={60}
          autoComplete="given-name"
        />
      </Field>

      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="self-start"
      >
        {pending ? "Wird gespeichert …" : "Speichern"}
      </Button>
    </form>
  );
}
