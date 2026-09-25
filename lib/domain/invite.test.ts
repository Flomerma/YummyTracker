import { describe, expect, it } from "vitest";

import {
  buildInviteUrl,
  DEFAULT_INVITE_VALIDITY_MINUTES,
  DISPLAY_NAME_MAX_LENGTH,
  extractInviteToken,
  HOUSEHOLD_NAME_MAX_LENGTH,
  householdErrorMessage,
  INVITE_PATH,
  INVITE_TOKEN_LENGTH,
  INVITE_TOKEN_PARAM,
  inviteValidityInterval,
  isErrorMarker,
  MAX_INVITE_VALIDITY_MINUTES,
  MIN_INVITE_VALIDITY_MINUTES,
  normalizeName,
  validateDisplayName,
  validateHouseholdName,
  validateInviteToken,
  validateInviteValidity,
} from "./invite";

/** Ein Schluessel in der Form, die create_household_invite() erzeugt. */
const TOKEN = "Zm9vYmFyYmF6cXV4MDEyMzQ1Njc4OWFi";

describe("normalizeName", () => {
  it("faltet jede Art von Leerraum zu einem Leerzeichen", () => {
    expect(normalizeName("  Familie \t Muster \n ")).toBe("Familie Muster");
  });

  it("entfernt auch geschuetzte Leerzeichen aus kopiertem Text", () => {
    // \u00a0 kommt beim Kopieren aus Chat- und Mailfenstern regelmaessig mit.
    expect(normalizeName("WG\u00a0Bahnhofstrasse")).toBe("WG Bahnhofstrasse");
    expect(normalizeName("\u00a0\u00a0")).toBe("");
  });
});

describe("validateHouseholdName", () => {
  it("nimmt einen gewoehnlichen Namen an und gibt ihn gefaltet zurueck", () => {
    const result = validateHouseholdName("  Familie   Muster  ");
    expect(result).toEqual({ ok: true, value: "Familie Muster" });
  });

  it("weist Leeres und reinen Leerraum ab", () => {
    for (const raw of ["", "   ", "\t\n", "\u00a0", null, undefined]) {
      const result = validateHouseholdName(raw);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe("household_name_empty");
    }
  });

  it("laesst die Grenze aus households_name_length genau zu", () => {
    const exact = "a".repeat(HOUSEHOLD_NAME_MAX_LENGTH);
    expect(validateHouseholdName(exact).ok).toBe(true);

    const tooLong = validateHouseholdName("a".repeat(81));
    expect(tooLong.ok === false && tooLong.code).toBe(
      "household_name_too_long",
    );
  });

  it("zaehlt wie Postgres in Zeichen, nicht in UTF-16-Einheiten", () => {
    // 80 Emoji sind 160 UTF-16-Einheiten, fuer char_length aber 80 Zeichen.
    // Ein Laengentest mit ".length" wuerde das faelschlich ablehnen.
    const emoji = "\u{1F9C0}".repeat(HOUSEHOLD_NAME_MAX_LENGTH);
    expect(emoji.length).toBe(160);
    expect(validateHouseholdName(emoji).ok).toBe(true);
    expect(validateHouseholdName(emoji + "\u{1F9C0}").ok).toBe(false);
  });

  it("zaehlt den gefalteten Wert, nicht die Rohform", () => {
    // 80 Zeichen, aber mit doppelten Leerzeichen eingegeben: nach dem Falten
    // passt es. Wuerde roh gezaehlt, waere es faelschlich zu lang.
    const raw = `${"a".repeat(40)}  ${"b".repeat(39)}`;
    expect(raw.length).toBe(81);
    expect(validateHouseholdName(raw)).toEqual({
      ok: true,
      value: `${"a".repeat(40)} ${"b".repeat(39)}`,
    });
  });
});

describe("validateDisplayName", () => {
  it("macht aus einem leeren Feld null und nicht den leeren String", () => {
    // Die Spalte ist nullable, die CHECK-Bedingung verbietet aber ''.
    for (const raw of ["", "   ", null, undefined]) {
      expect(validateDisplayName(raw)).toEqual({ ok: true, value: null });
    }
  });

  it("nimmt einen Namen an und faltet ihn", () => {
    expect(validateDisplayName("  Anna  ")).toEqual({
      ok: true,
      value: "Anna",
    });
  });

  it("haelt die Grenze aus household_members_display_name_length ein", () => {
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(
      true,
    );

    const tooLong = validateDisplayName("a".repeat(61));
    expect(tooLong.ok === false && tooLong.code).toBe("display_name_too_long");
  });
});

describe("buildInviteUrl", () => {
  it("setzt Ursprung, Pfad und Schluessel zusammen", () => {
    expect(buildInviteUrl("https://yummytracker.example.ch", TOKEN)).toBe(
      `https://yummytracker.example.ch${INVITE_PATH}?${INVITE_TOKEN_PARAM}=${TOKEN}`,
    );
  });

  it("vertraegt Schraegstriche und Leerraum am Ursprung", () => {
    expect(buildInviteUrl("http://localhost:3000///", TOKEN)).toBe(
      `http://localhost:3000${INVITE_PATH}?${INVITE_TOKEN_PARAM}=${TOKEN}`,
    );
    expect(buildInviteUrl("  http://localhost:3000/  ", TOKEN)).toBe(
      `http://localhost:3000${INVITE_PATH}?${INVITE_TOKEN_PARAM}=${TOKEN}`,
    );
  });

  it("kodiert einen Schluessel, der die Adresse sonst aufbrechen wuerde", () => {
    // Tritt mit base64url nie auf. Steht hier, damit es nie auftreten kann.
    expect(buildInviteUrl("https://a.example", "x&y=z#w")).toBe(
      `https://a.example${INVITE_PATH}?${INVITE_TOKEN_PARAM}=x%26y%3Dz%23w`,
    );
  });

  it("erzeugt eine Adresse, aus der extractInviteToken wieder herausfindet", () => {
    const url = buildInviteUrl("https://a.example", TOKEN);
    expect(extractInviteToken(url)).toBe(TOKEN);
  });
});

describe("extractInviteToken", () => {
  it("nimmt den blossen Schluessel", () => {
    expect(extractInviteToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("nimmt die ganze eingefuegte Adresse", () => {
    expect(
      extractInviteToken(
        `https://yummytracker.example.ch/beitreten?${INVITE_TOKEN_PARAM}=${TOKEN}`,
      ),
    ).toBe(TOKEN);
  });

  it("findet den Parameter auch hinter anderen und vor einem Anker", () => {
    expect(
      extractInviteToken(
        `https://a.example/beitreten?next=%2Fvorrat&${INVITE_TOKEN_PARAM}=${TOKEN}#oben`,
      ),
    ).toBe(TOKEN);
  });

  it("dekodiert einen kodierten Schluessel", () => {
    expect(
      extractInviteToken(`https://a.example/x?${INVITE_TOKEN_PARAM}=a%2Bb`),
    ).toBe("a+b");
  });

  it("gibt null zurueck, wenn nichts da ist", () => {
    expect(extractInviteToken(null)).toBeNull();
    expect(extractInviteToken(undefined)).toBeNull();
    expect(extractInviteToken("   ")).toBeNull();
    expect(
      extractInviteToken(`https://a.example/x?${INVITE_TOKEN_PARAM}=`),
    ).toBeNull();
  });

  it("wirft nicht bei kaputter Prozentkodierung", () => {
    // decodeURIComponent('%zz') wirft einen URIError. Ein halb kopierter Link
    // darf die Seite nicht abstuerzen lassen, sondern muss "beschaedigt" sein.
    expect(() =>
      extractInviteToken(`https://a.example/x?${INVITE_TOKEN_PARAM}=%zz`),
    ).not.toThrow();
    expect(
      validateInviteToken(`https://a.example/x?${INVITE_TOKEN_PARAM}=%zz`).ok,
    ).toBe(false);
  });
});

describe("validateInviteToken", () => {
  it("nimmt einen Schluessel in der Form aus der Migration an", () => {
    expect(TOKEN).toHaveLength(INVITE_TOKEN_LENGTH);
    expect(validateInviteToken(TOKEN)).toEqual({ ok: true, value: TOKEN });
  });

  it("nimmt das ganze base64url-Alphabet an", () => {
    const token = "ab-cd_efghijklmnopqrstuvwxyz0123";
    expect(token).toHaveLength(INVITE_TOKEN_LENGTH);
    expect(validateInviteToken(token).ok).toBe(true);
  });

  it("weist klassisches base64 ab, weil der Schluessel url-sicher ist", () => {
    const token = "ab+cd/efghijklmnopqrstuvwxyz0123";
    const result = validateInviteToken(token);
    expect(result.ok === false && result.code).toBe("invite_token_malformed");
  });

  it("unterscheidet fehlend von beschaedigt", () => {
    const missing = validateInviteToken("  ");
    expect(missing.ok === false && missing.code).toBe("invite_token_missing");

    const malformed = validateInviteToken("viel zu kurz");
    expect(malformed.ok === false && malformed.code).toBe(
      "invite_token_malformed",
    );
  });

  it("weist Unsinn ab, der wie ein Angriffsversuch aussieht", () => {
    for (const raw of [
      "<script>alert(1)</script>....................",
      "'; drop table households; --",
      "a".repeat(129),
    ]) {
      expect(validateInviteToken(raw).ok).toBe(false);
    }
  });
});

describe("validateInviteValidity", () => {
  it("nimmt die Vorgabe, wenn nichts angegeben ist", () => {
    expect(validateInviteValidity(null)).toEqual({
      ok: true,
      value: DEFAULT_INVITE_VALIDITY_MINUTES,
    });
    expect(validateInviteValidity(undefined).ok).toBe(true);
  });

  it("laesst genau die Spanne aus create_household_invite zu", () => {
    expect(validateInviteValidity(MIN_INVITE_VALIDITY_MINUTES).ok).toBe(true);
    expect(validateInviteValidity(MAX_INVITE_VALIDITY_MINUTES).ok).toBe(true);
    expect(validateInviteValidity(MIN_INVITE_VALIDITY_MINUTES - 1).ok).toBe(
      false,
    );
    expect(validateInviteValidity(MAX_INVITE_VALIDITY_MINUTES + 1).ok).toBe(
      false,
    );
  });

  it("die Vorgabe liegt in der zulaessigen Spanne", () => {
    expect(validateInviteValidity(DEFAULT_INVITE_VALIDITY_MINUTES).ok).toBe(
      true,
    );
    expect(MAX_INVITE_VALIDITY_MINUTES).toBe(43200);
  });

  it("weist ab, was Postgres nicht als Minutenzahl lesen wuerde", () => {
    for (const value of [0, -1, 7.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateInviteValidity(value);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe("invalid_validity");
    }
  });
});

describe("inviteValidityInterval", () => {
  it("erzeugt eine Textform, die Postgres als interval liest", () => {
    expect(inviteValidityInterval(DEFAULT_INVITE_VALIDITY_MINUTES)).toBe(
      "10080 minutes",
    );
    expect(inviteValidityInterval(5)).toBe("5 minutes");
  });
});

describe("isErrorMarker", () => {
  it("erkennt die Marker aus dem DETAIL-Feld", () => {
    expect(isErrorMarker("not_a_member")).toBe(true);
    expect(isErrorMarker("last_owner_protected")).toBe(true);
  });

  it("weist ab, was Postgres sonst noch ins DETAIL-Feld schreibt", () => {
    // Bei einer verletzten CHECK-Bedingung steht dort ein ganzer Satz.
    expect(isErrorMarker("Failing row contains (1, Familie, null).")).toBe(
      false,
    );
    expect(isErrorMarker("Key (token_hash)=(abc) already exists.")).toBe(false);
    expect(isErrorMarker(null)).toBe(false);
    expect(isErrorMarker("")).toBe(false);
    expect(isErrorMarker("ab")).toBe(false);
  });
});

describe("householdErrorMessage", () => {
  it("uebersetzt jeden Marker, den die Stufe-0-Migrationen werfen", () => {
    const markers = [
      "not_authenticated",
      "not_a_member",
      "not_allowed",
      "invite_not_found",
      "invite_already_used",
      "invite_expired",
      "invalid_validity",
      "invite_token_missing",
      "last_owner_protected",
    ];

    for (const marker of markers) {
      const message = householdErrorMessage(marker);
      expect(message).not.toContain("nicht geklappt");
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("nennt beim abgelaufenen Link den Grund und den Ausweg", () => {
    expect(householdErrorMessage("invite_expired")).toContain("abgelaufen");
    expect(householdErrorMessage("invite_already_used")).toContain(
      "bereits verwendet",
    );
  });

  it("hat fuer alles andere einen Satz", () => {
    expect(householdErrorMessage("voellig_unbekannt")).toContain(
      "nicht geklappt",
    );
    expect(householdErrorMessage(null)).toContain("nicht geklappt");
    expect(householdErrorMessage(undefined)).toContain("nicht geklappt");
  });

  it("faengt auch SQLSTATE und PostgREST-Codes ab", () => {
    expect(householdErrorMessage("42501")).toContain("Kein Zugriff");
    expect(householdErrorMessage("PGRST301")).toContain("Anmeldung");
  });
});
