import { describe, expect, it } from "vitest";

import {
  cameraProblem,
  DETECTOR_UNAVAILABLE,
  parsePrice,
  createStableReader,
  STABLE_READS_REQUIRED,
} from "./scanner-logic";

describe("createStableReader", () => {
  it("meldet einen Code erst, wenn er oft genug hintereinander kam", () => {
    const push = createStableReader(2);
    expect(push("7610200000018")).toBeNull();
    expect(push("7610200000018")).toBe("7610200000018");
  });

  it("faengt einen Verleser ab, der nur einmal auftaucht", () => {
    // Zwei vertauschte Ziffern koennen eine gueltige Pruefziffer ergeben.
    // Genau dagegen ist die Wiederholung da.
    const push = createStableReader(2);
    expect(push("7610200000018")).toBeNull();
    expect(push("7610200000810")).toBeNull();
    expect(push("7610200000018")).toBeNull();
    expect(push("7610200000018")).toBe("7610200000018");
  });

  it("laesst ein unscharfes Bild dazwischen nicht die Serie abbrechen", () => {
    const push = createStableReader(2);
    expect(push("7610200000018")).toBeNull();
    expect(push(null)).toBeNull();
    expect(push("7610200000018")).toBe("7610200000018");
  });

  it("meldet denselben Code nur einmal, auch wenn er im Bild bleibt", () => {
    // Sonst legt die Hand, die noch im Bild ist, denselben Joghurt dreimal an.
    const push = createStableReader(2);
    push("7610200000018");
    expect(push("7610200000018")).toBe("7610200000018");
    expect(push("7610200000018")).toBeNull();
    expect(push("7610200000018")).toBeNull();
  });

  it("meldet nach dem ersten Treffer auch keinen anderen Code mehr", () => {
    const push = createStableReader(2);
    push("7610200000018");
    push("7610200000018");
    push("4000417025005");
    expect(push("4000417025005")).toBeNull();
  });

  it("verwendet standardmaessig die festgelegte Anzahl Lesungen", () => {
    const push = createStableReader();
    let result: string | null = null;
    for (let i = 0; i < STABLE_READS_REQUIRED; i++) {
      result = push("7610200000018");
    }
    expect(result).toBe("7610200000018");
  });
});

describe("cameraProblem", () => {
  it("bietet bei verweigerter Erlaubnis keinen sinnlosen zweiten Versuch an", () => {
    // Der Browser fragt nicht noch einmal. Ein Knopf "nochmal", der nichts
    // tut, ist schlimmer als keiner.
    const p = cameraProblem({ name: "NotAllowedError" });
    expect(p.retryLive).toBe(false);
    expect(p.hint).toMatch(/Foto/);
  });

  it("bietet bei belegter Kamera einen zweiten Versuch an", () => {
    expect(cameraProblem({ name: "NotReadableError" }).retryLive).toBe(true);
  });

  it("kennt den Fall ohne passende Kamera", () => {
    const p = cameraProblem({ name: "NotFoundError" });
    expect(p.retryLive).toBe(false);
  });

  it("faellt bei unbekannten Fehlern auf eine brauchbare Meldung zurueck", () => {
    for (const fehler of [
      new Error("x"),
      "Zeichenkette",
      null,
      undefined,
      42,
    ]) {
      const p = cameraProblem(fehler);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.hint).toMatch(/Foto|tippe/);
    }
  });

  it("nennt in jeder Meldung einen Weg nach vorn", () => {
    for (const name of [
      "NotAllowedError",
      "SecurityError",
      "NotFoundError",
      "OverconstrainedError",
      "NotReadableError",
      "AbortError",
      "Unbekannt",
    ]) {
      expect(cameraProblem({ name }).hint).toMatch(/Foto|tippe|nochmal/);
    }
  });
});

describe("DETECTOR_UNAVAILABLE", () => {
  it("schiebt die Schuld nicht auf die Kamera", () => {
    // Laedt die Erkennung nicht, ist die Kamera unschuldig. Wer "Kamera"
    // liest, sucht an der falschen Stelle.
    expect(DETECTOR_UNAVAILABLE.title).not.toMatch(/Kamera/);
  });

  it("bietet einen zweiten Versuch und das Eintippen an", () => {
    expect(DETECTOR_UNAVAILABLE.retryLive).toBe(true);
    expect(DETECTOR_UNAVAILABLE.hint).toMatch(/tippe/);
  });
});

describe("parsePrice", () => {
  it("nimmt Punkt und Komma an", () => {
    expect(parsePrice("4.50")).toBe(4.5);
    expect(parsePrice("4,50")).toBe(4.5);
  });

  it("gibt bei leerem Feld null zurueck — der Preis ist freiwillig", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("   ")).toBeNull();
  });

  it("macht aus Unsinn null statt einer falschen Zahl", () => {
    // Eine falsche Zahl wuerde still in die Weggeworfen-Auswertung wandern.
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("-3")).toBeNull();
    expect(parsePrice("1e9")).toBeNull();
  });

  it("rundet auf Rappen", () => {
    expect(parsePrice("4.555")).toBe(4.56);
  });
});
