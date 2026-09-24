import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { signOutCurrentSession } from "@/lib/data/auth";

/**
 * Abmelden.
 *
 * NUR POST, kein GET. Ein Abmelde-Link per GET wird von Link-Vorladern,
 * Browser-Vorschauen und Mail-Scannern aufgerufen — die Nutzerin waere dann
 * ohne Zutun abgemeldet. Ohne exportiertes GET antwortet Next.js darauf
 * automatisch mit 405.
 *
 * STATUS 303 IST WICHTIG: Der Vorgabewert von NextResponse.redirect ist 307,
 * und 307 behaelt die Methode bei. Der Browser wuerde also ein POST auf
 * /anmelden schicken und dort eine Fehlermeldung bekommen. 303 sagt
 * ausdruecklich "jetzt ein GET".
 *
 * Ein Route-Handler darf Cookies setzen und loeschen — hier liegt der
 * Unterschied zur Server-Komponente wieder auf dem Tisch.
 */
export async function POST(request: NextRequest) {
  await signOutCurrentSession();

  // Leert den Server-Zwischenspeicher fuer alle Layouts und Seiten. Ohne das
  // kann nach dem Abmelden kurz noch die angemeldete Ansicht erscheinen.
  revalidatePath("/", "layout");

  const target = request.nextUrl.clone();
  target.pathname = "/anmelden";
  target.search = "";

  return NextResponse.redirect(target, { status: 303 });
}
