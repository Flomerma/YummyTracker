import { redirect } from "next/navigation";

import { currentContext } from "@/lib/services/current";

/**
 * Die Weiche.
 *
 * Es gibt bewusst keine Startseite mit Begruessung: Wer die App oeffnet,
 * will wissen, was ablaeuft — nicht lesen, was die App kann. Jeder Zustand
 * fuehrt deshalb sofort dorthin, wo es fuer ihn weitergeht.
 *
 * `redirect()` wirft eine Ausnahme, mit der Next.js die Umleitung ausloest.
 * Sie darf nie in einem try-Block stehen, sonst faengt der catch sie ab und
 * die Umleitung passiert nie.
 */
export default async function HomePage() {
  const context = await currentContext();

  if (context.state === "anonymous") redirect("/anmelden");
  if (context.state === "no-household") redirect("/einstieg");

  redirect("/vorrat");
}
