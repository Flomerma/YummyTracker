import "server-only";

import { headers } from "next/headers";

import { resolveOrigin } from "@/lib/domain/origin";

/**
 * Die oeffentliche Adresse dieser Bereitstellung, z. B.
 *   http://localhost:3000
 *   https://yummytracker-git-stufe0-team.vercel.app
 *   https://yummytracker.example.ch
 *
 * Wird fuer `emailRedirectTo` beim Zauber-Link gebraucht. Eine feste
 * Adresse aus der Umgebung reicht nicht: In Vercel-Vorschauen hat jede
 * Bereitstellung eine eigene Adresse, und ein Link, der auf die
 * Produktionsadresse zeigt, testet nicht den Zweig, den man gerade prueft.
 *
 * In Next.js 15 ist `headers()` asynchron.
 */
export async function getAppOrigin(): Promise<string> {
  const requestHeaders = await headers();

  return resolveOrigin({
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    host: requestHeaders.get("host"),
  });
}
