import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ErfassenEingabe } from "@/components/erfassen/erfassen-eingabe";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  PageHeader,
} from "@/components/ui";
import type { StorageLocation, Unit } from "@/lib/domain/types";
import { listCategories } from "@/lib/data/catalog";
import { currentContext } from "@/lib/services/current";
import { loadOpenDraft } from "@/lib/services/intake";

import {
  entwurfUebernehmenAction,
  entwurfVerwerfenAction,
  zeileDatumAction,
  zeileEntfernenAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Erfassen — yummytracker",
};

const LAGERORT: Record<StorageLocation, string> = {
  fridge: "Kühlschrank",
  freezer: "Tiefkühler",
  pantry: "Vorrat",
};

const EINHEIT: Record<Unit, string> = { piece: "Stück", g: "g", ml: "ml" };

/**
 * Erfassen mit Pruef-Schritt (Konzept 4.1).
 *
 * Oben die Schnelleingabe, unten die Liste des Entwurfs. Erst
 * "Übernehmen" macht daraus Bestand — bis dahin laesst sich alles
 * korrigieren. Dieser Zwischenschritt ist nicht Zierde: Kein
 * Erfassungsweg kennt das Ablaufdatum, also braucht jeder eine Stelle, an
 * der man es pruefen kann. Spaeter speisen Barcode und Bon dieselbe Liste.
 */
export default async function ErfassenSeite() {
  const context = await currentContext();
  if (context.state !== "ready") redirect("/");

  // Beides gleichzeitig: Die Kategorien braucht der Scanner, wenn er einen
  // unbekannten Code benennen laesst. Schlaegt nur das Laden der Kategorien
  // fehl, geht der Scan trotzdem — dann eben mit "Weiss nicht".
  const [draft, kategorien] = await Promise.all([
    loadOpenDraft(context.household.id),
    listCategories(),
  ]);
  const categories = kategorien.ok
    ? kategorien.data.map((c) => ({ id: c.id, name: c.name }))
    : [];

  if (!draft.ok) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Erfassen" />
        <Notice tone="error">{draft.message}</Notice>
      </div>
    );
  }

  const { batch, lines } = draft.data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Erfassen"
        subtitle="Tippen, Enter, nächstes. Für Markenware und Waagenetiketten von der Theke gibt es den Scanner."
      />

      <Card>
        <ErfassenEingabe categories={categories} />
      </Card>

      {lines.length === 0 ? (
        <EmptyState
          title="Noch nichts erfasst"
          description="Gib oben ein, was du eingekauft hast. Du kannst mehrere Sachen hintereinander erfassen und am Schluss alles auf einmal übernehmen."
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Zu übernehmen
            <span className="ml-2 font-normal normal-case">{lines.length}</span>
          </h2>

          <ul className="rounded-xl border border-neutral-200 bg-white px-4">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-col gap-2 border-b border-neutral-100 py-3 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {line.productName ?? line.rawText}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {line.quantity} {EINHEIT[line.unit]}
                      {line.storage && ` · ${LAGERORT[line.storage]}`}
                      {!line.productId && " · Freitext"}
                    </p>
                  </div>

                  <form action={zeileEntfernenAction}>
                    <input type="hidden" name="batchId" value={batch.id} />
                    <input type="hidden" name="lineId" value={line.id} />
                    <Button type="submit" variant="ghost">
                      Entfernen
                    </Button>
                  </form>
                </div>

                <form
                  action={zeileDatumAction}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="lineId" value={line.id} />
                  <label className="flex-1">
                    <span className="sr-only">Ablaufdatum</span>
                    <Input
                      type="date"
                      name="expiresAt"
                      defaultValue={line.suggestedExpiresAt ?? ""}
                      aria-label={`Ablaufdatum für ${line.productName ?? line.rawText}`}
                    />
                  </label>
                  <Button type="submit" variant="secondary">
                    Datum
                  </Button>
                </form>

                {!line.suggestedExpiresAt && (
                  <p className="text-xs text-amber-800">
                    Kein Haltbarkeitswert bekannt — bitte Datum ergänzen, sonst
                    gibt es für diesen Artikel keine Warnung.
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <form action={entwurfUebernehmenAction} className="flex-1">
              <input type="hidden" name="batchId" value={batch.id} />
              <Button type="submit" className="w-full">
                {lines.length === 1
                  ? "Artikel übernehmen"
                  : `${lines.length} Artikel übernehmen`}
              </Button>
            </form>

            <form action={entwurfVerwerfenAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <Button type="submit" variant="ghost">
                Verwerfen
              </Button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
