import type { Metadata } from "next";

import { safeNextPath } from "@/lib/domain/auth";

import { AnmeldeFormular } from "./anmelde-formular";

export const metadata: Metadata = {
  title: "Anmelden — yummytracker",
};

/**
 * Server-Komponente. Sie liest bewusst KEINE Supabase-Sitzung und ruft keinen
 * Supabase-Client auf:
 *
 *  - Wer schon angemeldet ist, wird bereits von der Middleware weggeleitet.
 *  - Eine Server-Komponente darf keine Cookies setzen. Jeder Supabase-Aufruf,
 *    der ein Token auffrischen muesste, liefe hier ins Leere.
 *
 * In Next.js 15 ist `searchParams` ein Promise und muss erwartet werden.
 */
export default async function AnmeldenSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string }>;
}) {
  const { weiter } = await searchParams;
  const next = safeNextPath(weiter);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        Anmelden
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Mit E-Mail-Adresse und Passwort. Beim ersten Mal auf „Konto erstellen“ —
        es wird keine Bestätigungsmail verschickt, du bist sofort drin.
      </p>

      <AnmeldeFormular weiter={next} />
    </main>
  );
}
