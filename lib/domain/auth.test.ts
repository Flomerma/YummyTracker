import { describe, expect, it } from "vitest";

import {
  authErrorMessage,
  isValidEmail,
  normalizeEmail,
  safeNextPath,
} from "./auth";
import { resolveOrigin } from "./origin";

describe("normalizeEmail", () => {
  it("entfernt Leerraum und schreibt klein", () => {
    expect(normalizeEmail("  Anna.Muster@Example.CH \n")).toBe(
      "anna.muster@example.ch",
    );
  });
});

describe("isValidEmail", () => {
  it("akzeptiert uebliche Adressen", () => {
    expect(isValidEmail("anna.muster@example.ch")).toBe(true);
    expect(isValidEmail("a+b@sub.example.co.uk")).toBe(true);
  });

  it("weist offensichtlichen Unsinn ab", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("anna")).toBe(false);
    expect(isValidEmail("anna@example")).toBe(false);
    expect(isValidEmail("anna @example.ch")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.ch`)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("laesst eigene Pfade durch", () => {
    expect(safeNextPath("/vorrat")).toBe("/vorrat");
    expect(safeNextPath("/vorrat?lagerort=kuehlschrank")).toBe(
      "/vorrat?lagerort=kuehlschrank",
    );
  });

  it("blockt offene Weiterleitungen", () => {
    expect(safeNextPath("https://boese.example")).toBe("/");
    expect(safeNextPath("//boese.example")).toBe("/");
    expect(safeNextPath("/\\boese.example")).toBe("/");
    expect(safeNextPath("vorrat")).toBe("/");
  });

  it("faellt bei leerer Eingabe auf den Vorgabewert zurueck", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined, "/vorrat")).toBe("/vorrat");
    expect(safeNextPath("")).toBe("/");
  });
});

describe("authErrorMessage", () => {
  it("uebersetzt bekannte Codes", () => {
    expect(authErrorMessage("otp_expired")).toContain("abgelaufen");
  });

  it("hat fuer alles andere einen Satz", () => {
    expect(authErrorMessage("voellig_unbekannt")).toContain("nicht geklappt");
    expect(authErrorMessage(null)).toContain("nicht geklappt");
  });
});

describe("resolveOrigin", () => {
  it("bevorzugt die gesetzte Wunschdomain", () => {
    expect(
      resolveOrigin({
        siteUrl: "https://yummytracker.example.ch/",
        vercelUrl: "x.vercel.app",
      }),
    ).toBe("https://yummytracker.example.ch");
  });

  it("nutzt in Vorschauen die Vercel-Adresse und ergaenzt das Schema", () => {
    expect(
      resolveOrigin({ vercelUrl: "yummytracker-git-stufe0-team.vercel.app" }),
    ).toBe("https://yummytracker-git-stufe0-team.vercel.app");
  });

  it("leitet lokal http ab", () => {
    expect(resolveOrigin({ host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("nimmt bei mehreren Weiterleitungs-Kopfzeilen den ersten Wert", () => {
    expect(
      resolveOrigin({
        forwardedHost: "a.example, b.example",
        forwardedProto: "https, http",
      }),
    ).toBe("https://a.example");
  });

  it("hat einen Notnagel", () => {
    expect(resolveOrigin({})).toBe("http://localhost:3000");
  });
});
