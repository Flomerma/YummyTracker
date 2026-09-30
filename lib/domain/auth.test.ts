import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  authErrorMessage,
  isValidEmail,
  normalizeEmail,
  safeNextPath,
  validatePassword,
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

describe("validatePassword", () => {
  it("nimmt ein gewoehnliches Passwort an", () => {
    expect(validatePassword("geheim12")).toEqual({
      ok: true,
      value: "geheim12",
    });
  });

  it("verlangt eine Eingabe", () => {
    expect(validatePassword("").ok).toBe(false);
    expect(validatePassword(null).ok).toBe(false);
    expect(validatePassword(undefined).ok).toBe(false);
  });

  it("weist zu kurze Passwoerter ab und nennt die Mindestlaenge", () => {
    const result = validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.message).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it("nimmt genau die Mindestlaenge an", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH)).ok).toBe(true);
  });

  it("nimmt genau die Obergrenze an", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX_LENGTH)).ok).toBe(true);
  });

  it("weist ein Passwort ueber der Obergrenze ab", () => {
    expect(validatePassword("a".repeat(PASSWORD_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
  });

  it("misst in Byte, nicht in Zeichen", () => {
    // 18 Emoji sind 18 Zeichen, aber 72 Byte — gerade noch erlaubt.
    expect(validatePassword("🥕".repeat(18)).ok).toBe(true);
    // 19 sind 76 Byte und wuerden von bcrypt abgeschnitten.
    expect(validatePassword("🥕".repeat(19)).ok).toBe(false);
  });

  it("aendert das Passwort nicht — keine Trimmung, Leerzeichen zaehlen", () => {
    const mitLeerzeichen = "  geheim  ";
    const result = validatePassword(mitLeerzeichen);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(mitLeerzeichen);
  });
});

describe("authErrorMessage bei Passwort-Fehlern", () => {
  it("verraet nicht, ob es das Konto gibt", () => {
    // Waere die Meldung "Konto nicht gefunden" gegen "falsches Passwort"
    // unterscheidbar, liesse sich ueber das Formular herausfinden, wer ein
    // Konto hat.
    expect(authErrorMessage("invalid_credentials")).toBe(
      "E-Mail-Adresse oder Passwort stimmt nicht.",
    );
  });

  it("kennt die Codes der Passwort-Anmeldung", () => {
    for (const code of [
      "weak_password",
      "user_already_exists",
      "email_exists",
    ]) {
      expect(authErrorMessage(code)).not.toBe(
        "Das hat leider nicht geklappt. Bitte nochmals versuchen.",
      );
    }
  });
});
