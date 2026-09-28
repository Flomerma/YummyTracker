import { redirect } from "next/navigation";

import { HauptNavigation } from "@/components/haupt-navigation";
import { currentContext } from "@/lib/services/current";

/**
 * Der Rahmen fuer alles hinter der Anmeldung.
 *
 * Prueft beides — angemeldet UND in einem Haushalt — und leitet sonst um.
 * Die Pruefung hier ersetzt nicht die Zeilen-Sicherheitsregeln und auch
 * nicht die Zugehoerigkeitspruefung in lib/services; sie sorgt nur dafuer,
 * dass niemand auf einer Seite landet, die ohne Haushalt gar nichts
 * anzeigen kann. Die eigentliche Absicherung liegt tiefer (Konzept 7.4).
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const context = await currentContext();

  if (context.state === "anonymous") redirect("/anmelden");
  if (context.state === "no-household") redirect("/einstieg");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {/*
        pb-24 haelt Platz fuer die fixierte Navigation frei. Ohne das
        verschwindet der letzte Eintrag jeder Liste dahinter — und zwar
        genau der, der am wenigsten draengt, weshalb es lange niemandem
        auffaellt.
      */}
      <main className="flex-1 px-4 pt-6 pb-24">{children}</main>

      <HauptNavigation householdName={context.household.name} />
    </div>
  );
}
