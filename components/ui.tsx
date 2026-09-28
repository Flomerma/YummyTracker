import type { ComponentProps, ReactNode } from "react";

/**
 * Die gemeinsamen Bausteine der Oberflaeche.
 *
 * Bewusst eine einzige kleine Datei statt eines Ordners mit zwanzig
 * Dateien: Es sind sechs Bausteine, sie gehoeren zusammen, und wer einen
 * aendert, will meistens die anderen daneben sehen.
 *
 * GESTALTUNGSREGEL (Konzept): Keiner dieser Bausteine bringt Farbe mit.
 * Farbe ist der Dringlichkeit vorbehalten und lebt in
 * components/urgency-badge.tsx. Alles hier ist neutral — deshalb faellt
 * ein roter Eintrag im Vorrat sofort auf.
 *
 * Touch-Ziele sind mindestens 44 Pixel hoch. Das ist keine Kosmetik: Die
 * App wird vor dem offenen Kuehlschrank bedient, einhaendig.
 */

/* -------------------------------------------------------------------------
 * Knopf
 * ---------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 " +
  "text-sm font-medium transition-opacity disabled:cursor-not-allowed " +
  "disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-neutral-900";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  secondary:
    "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  ghost: "text-neutral-700 hover:bg-neutral-100",
  // Die einzige Ausnahme von der Farbregel, und eine notwendige: Loeschen
  // und Entfernen muessen sich von "weiter" unterscheiden lassen. Deshalb
  // nur die Schrift rot, nicht die Flaeche — sonst konkurriert der Knopf
  // mit einer Ablaufwarnung um Aufmerksamkeit.
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------
 * Eingabe
 * ---------------------------------------------------------------------- */

const INPUT_BASE =
  "min-h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 " +
  "text-base text-neutral-900 outline-none placeholder:text-neutral-400 " +
  "focus-visible:border-neutral-900 focus-visible:ring-2 " +
  "focus-visible:ring-neutral-900/10 disabled:bg-neutral-50";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  // text-base statt text-sm ist Absicht: Unter 16 Pixel zoomt iOS beim
  // Fokussieren in das Feld hinein, und der Nutzer muss danach von Hand
  // herauszoomen.
  return <input {...props} className={`${INPUT_BASE} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${INPUT_BASE} pr-8 ${className}`} />;
}

/* -------------------------------------------------------------------------
 * Feld — Beschriftung, Hinweis und Fehler zusammen
 * ---------------------------------------------------------------------- */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs leading-relaxed text-neutral-500">{hint}</p>
      )}
      {error && (
        <p
          role="alert"
          className="text-xs leading-relaxed text-red-700"
          id={`${htmlFor}-fehler`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Flaechen
 * ---------------------------------------------------------------------- */

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`rounded-xl border border-neutral-200 bg-white p-4 ${className}`}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

/**
 * Der leere Zustand.
 *
 * Mit Handlungsaufforderung, nicht nur "nichts da". Ein leerer Vorrat ist
 * der haeufigste erste Bildschirm ueberhaupt — er entscheidet mit, ob
 * jemand die App ein zweites Mal oeffnet.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-6 py-12 text-center">
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      <p className="max-w-xs text-sm leading-relaxed text-neutral-500">
        {description}
      </p>
      {action}
    </div>
  );
}

/** Eine Meldung, die nach einer Aktion stehen bleibt. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-neutral-200 bg-neutral-50 text-neutral-800";

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${styles}`}
    >
      {children}
    </div>
  );
}
