import type { Urgency } from "@/lib/domain/types";

const LABELS: Record<Urgency, string> = {
  expired: "abgelaufen",
  today: "heute",
  tomorrow: "morgen",
  thisWeek: "diese Woche",
  ok: "unkritisch",
  unknown: "kein Datum",
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span className="rounded-full px-2 py-1 text-xs font-medium">
      {LABELS[urgency]}
    </span>
  );
}
