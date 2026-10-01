import { describe, expect, it } from "vitest";

import {
  classifyEan,
  eanCheckDigit,
  eanRegistry,
  isRestrictedCirculation,
  isValidEan,
  normalizeEan,
} from "./ean";

describe("normalizeEan", () => {
  it("entfernt Leerzeichen und Bindestriche", () => {
    expect(normalizeEan(" 76 1303-5676497 ")).toBe("7613035676497");
  });

  it("vertraegt Fehlendes, statt zu werfen", () => {
    expect(normalizeEan(null)).toBe("");
    expect(normalizeEan(undefined)).toBe("");
    expect(normalizeEan("")).toBe("");
  });
});

describe("eanCheckDigit", () => {
  it("rechnet die Pruefziffer eines EAN-13 aus", () => {
    // Gegengerechnet von Hand: Gewichte 3 und 1 von rechts.
    expect(eanCheckDigit("590123412345")).toBe(7);
    expect(eanCheckDigit("400638133393")).toBe(1);
  });

  it("weist Nicht-Ziffern ab", () => {
    expect(eanCheckDigit("abc")).toBeNull();
    expect(eanCheckDigit("")).toBeNull();
  });
});

describe("isValidEan", () => {
  it("nimmt gueltige Codes an", () => {
    expect(isValidEan("5901234123457")).toBe(true);
    expect(isValidEan("4006381333931")).toBe(true);
  });

  it("erkennt eine falsche Pruefziffer", () => {
    // Letzte Ziffer verdreht — genau das, was eine Kamera bei schlechtem
    // Licht produziert.
    expect(isValidEan("5901234123458")).toBe(false);
  });

  it("weist unpassende Laengen ab", () => {
    expect(isValidEan("123")).toBe(false);
    expect(isValidEan("59012341234567")).toBe(false);
  });

  it("nimmt auch EAN-8 und UPC-A an", () => {
    // EAN-8: 9638-5074, Pruefziffer selbst gerechnet
    expect(isValidEan(`9638507${eanCheckDigit("9638507")}`)).toBe(true);
    // UPC-A, 12-stellig
    expect(isValidEan(`03600029145${eanCheckDigit("03600029145")}`)).toBe(true);
  });
});

describe("isRestrictedCirculation — die Waagenetiketten", () => {
  it("erkennt den Bereich 20 bis 29", () => {
    // Das ist der Code, den die Waage an der Gemuesetheke druckt. Er gilt
    // nur in diesem Laden und loest global nie auf.
    for (const praefix of ["20", "21", "25", "29"]) {
      const ohnePruef = `${praefix}1234567890`.slice(0, 12);
      const code = `${ohnePruef}${eanCheckDigit(ohnePruef)}`;
      expect(isRestrictedCirculation(code)).toBe(true);
    }
  });

  it("erkennt 02 und 04", () => {
    for (const praefix of ["02", "04"]) {
      const ohnePruef = `${praefix}1234567890`.slice(0, 12);
      const code = `${ohnePruef}${eanCheckDigit(ohnePruef)}`;
      expect(isRestrictedCirculation(code)).toBe(true);
    }
  });

  it("laesst gewoehnliche Codes durch", () => {
    expect(isRestrictedCirculation("7613035676497")).toBe(false); // Schweiz
    expect(isRestrictedCirculation("4006381333931")).toBe(false); // Deutschland
    expect(isRestrictedCirculation("5901234123457")).toBe(false);
  });

  it("urteilt bei kurzen Codes nicht vorschnell", () => {
    // Bei EAN-8 gibt es diesen Bereich nicht in derselben Form. Eine
    // ueberfluessige Abfrage ist der kleinere Fehler als eine verpasste.
    expect(isRestrictedCirculation("96385074")).toBe(false);
  });
});

describe("classifyEan", () => {
  it("meldet global, wenn eine Abfrage Sinn hat", () => {
    expect(classifyEan("7613035676497")).toBe("global");
  });

  it("meldet restricted beim Waagenetikett", () => {
    const ohnePruef = "201234567890";
    expect(classifyEan(`${ohnePruef}${eanCheckDigit(ohnePruef)}`)).toBe(
      "restricted",
    );
  });

  it("prueft die Pruefziffer ZUERST", () => {
    // Ein verlesener Code koennte zufaellig wie ein Waagenetikett aussehen.
    // Dann ist "nochmal scannen" die bessere Antwort als "kann ich nicht".
    const ohnePruef = "201234567890";
    const richtig = eanCheckDigit(ohnePruef)!;
    const falsch = (richtig + 1) % 10;
    expect(classifyEan(`${ohnePruef}${falsch}`)).toBe("invalid");
  });

  it("meldet invalid bei Unsinn", () => {
    expect(classifyEan("")).toBe("invalid");
    expect(classifyEan(null)).toBe("invalid");
    expect(classifyEan("hallo")).toBe("invalid");
  });
});

describe("eanRegistry", () => {
  it("erkennt die Schweizer Praefixe", () => {
    expect(eanRegistry("7613035676497")).toBe("Schweiz und Liechtenstein");
  });

  it("erkennt deutsche Praefixe", () => {
    expect(eanRegistry("4006381333931")).toBe("Deutschland");
  });

  it("schweigt, wenn es den Bereich nicht kennt", () => {
    expect(eanRegistry("9991234567890")).toBeNull();
    expect(eanRegistry("96385074")).toBeNull();
  });
});

describe("classifyEan — was gar kein Lebensmittel ist", () => {
  function mitPruefziffer(ohne: string): string {
    return `${ohne}${eanCheckDigit(ohne)}`;
  }

  it("erkennt Buecher an der ISBN", () => {
    // Wer am Regal versehentlich ein Buch scannt, soll das sofort gesagt
    // bekommen statt zwei Sekunden auf eine Lebensmittelabfrage zu warten.
    expect(classifyEan(mitPruefziffer("978037342279"))).toBe("non-food");
    expect(classifyEan(mitPruefziffer("979012345678"))).toBe("non-food");
  });

  it("erkennt Zeitschriften und Gutscheine", () => {
    expect(classifyEan(mitPruefziffer("977123456789"))).toBe("non-food");
    expect(classifyEan(mitPruefziffer("981234567890"))).toBe("non-food");
    expect(classifyEan(mitPruefziffer("995123456789"))).toBe("non-food");
  });

  it("haelt Lebensmittel davon getrennt", () => {
    expect(classifyEan("7613035676497")).toBe("global");
    expect(classifyEan("4006381333931")).toBe("global");
  });

  it("prueft weiterhin die Pruefziffer zuerst", () => {
    const ohne = "978037342279";
    const falsch = (eanCheckDigit(ohne)! + 1) % 10;
    expect(classifyEan(`${ohne}${falsch}`)).toBe("invalid");
  });
});
