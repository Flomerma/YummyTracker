"use client";

import { useActionState } from "react";

import { Button, Field, Input, Notice } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/domain/auth";

import { anmeldenAction } from "./actions";
import { ANMELDEN_INITIAL_STATE, type AnmeldenState } from "./state";

/**
 * Anmelden mit E-Mail und Passwort.
 *
 * Zwei Knoepfe an einem Formular statt zweier Formulare oder eines
 * Umschalters: Wer schon ein Konto hat, drueckt "Anmelden", wer keines hat,
 * "Konto erstellen". Der Name des Knopfes landet als `modus` im Formular,
 * und die Server-Aktion verzweigt daran. Das erspart eine Entscheidung
 * vorweg, die man ohne Erklaerung nicht treffen kann.
 *
 * Es wird keine Mail verschickt — darum gibt es auch keinen Hinweis auf ein
 * Postfach.
 */
export function AnmeldeFormular({ weiter }: { weiter: string }) {
  const [state, action, pending] = useActionState<AnmeldenState, FormData>(
    anmeldenAction,
    ANMELDEN_INITIAL_STATE,
  );

  const fehler = state.status === "error" ? state.message : null;

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="weiter" value={weiter} />

      {fehler && <Notice tone="error">{fehler}</Notice>}

      <Field label="E-Mail-Adresse" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          placeholder="anna.muster@example.ch"
        />
      </Field>

      <Field
        label="Passwort"
        htmlFor="passwort"
        hint={`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`}
      >
        <Input
          id="passwort"
          name="passwort"
          type="password"
          // "current-password" auch beim Registrieren: Der Browser soll das
          // Feld ausfuellen koennen, wenn schon ein Konto existiert. Mit
          // "new-password" schlaegt er stattdessen ein neues vor und
          // ueberschreibt damit das gespeicherte.
          autoComplete="current-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Button type="submit" name="modus" value="anmelden" disabled={pending}>
          {pending ? "Einen Moment …" : "Anmelden"}
        </Button>

        <Button
          type="submit"
          name="modus"
          value="registrieren"
          variant="secondary"
          disabled={pending}
        >
          Konto erstellen
        </Button>
      </div>
    </form>
  );
}
