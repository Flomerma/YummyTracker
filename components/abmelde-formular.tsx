/**
 * Abmelden per Formular, nicht per Link. Grund siehe
 * app/auth/abmelden/route.ts: Ein GET-Link wuerde von Vorladern ausgeloest.
 *
 * Bewusst eine Server-Komponente ohne 'use client' — braucht kein JavaScript.
 */
export function AbmeldeFormular() {
  return (
    <form action="/auth/abmelden" method="post">
      <button
        type="submit"
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
      >
        Abmelden
      </button>
    </form>
  );
}
