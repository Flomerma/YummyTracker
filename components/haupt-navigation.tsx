"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Die Navigation, unten fixiert.
 *
 * Unten statt oben, weil die App einhaendig vor dem offenen Kuehlschrank
 * bedient wird — am unteren Rand ist sie mit dem Daumen erreichbar.
 *
 * DER AKTIVE EINTRAG IST NICHT FARBIG. Farbe gehoert der Dringlichkeit
 * (Konzept). Erkennbar ist er ueber Schriftgewicht und Kontrast, das
 * genuegt vollauf und nimmt der Ablaufwarnung nichts weg.
 */

const ZIELE = [
  { href: "/vorrat", label: "Vorrat" },
  { href: "/erfassen", label: "Erfassen" },
  { href: "/haushalt", label: "Haushalt" },
] as const;

export function HauptNavigation({ householdName }: { householdName: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-2xl items-stretch">
        {ZIELE.map((ziel) => {
          const active =
            pathname === ziel.href || pathname.startsWith(`${ziel.href}/`);

          return (
            <Link
              key={ziel.href}
              href={ziel.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-14 flex-1 items-center justify-center text-sm " +
                (active
                  ? "font-semibold text-neutral-900"
                  : "font-medium text-neutral-500 hover:text-neutral-800")
              }
            >
              {ziel.label}
            </Link>
          );
        })}
      </div>
      <p className="pb-[env(safe-area-inset-bottom)] text-center text-[11px] text-neutral-400">
        {householdName}
      </p>
    </nav>
  );
}
