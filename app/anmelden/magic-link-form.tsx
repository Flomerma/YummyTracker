"use client";

import { useActionState } from "react";

import { requestMagicLinkAction } from "./actions";
import { MAGIC_LINK_INITIAL_STATE, type MagicLinkState } from "./state";

/**
 * `useActionState` kommt in React 19 aus 'react' (nicht aus 'react-dom';
 * das war das alte, entfernte `useFormState`).
 *
 * Ohne JavaScript funktioniert das Formular ebenfalls: Der Browser sendet es
 * ab, Next.js fuehrt die Aktion aus und rendert die Seite neu.
 */
export function MagicLinkForm({ weiter }: { weiter: string }) {
  const [state, action, pending] = useActionState<MagicLinkState, FormData>(
    requestMagicLinkAction,
    MAGIC_LINK_INITIAL_STATE,
  );

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4"
      >
        <p className="text-sm font-medium text-emerald-900">
          Schau in dein Postfach.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-emerald-800">
          Wir haben einen Anmeldelink an <strong>{state.email}</strong>{" "}
          geschickt. Er gilt eine Stunde und laesst sich nur einmal verwenden.
          Bitte oeffne ihn in diesem Browser.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="weiter" value={weiter} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-neutral-800">
          E-Mail-Adresse
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="anna.muster@example.ch"
          aria-describedby={
            state.status === "error" ? "email-fehler" : undefined
          }
          aria-invalid={state.status === "error"}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900/10"
        />
      </div>

      {state.status === "error" && (
        <p
          id="email-fehler"
          role="alert"
          className="text-sm leading-relaxed text-red-700"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? "Wird gesendet …" : "Link anfordern"}
      </button>
    </form>
  );
}
