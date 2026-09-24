import Link from "next/link";

import { authErrorMessage } from "@/lib/domain/auth";

const LOCAL_MESSAGES: Readonly<Record<string, string>> = {
  kein_code:
    "Der Link enthielt keinen Anmeldecode. Moeglicherweise wurde er beim Weiterleiten gekuerzt.",
  kein_token: "Der Link enthielt keinen gueltigen Anmeldeschluessel.",
  tausch_fehlgeschlagen:
    "Der Anmeldecode liess sich nicht einloesen. Bitte einen neuen Link anfordern.",
  pruefung_fehlgeschlagen:
    "Der Anmeldeschluessel liess sich nicht pruefen. Bitte einen neuen Link anfordern.",
  access_denied: "Die Anmeldung wurde abgebrochen.",
};

export default async function AnmeldeFehlerSeite({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const message =
    (code && LOCAL_MESSAGES[code]) || authErrorMessage(code ?? null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        Anmeldung fehlgeschlagen
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">{message}</p>

      <p className="mt-2 text-sm leading-relaxed text-neutral-500">
        Haeufigste Ursache: Der Link wurde schon einmal geoeffnet, ist aelter
        als eine Stunde, oder er wurde in einem anderen Browser angeklickt als
        dem, in dem er angefordert wurde.
      </p>

      <Link
        href="/anmelden"
        className="mt-8 rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white"
      >
        Neuen Link anfordern
      </Link>

      {code && (
        <p className="mt-6 text-xs text-neutral-400">Fehlercode: {code}</p>
      )}
    </main>
  );
}
