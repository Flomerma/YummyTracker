"use client";

import { useState } from "react";

import {
  scanAction,
  scanZuordnenAction,
} from "@/app/(app)/erfassen/scan-actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { lookupOpenFoodFacts } from "@/lib/data/openfoodfacts";
import type { ScanOutcome } from "@/lib/services/scan";

import { BarcodeScanner } from "./barcode-scanner";
import { parsePrice } from "./scanner-logic";

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Der Ablauf rund um einen Scan: lesen, auswerten, und wenn noetig einmal
 * benennen.
 *
 * ======================================================================
 * WAS EIN SCAN EHRLICH BRINGT
 * ======================================================================
 * Open Food Facts fuehrt keine Haltbarkeit — nachgezaehlt war das Feld bei
 * zwei von vierzehn Schweizer Eigenmarken ueberhaupt gefuellt, und beide
 * Male mit einem laengst vergangenen Datum. Ein Scan spart also den Namen,
 * nicht das Datum; das kommt in jedem Fall aus den Haltbarkeitsregeln.
 *
 * Der erste Scan eines Produkts spart deshalb fast nichts. Der Gewinn liegt
 * beim ZWEITEN: Die Zuordnung ist dann gemerkt, und derselbe Code trifft
 * sofort, ohne Fremdanbieter. Die Oberflaeche verspricht nichts anderes.
 *
 * ======================================================================
 * WARUM OPEN FOOD FACTS VOM BROWSER AUS
 * ======================================================================
 * Das Ratenlimit liegt bei 15 Abfragen pro Minute und Adresse. Auf Vercel
 * teilen sich alle Nutzer dieselben Ausgangsadressen — serverseitig gaelte
 * die Grenze fuer die ganze Anwendung. Vom Geraet aus gilt sie pro Nutzer.
 * Abgefragt wird nur, wenn weder die gelernten Zuordnungen noch der eigene
 * Katalog etwas wissen.
 */

/*
 * Die Saetze, wenn eine Server-Aktion wirft. Bewusst ohne technischen
 * Fehlertext: In der Produktion ersetzt Next.js die Meldung ohnehin durch
 * eine allgemeine, und "Error: …" hilft niemandem am Kuehlschrank.
 */
const SPEICHERN_FEHLGESCHLAGEN =
  "Das wurde nicht gespeichert — auf dem Server ging etwas schief. " +
  "Versuch es nochmal, oder tippe den Namen in der Schnelleingabe ein.";

const NACHSCHLAGEN_FEHLGESCHLAGEN =
  "Der Code konnte nicht nachgeschlagen werden. Versuch es nochmal, oder " +
  "tippe den Namen in der Schnelleingabe ein.";

type Step =
  | { kind: "scanning" }
  | { kind: "working"; message: string }
  | { kind: "done"; message: string }
  | { kind: "retry"; message: string }
  | {
      kind: "assign";
      ean: string;
      title: string;
      name: string;
      categoryId: string | null;
      note: string | null;
      fromOff: boolean;
      /** Als Text, damit das Feld leer sein darf. Vorbelegt beim Waagenetikett. */
      price: string;
    }
  | { kind: "error"; message: string };

export function ScanFlow({
  categories,
  onClose,
}: {
  categories: readonly CategoryOption[];
  /** Zurueck zur Schnelleingabe. */
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "scanning" });
  const [saving, setSaving] = useState(false);

  function fromOutcome(ean: string, outcome: ScanOutcome): Step {
    switch (outcome.kind) {
      case "added":
        return {
          kind: "done",
          message:
            outcome.via === "learned"
              ? `${outcome.line.productName ?? outcome.line.rawText} — wiedererkannt.`
              : `${outcome.line.productName ?? outcome.line.rawText} hinzugefügt.`,
        };
      case "invalid":
        return {
          kind: "retry",
          message:
            "Der Code wurde verlesen — die Prüfziffer stimmt nicht. Nochmal scannen.",
        };
      case "non-food":
        return {
          kind: "retry",
          message:
            "Das ist kein Lebensmittel-Code (Buch, Zeitschrift oder Gutschein).",
        };
      case "restricted":
        return {
          kind: "assign",
          ean,
          title: "Waagenetikett von der Theke",
          name: "",
          categoryId: null,
          note:
            "Einmal benennen — ab dann erkennt die App diesen Artikel wieder, " +
            "egal wie schwer das nächste Stück ist.",
          fromOff: false,
          // Der Preis steckt im Code und wird vorbelegt — aber sichtbar und
          // aenderbar. Er zaehlt in der Weggeworfen-Auswertung, und eine
          // falsch gelesene Zahl soll dort nicht ungesehen landen.
          price: outcome.priceChf !== null ? outcome.priceChf.toFixed(2) : "",
        };
      case "unknown":
        return {
          kind: "assign",
          ean,
          title: outcome.suggestion ? "Stimmt das?" : "Unbekanntes Produkt",
          name: outcome.suggestion?.name ?? "",
          categoryId: outcome.suggestion?.categoryId ?? null,
          note: outcome.suggestion
            ? "Bitte kurz prüfen, vor allem die Kategorie — sie bestimmt die " +
              "Haltbarkeit. Beim nächsten Scan geht es dann ohne Nachfrage."
            : "Einmal benennen — beim nächsten Scan erkennt die App es wieder.",
          fromOff: outcome.suggestion !== null,
          price: "",
        };
    }
  }

  async function handleDetected(ean: string) {
    setStep({ kind: "working", message: "Wird nachgeschlagen …" });
    // Aus demselben Grund wie beim Speichern: Wirft die Server-Aktion, darf
    // der Bildschirm nicht bei "Wird nachgeschlagen …" stehen bleiben.
    try {
      await auswerten(ean);
    } catch {
      setStep({ kind: "error", message: NACHSCHLAGEN_FEHLGESCHLAGEN });
    }
  }

  async function auswerten(ean: string) {
    const first = await scanAction({ ean });
    if (!first.ok) {
      setStep({ kind: "error", message: first.message });
      return;
    }

    // Nur wenn der eigene Bestand nichts weiss, die Fremdquelle fragen.
    const o = first.outcome;
    if (o.kind === "unknown" && o.suggestion === null) {
      setStep({
        kind: "working",
        message: "Wird bei Open Food Facts gesucht …",
      });
      // lookupOpenFoodFacts wirft nie: Zeitlimit, kein Netz oder ein 429
      // ergeben null, und dann geht es eben ohne Vorschlag weiter.
      const off = await lookupOpenFoodFacts(o.ean);
      if (off) {
        const second = await scanAction({
          ean,
          offSuggestion: {
            name: off.name,
            categoryTags: off.categoryTags,
            quantity: off.quantity,
          },
        });
        if (second.ok) {
          setStep(fromOutcome(ean, second.outcome));
          return;
        }
      }
    }

    setStep(fromOutcome(ean, o));
  }

  async function assign() {
    if (step.kind !== "assign") return;
    setSaving(true);
    // Eine Server-Aktion kann nicht nur ein Ergebnis mit ok: false liefern,
    // sondern auch WERFEN — wenn auf dem Server etwas Unerwartetes passiert
    // oder die Verbindung abreisst. Ohne diesen Block blieb der Dialog dann
    // fuer immer bei "Wird gespeichert …" stehen, ohne dass etwas erfasst
    // wurde. Genau so ist es beim ersten echten Einsatz passiert.
    let result: Awaited<ReturnType<typeof scanZuordnenAction>>;
    try {
      result = await scanZuordnenAction({
        ean: step.ean,
        name: step.name,
        categoryId: step.categoryId,
        priceChf: parsePrice(step.price),
      });
    } catch {
      result = { ok: false, message: SPEICHERN_FEHLGESCHLAGEN };
    } finally {
      setSaving(false);
    }

    if (!result.ok) {
      setStep({ kind: "error", message: result.message });
      return;
    }
    setStep({
      kind: "done",
      message: `${result.name} hinzugefügt und gemerkt.`,
    });
  }

  if (step.kind === "scanning") {
    return <BarcodeScanner onDetected={handleDetected} onCancel={onClose} />;
  }

  const nochmal = (
    <div className="flex gap-2">
      <Button
        type="button"
        className="flex-1"
        onClick={() => setStep({ kind: "scanning" })}
      >
        Nächsten scannen
      </Button>
      <Button type="button" variant="ghost" onClick={onClose}>
        Fertig
      </Button>
    </div>
  );

  if (step.kind === "working") {
    return (
      <p role="status" className="py-6 text-center text-sm text-neutral-600">
        {step.message}
      </p>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-3">
        <Notice>{step.message}</Notice>
        {nochmal}
      </div>
    );
  }

  if (step.kind === "retry" || step.kind === "error") {
    return (
      <div className="flex flex-col gap-3">
        <Notice tone={step.kind === "error" ? "error" : "info"}>
          {step.message}
        </Notice>
        {nochmal}
      </div>
    );
  }

  // step.kind === "assign"
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void assign();
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{step.title}</h3>
        {step.note && (
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">
            {step.note}
          </p>
        )}
      </div>

      <Field label="Name" htmlFor="scan-name">
        <Input
          id="scan-name"
          value={step.name}
          autoFocus
          required
          onChange={(e) => setStep({ ...step, name: e.target.value })}
          placeholder="z. B. Gruyère mild"
        />
      </Field>

      <Field
        label="Kategorie"
        htmlFor="scan-kategorie"
        hint="Bestimmt, wie lange es haltbar ist."
      >
        <Select
          id="scan-kategorie"
          value={step.categoryId ?? ""}
          onChange={(e) =>
            setStep({ ...step, categoryId: e.target.value || null })
          }
        >
          <option value="">Weiss nicht</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Preis (CHF)"
        htmlFor="scan-preis"
        hint="Freiwillig. Zählt, wenn etwas weggeworfen wird."
      >
        <Input
          id="scan-preis"
          inputMode="decimal"
          value={step.price}
          onChange={(e) => setStep({ ...step, price: e.target.value })}
          placeholder="z. B. 4.50"
        />
      </Field>

      {step.fromOff && (
        // Pflicht nach der Lizenz von Open Food Facts (ODbL): Quelle mit
        // Link nennen, wo die Daten angezeigt werden.
        <p className="text-xs text-neutral-500">
          Vorschlag aus{" "}
          <a
            href="https://openfoodfacts.org"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Open Food Facts
          </a>
          , Lizenz ODbL.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Wird gespeichert …" : "Übernehmen und merken"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep({ kind: "scanning" })}
        >
          {/*
            Nicht "Überspringen": Das klang nach "erfassen, nur ohne zu
            merken" — und beim ersten echten Einsatz wurde es genau so
            verstanden. Der Knopf verwirft den Artikel.
          */}
          Nicht erfassen
        </Button>
      </div>
    </form>
  );
}
