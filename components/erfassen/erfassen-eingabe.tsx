"use client";

import { useState } from "react";

import { Button } from "@/components/ui";

import { ScanFlow, type CategoryOption } from "./scan-flow";
import { Schnelleingabe } from "./schnelleingabe";

/**
 * Tippen oder scannen — umschaltbar, Tippen zuerst.
 *
 * Die Reihenfolge ist eine Entscheidung, keine Gewohnheit: Fuer
 * Grundnahrungsmittel ist Tippen schneller. "Vollmilch" steht in drei
 * Sekunden da und trifft laut Messung fast immer; den Scanner zu oeffnen,
 * die Packung zu drehen und den Code scharf zu bekommen dauert laenger. Der
 * Scanner gewinnt bei Markenware, die der Katalog nicht kennt, und bei
 * Waagenetiketten von der Theke — und auch dort erst beim zweiten Mal.
 *
 * Deshalb ist Scannen ein Knopf neben dem Feld und nicht seine Stelle.
 */
export function ErfassenEingabe({
  categories,
}: {
  categories: readonly CategoryOption[];
}) {
  const [scan, setScan] = useState(false);

  if (scan) {
    return <ScanFlow categories={categories} onClose={() => setScan(false)} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Schnelleingabe />
      <Button type="button" variant="secondary" onClick={() => setScan(true)}>
        Barcode scannen
      </Button>
    </div>
  );
}
