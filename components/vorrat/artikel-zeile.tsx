"use client";

import { useActionState, useState } from "react";

import {
  ablaufKorrigierenAction,
  artikelErledigenAction,
  artikelGeoeffnetAction,
} from "@/app/(app)/vorrat/actions";
import {
  VORRAT_INITIAL_STATE,
  type VorratState,
} from "@/app/(app)/vorrat/state";
import { Button, Input } from "@/components/ui";
import { daysLeftLabel, UrgencyBadge } from "@/components/urgency-badge";
import type { InventoryView } from "@/lib/services/inventory";
import type { StorageLocation, Unit } from "@/lib/domain/types";

const LAGERORT: Record<StorageLocation, string> = {
  fridge: "Kühlschrank",
  freezer: "Tiefkühler",
  pantry: "Vorrat",
};

const EINHEIT: Record<Unit, string> = {
  piece: "Stück",
  g: "g",
  ml: "ml",
};

function menge(quantity: number, unit: Unit): string {
  // Ganze Zahlen ohne Nachkommastellen: "1 Stück", nicht "1.00 Stück".
  const zahl = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${zahl} ${EINHEIT[unit]}`;
}

/**
 * Ein Artikel im Vorrat, mit den drei Antworten aus Konzept 4.2.
 *
 * Die Aktionen sind eingeklappt, bis jemand die Zeile antippt. Das ist
 * Absicht: Drei Knoepfe pro Zeile mal dreissig Zeilen ergeben eine Wand aus
 * Knoepfen, in der die Ablaufwarnung untergeht — und genau die soll ja
 * auffallen.
 */
export function ArtikelZeile({ item }: { item: InventoryView }) {
  const [offen, setOffen] = useState(false);
  const [datumBearbeiten, setDatumBearbeiten] = useState(false);

  const [erledigt, erledigenAction, erledigtPending] = useActionState<
    VorratState,
    FormData
  >(artikelErledigenAction, VORRAT_INITIAL_STATE);

  const [korrigiert, korrigierenAction, korrigiertPending] = useActionState<
    VorratState,
    FormData
  >(ablaufKorrigierenAction, VORRAT_INITIAL_STATE);

  const [, oeffnenAction, oeffnenPending] = useActionState<
    VorratState,
    FormData
  >(artikelGeoeffnetAction, VORRAT_INITIAL_STATE);

  const fehler =
    erledigt.status === "error"
      ? erledigt.message
      : korrigiert.status === "error"
        ? korrigiert.message
        : null;

  const tage = daysLeftLabel(item.daysLeft);

  return (
    <li className="border-b border-neutral-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-expanded={offen}
        className="flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">
            {item.displayName}
          </span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            {menge(item.quantity, item.unit)}
            {item.storage && ` · ${LAGERORT[item.storage]}`}
            {item.opened && " · geöffnet"}
            {tage && ` · ${tage}`}
          </span>
        </span>
        <UrgencyBadge urgency={item.urgency} estimated={item.estimated} />
      </button>

      {offen && (
        <div className="flex flex-col gap-3 pb-4">
          {fehler && (
            <p role="alert" className="text-xs text-red-700">
              {fehler}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <form action={erledigenAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="consumed" />
              <Button
                type="submit"
                variant="secondary"
                disabled={erledigtPending}
              >
                Gegessen
              </Button>
            </form>

            <form action={erledigenAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="discarded" />
              <Button type="submit" variant="danger" disabled={erledigtPending}>
                Weggeworfen
              </Button>
            </form>

            {!item.opened && (
              <form action={oeffnenAction}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  disabled={oeffnenPending}
                  title="Geöffnet hält vieles deutlich kürzer als der Aufdruck verspricht."
                >
                  Geöffnet
                </Button>
              </form>
            )}

            {!datumBearbeiten && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDatumBearbeiten(true)}
              >
                Datum stimmt nicht
              </Button>
            )}
          </div>

          {datumBearbeiten && (
            <form action={korrigierenAction} className="flex items-end gap-2">
              <input type="hidden" name="itemId" value={item.id} />
              <label className="flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-700">
                  Neues Ablaufdatum
                </span>
                <Input
                  type="date"
                  name="expiresAt"
                  defaultValue={item.expiresAt ?? ""}
                />
              </label>
              <Button type="submit" disabled={korrigiertPending}>
                Speichern
              </Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
