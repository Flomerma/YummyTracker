/**
 * Bestimmt die oeffentliche Adresse der Anwendung (Schema + Host, ohne
 * Schraegstrich am Ende).
 *
 * Reine Funktion nach der Schichtenregel aus dem Konzept: keine Datenbank,
 * kein React, kein Netzwerk. Die Beschaffung der Eingaben liegt in
 * lib/app-origin.ts.
 *
 * Reihenfolge und Begruendung:
 *  1. NEXT_PUBLIC_SITE_URL  — nur in der Vercel-Umgebung "Production" gesetzt,
 *                             damit die Wunschdomain gewinnt und nicht die
 *                             haessliche *.vercel.app-Adresse.
 *  2. VERCEL_URL            — von Vercel je Bereitstellung gesetzt, also die
 *                             exakte Vorschau-Adresse. Nicht faelschbar, weil
 *                             sie aus der Umgebung stammt und nicht aus einer
 *                             Kopfzeile.
 *  3. Kopfzeilen            — lokale Entwicklung und fremde Hoster.
 *  4. localhost:3000        — Notnagel.
 */
export type OriginInput = {
  siteUrl?: string | null;
  vercelUrl?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
};

function firstValue(headerValue: string): string {
  // x-forwarded-* darf mehrere, kommagetrennte Werte enthalten.
  return headerValue.split(",")[0]!.trim();
}

function withScheme(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLocalHost(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  );
}

export function resolveOrigin(input: OriginInput): string {
  const siteUrl = input.siteUrl?.trim();
  if (siteUrl) return withoutTrailingSlash(withScheme(siteUrl));

  const vercelUrl = input.vercelUrl?.trim();
  if (vercelUrl) return withoutTrailingSlash(withScheme(vercelUrl));

  const rawHost = input.forwardedHost ?? input.host;
  if (rawHost) {
    const host = firstValue(rawHost);
    const proto = input.forwardedProto
      ? firstValue(input.forwardedProto)
      : isLocalHost(host)
        ? "http"
        : "https";
    return `${proto}://${host}`;
  }

  return "http://localhost:3000";
}
