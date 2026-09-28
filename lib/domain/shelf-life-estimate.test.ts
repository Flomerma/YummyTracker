import { describe, expect, it } from "vitest";

import {
  isPlausibleEstimate,
  MAX_SHELF_LIFE_DAYS,
  MIN_ESTIMATE_CONFIDENCE,
} from "./shelf-life-estimate";

const gut = { daysUnopened: 7, daysOpened: 3, confidence: 0.8 };

describe("isPlausibleEstimate", () => {
  it("nimmt eine gewoehnliche Schaetzung an", () => {
    expect(isPlausibleEstimate(gut)).toBe(true);
  });

  it("nimmt daysOpened = null an — nicht alles laesst sich oeffnen", () => {
    expect(isPlausibleEstimate({ ...gut, daysOpened: null })).toBe(true);
  });

  it("lehnt ab, wenn geoeffnet laenger haelt als ungeoeffnet", () => {
    // Das Modell hat die Frage missverstanden; der Wert darf nicht in den
    // Katalog, weil er dort fuer alle Haushalte gaelte.
    expect(
      isPlausibleEstimate({ ...gut, daysUnopened: 3, daysOpened: 7 }),
    ).toBe(false);
  });

  it("nimmt an, wenn geoeffnet genau so lange haelt", () => {
    expect(
      isPlausibleEstimate({ ...gut, daysUnopened: 5, daysOpened: 5 }),
    ).toBe(true);
  });

  it("lehnt null Tage ab — das ist keine Haltbarkeit, sondern ein Fehler", () => {
    expect(isPlausibleEstimate({ ...gut, daysUnopened: 0 })).toBe(false);
  });

  it("lehnt negative Tage ab", () => {
    expect(isPlausibleEstimate({ ...gut, daysUnopened: -1 })).toBe(false);
  });

  it("lehnt Bruchteile von Tagen ab", () => {
    expect(isPlausibleEstimate({ ...gut, daysUnopened: 2.5 })).toBe(false);
  });

  it("haelt sich an dieselbe Obergrenze wie die Datenbank", () => {
    expect(
      isPlausibleEstimate({ ...gut, daysUnopened: MAX_SHELF_LIFE_DAYS }),
    ).toBe(true);
    expect(
      isPlausibleEstimate({ ...gut, daysUnopened: MAX_SHELF_LIFE_DAYS + 1 }),
    ).toBe(false);
  });

  it("lehnt unsichere Schaetzungen ab", () => {
    expect(
      isPlausibleEstimate({
        ...gut,
        confidence: MIN_ESTIMATE_CONFIDENCE - 0.01,
      }),
    ).toBe(false);
    expect(
      isPlausibleEstimate({ ...gut, confidence: MIN_ESTIMATE_CONFIDENCE }),
    ).toBe(true);
  });

  it("lehnt Sicherheitswerte ausserhalb von 0 bis 1 ab", () => {
    expect(isPlausibleEstimate({ ...gut, confidence: 1.5 })).toBe(false);
    expect(isPlausibleEstimate({ ...gut, confidence: -0.2 })).toBe(false);
  });

  it("lehnt unbrauchbare Zahlen ab, statt sie durchzureichen", () => {
    expect(isPlausibleEstimate({ ...gut, daysUnopened: NaN })).toBe(false);
    expect(isPlausibleEstimate({ ...gut, confidence: NaN })).toBe(false);
    expect(isPlausibleEstimate({ ...gut, daysUnopened: Infinity })).toBe(false);
  });

  it("lehnt Fehlendes ab, statt sich darauf zu verlassen", () => {
    expect(isPlausibleEstimate(null)).toBe(false);
    expect(isPlausibleEstimate(undefined)).toBe(false);
  });
});
