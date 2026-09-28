import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button, EmptyState, Notice, PageHeader } from "@/components/ui";
import { urgencyLabel } from "@/components/urgency-badge";
import { ArtikelZeile } from "@/components/vorrat/artikel-zeile";
import type { StorageLocation } from "@/lib/domain/types";
import { currentContext } from "@/lib/services/current";
import { loadInventory } from "@/lib/services/inventory";

export const metadata: Metadata = {
  title: "Vorrat — yummytracker",
};

const FILTER: readonly { value: StorageLocation | "alle"; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "fridge", label: "Kühlschrank" },
  { value: "freezer", label: "Tiefkühler" },
  { value: "pantry", label: "Vorrat" },
];

function istLagerort(value: string | undefined): value is StorageLocation {
  return value === "fridge" || value === "freezer" || value === "pantry";
}

/**
 * Die Startseite nach der Anmeldung.
 *
 * SORTIERT NACH DRINGLICHKEIT, NICHT ALPHABETISCH. Das ist die zentrale
 * Entscheidung dieses Bildschirms: Wer die App oeffnet, soll zuerst sehen,
 * was draengt — nicht, was mit A anfaengt. Die Reihenfolge macht
 * lib/services/inventory.ts, hier wird sie nur dargestellt.
 */
export default async function VorratSeite({
  searchParams,
}: {
  searchParams: Promise<{ ort?: string }>;
}) {
  const context = await currentContext();
  if (context.state !== "ready") redirect("/");

  const { ort } = await searchParams;
  const filter = istLagerort(ort) ? ort : null;

  const inventory = await loadInventory(context.household.id, filter);

  if (!inventory.ok) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Vorrat" />
        <Notice tone="error">{inventory.message}</Notice>
      </div>
    );
  }

  const { sections, total, urgentCount } = inventory.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Vorrat"
        subtitle={
          total === 0
            ? undefined
            : urgentCount === 0
              ? `${total} Artikel, nichts Dringendes.`
              : `${urgentCount} von ${total} Artikeln brauchen Aufmerksamkeit.`
        }
        action={
          <Link href="/erfassen">
            <Button>Erfassen</Button>
          </Link>
        }
      />

      <nav aria-label="Nach Lagerort filtern" className="flex flex-wrap gap-2">
        {FILTER.map((eintrag) => {
          const aktiv =
            eintrag.value === "alle"
              ? filter === null
              : filter === eintrag.value;
          return (
            <Link
              key={eintrag.value}
              href={
                eintrag.value === "alle"
                  ? "/vorrat"
                  : `/vorrat?ort=${eintrag.value}`
              }
              aria-current={aktiv ? "page" : undefined}
              className={
                "rounded-full px-3 py-1.5 text-sm " +
                (aktiv
                  ? "bg-neutral-900 font-medium text-white"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50")
              }
            >
              {eintrag.label}
            </Link>
          );
        })}
      </nav>

      {total === 0 ? (
        <EmptyState
          title={filter ? "Hier ist nichts" : "Der Vorrat ist leer"}
          description={
            filter
              ? "An diesem Lagerort ist gerade nichts erfasst."
              : "Erfasse, was du eingekauft hast — dann meldet sich die App von selbst, bevor etwas verdirbt."
          }
          action={
            <Link href="/erfassen">
              <Button>Erstes Lebensmittel erfassen</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => (
            <section key={section.urgency}>
              <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                {urgencyLabel(section.urgency)}
                <span className="ml-2 font-normal normal-case">
                  {section.items.length}
                </span>
              </h2>
              <ul className="rounded-xl border border-neutral-200 bg-white px-4">
                {section.items.map((item) => (
                  <ArtikelZeile key={item.id} item={item} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
