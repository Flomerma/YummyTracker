import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, PageHeader } from "@/components/ui";
import { currentContext } from "@/lib/services/current";

import {
  HaushaltAnlegenFormular,
  HaushaltBeitretenFormular,
} from "./formulare";

export const metadata: Metadata = {
  title: "Einstieg — yummytracker",
};

/**
 * Zwei Wege auf einer Seite: anlegen oder beitreten.
 *
 * Bewusst keine Auswahl vorweg ("Was möchtest du tun?"). Das waere ein
 * zusaetzlicher Klick fuer eine Entscheidung, die jeder schon getroffen
 * hat, bevor er hier ankommt — wer eine Einladung bekommen hat, will
 * beitreten, alle anderen anlegen.
 */
export default async function EinstiegSeite({
  searchParams,
}: {
  searchParams: Promise<{ schluessel?: string }>;
}) {
  const { schluessel } = await searchParams;
  const context = await currentContext();

  if (context.state === "anonymous") redirect("/anmelden");

  // Wer schon in einem Haushalt ist, gehoert normalerweise in den Vorrat —
  // AUSSER er kommt mit einem Einladungsschluessel. Dann will er einem
  // zweiten Haushalt beitreten, und ihn wegzuleiten hiesse, die Einladung
  // stillschweigend zu verschlucken.
  const bereitsDrin = context.state === "ready";
  if (bereitsDrin && !schluessel) redirect("/vorrat");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-10">
      <PageHeader
        title={bereitsDrin ? "Einladung" : "Willkommen"}
        subtitle={
          bereitsDrin
            ? "Du gehörst bereits zu einem Haushalt. Mit dieser Einladung kommt ein weiterer dazu."
            : "Noch gehörst du zu keinem Haushalt. Leg einen an — oder tritt einem bei, zu dem du eingeladen wurdest."
        }
      />

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">
          Einem Haushalt beitreten
        </h2>
        <HaushaltBeitretenFormular vorbelegterSchluessel={schluessel} />
      </Card>

      {!bereitsDrin && (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-400">oder</span>
            <span className="h-px flex-1 bg-neutral-200" />
          </div>

          <Card>
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">
              Neuen Haushalt anlegen
            </h2>
            <HaushaltAnlegenFormular />
          </Card>
        </>
      )}
    </main>
  );
}
