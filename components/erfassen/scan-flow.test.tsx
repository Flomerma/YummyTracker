import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Die Server-Aktionen werden ersetzt: Sie ziehen ueber die Dienstschicht
 * `server-only` herein, das ausserhalb von Next.js gar nicht laedt — und
 * hier geht es ohnehin nur darum, wie die Oberflaeche auf ihre Antwort
 * reagiert.
 */
const scanAction = vi.fn();
const scanZuordnenAction = vi.fn();
vi.mock("@/app/(app)/erfassen/scan-actions", () => ({
  scanAction: (...a: unknown[]) => scanAction(...a),
  scanZuordnenAction: (...a: unknown[]) => scanZuordnenAction(...a),
}));

vi.mock("@/lib/data/openfoodfacts", () => ({
  lookupOpenFoodFacts: vi.fn(async () => null),
}));

// Statt Kamera ein Knopf, der einen Code "erkennt".
vi.mock("./barcode-scanner", () => ({
  BarcodeScanner: ({ onDetected }: { onDetected: (ean: string) => void }) => (
    <button type="button" onClick={() => onDetected("3068320114453")}>
      Code erkannt
    </button>
  ),
}));

import { ScanFlow } from "./scan-flow";

const kategorien = [{ id: "k-getraenke", name: "Getränke" }];

/** Ein unbekanntes Produkt mit Vorschlag — der Weg zum Benennen-Dialog. */
const unbekanntMitVorschlag = {
  ok: true,
  outcome: {
    kind: "unknown",
    ean: "3068320114453",
    suggestion: {
      name: "Evian",
      categoryId: "k-getraenke",
      source: "openfoodfacts",
      quantity: "1.5 l",
    },
  },
};

beforeEach(() => {
  scanAction.mockReset();
  scanZuordnenAction.mockReset();
});

describe("ScanFlow bei einem Fehler der Server-Aktion", () => {
  it("bleibt beim Uebernehmen nicht haengen, wenn die Aktion wirft", async () => {
    // Genau der gemeldete Fehler: Die Server-Aktion scheiterte (fehlender
    // Schluessel im Admin-Client), und der Dialog blieb fuer immer bei
    // "Wird gespeichert …" stehen, ohne dass etwas erfasst wurde.
    scanAction.mockResolvedValue(unbekanntMitVorschlag);
    scanZuordnenAction.mockRejectedValue(new Error("Serverfehler"));
    const user = userEvent.setup();

    render(<ScanFlow categories={kategorien} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Code erkannt" }));
    await user.click(
      await screen.findByRole("button", { name: /Übernehmen und merken/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /nicht gespeichert/i,
    );
    expect(screen.queryByText(/Wird gespeichert/)).not.toBeInTheDocument();
  });

  it("bietet nach dem Fehler einen Weg weiter an", async () => {
    scanAction.mockResolvedValue(unbekanntMitVorschlag);
    scanZuordnenAction.mockRejectedValue(new Error("Serverfehler"));
    const user = userEvent.setup();

    render(<ScanFlow categories={kategorien} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Code erkannt" }));
    await user.click(
      await screen.findByRole("button", { name: /Übernehmen und merken/ }),
    );

    expect(
      await screen.findByRole("button", { name: /Nächsten scannen/ }),
    ).toBeInTheDocument();
  });

  it("bleibt beim Nachschlagen nicht haengen, wenn die Aktion wirft", async () => {
    scanAction.mockRejectedValue(new Error("Serverfehler"));
    const user = userEvent.setup();

    render(<ScanFlow categories={kategorien} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Code erkannt" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/Wird nachgeschlagen/)).not.toBeInTheDocument();
  });
});

describe("ScanFlow im Normalfall", () => {
  it("meldet Erfolg nach dem Uebernehmen", async () => {
    scanAction.mockResolvedValue(unbekanntMitVorschlag);
    scanZuordnenAction.mockResolvedValue({ ok: true, name: "Evian" });
    const user = userEvent.setup();

    render(<ScanFlow categories={kategorien} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Code erkannt" }));
    await user.click(
      await screen.findByRole("button", { name: /Übernehmen und merken/ }),
    );

    expect(await screen.findByText(/Evian hinzugefügt/)).toBeInTheDocument();
  });
});

describe("ScanFlow: der Abbruch-Knopf", () => {
  it("heisst so, wie er wirkt — er erfasst nichts", async () => {
    // "Überspringen" wurde beim ersten echten Einsatz als "erfassen, ohne
    // zu merken" verstanden.
    scanAction.mockResolvedValue(unbekanntMitVorschlag);
    const user = userEvent.setup();

    render(<ScanFlow categories={kategorien} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Code erkannt" }));

    expect(
      await screen.findByRole("button", { name: "Nicht erfassen" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Überspringen/ })).toBeNull();
  });
});
