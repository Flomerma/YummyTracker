import type { Urgency } from "@/lib/domain/types";

/**
 * DIE EINZIGE STELLE MIT FARBE.
 *
 * Das Konzept reserviert Farbe ausschliesslich fuer Dringlichkeit. Alle
 * anderen Bausteine sind neutral — nur deshalb faellt ein roter Eintrag im
 * Vorrat sofort auf, ohne dass man suchen muss. Wer anderswo Farbe
 * einfuehrt, verwaessert genau dieses Signal.
 *
 * Die Abstufung folgt der Dringlichkeit, nicht der Aesthetik: rot fuer
 * "jetzt", bernstein fuer "morgen", gedaempft fuer "diese Woche", grau fuer
 * alles Unkritische.
 */

const LABELS: Record<Urgency, string> = {
  expired: "abgelaufen",
  today: "heute",
  tomorrow: "morgen",
  thisWeek: "diese Woche",
  ok: "unkritisch",
  unknown: "kein Datum",
};

const STYLES: Record<Urgency, string> = {
  expired: "bg-red-100 text-red-900 ring-1 ring-red-200",
  today: "bg-red-50 text-red-800 ring-1 ring-red-200",
  tomorrow: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
  thisWeek: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-100",
  ok: "bg-neutral-100 text-neutral-600",
  // Gestrichelt statt gefaerbt: "Datum unbekannt" ist keine Dringlichkeits-
  // stufe, sondern eine fehlende Angabe. Sie soll sichtbar sein, aber nicht
  // mit einer echten Warnung konkurrieren.
  unknown: "text-neutral-500 ring-1 ring-dashed ring-neutral-300",
};

/** Deutscher Text zur Dringlichkeit — auch ausserhalb der Marke nutzbar. */
export function urgencyLabel(urgency: Urgency): string {
  return LABELS[urgency];
}

/**
 * Wie viele Tage noch, als Satzstueck.
 *
 * Bewusst nicht als blosse Zahl: "in 3 Tagen" liest sich vor dem offenen
 * Kuehlschrank schneller als "3".
 */
export function daysLeftLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < -1) return `seit ${Math.abs(daysLeft)} Tagen abgelaufen`;
  if (daysLeft === -1) return "seit gestern abgelaufen";
  if (daysLeft === 0) return "läuft heute ab";
  if (daysLeft === 1) return "läuft morgen ab";
  return `noch ${daysLeft} Tage`;
}

export function UrgencyBadge({
  urgency,
  estimated = false,
}: {
  urgency: Urgency;
  /**
   * Beruht das Datum auf einer Schaetzung statt auf einem Aufdruck?
   *
   * Das Konzept verlangt die Unterscheidung: Eine geschaetzte Warnung ist
   * weicher als eine abgelesene. Wer das nicht sieht, vertraut entweder zu
   * viel oder zu wenig.
   */
  estimated?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${STYLES[urgency]}`}
      title={estimated ? "Geschätztes Datum, nicht abgelesen" : undefined}
    >
      {LABELS[urgency]}
      {estimated && (
        <span aria-label="geschätzt" className="ml-1 opacity-60">
          ≈
        </span>
      )}
    </span>
  );
}
