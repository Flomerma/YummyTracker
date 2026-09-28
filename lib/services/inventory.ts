import "server-only";

import { loadShelfLifeRules } from "@/lib/data/catalog";
import {
  getItem,
  listActiveItems,
  listResolvedItems,
  setItemExpiry,
  setItemOpened,
  setItemStatus,
  type InventoryItem,
} from "@/lib/data/inventory";
import { householdFailure } from "@/lib/data/households";
import { bucketUrgency, URGENCY_ORDER } from "@/lib/domain/bucket-urgency";
import { computeExpiry } from "@/lib/domain/compute-expiry";
import { diffInDays, formatIsoDate } from "@/lib/domain/date";
import { resolveShelfLife } from "@/lib/domain/resolve-shelf-life";
import type {
  InventoryStatus,
  StorageLocation,
  Urgency,
} from "@/lib/domain/types";
import {
  requireMembership,
  type HouseholdResult,
} from "@/lib/services/household";

/**
 * Der Anwendungsfall "Vorrat ansehen und pflegen".
 *
 * Bereitet den Bestand so auf, dass die Seite nur noch darstellen muss:
 * Dringlichkeit eingestuft, verbleibende Tage gerechnet, sortiert. Die
 * Regeln dafuer stehen in lib/domain und sind dort getestet; hier werden
 * sie angewandt.
 */

function today(): string {
  return formatIsoDate(Date.now());
}

/* -------------------------------------------------------------------------
 * Aufbereitete Form
 * ---------------------------------------------------------------------- */

export interface InventoryView extends InventoryItem {
  readonly urgency: Urgency;
  /** Verbleibende Tage; negativ wenn ueberfaellig, null ohne Datum. */
  readonly daysLeft: number | null;
  /**
   * Beruht das Datum auf einem Aufdruck oder auf einer Schaetzung?
   *
   * Das Konzept verlangt die Unterscheidung ausdruecklich: Eine geschaetzte
   * Warnung ist weicher als eine abgelesene, und wer das nicht sieht,
   * vertraut entweder zu viel oder zu wenig.
   */
  readonly estimated: boolean;
  readonly opened: boolean;
}

function toView(item: InventoryItem, day: string): InventoryView {
  return {
    ...item,
    urgency: bucketUrgency(item.expiresAt, day),
    daysLeft: item.expiresAt ? diffInDays(day, item.expiresAt) : null,
    estimated: item.expirySource !== "label" && item.expirySource !== "manual",
    opened: item.openedAt !== null,
  };
}

export interface InventorySection {
  readonly urgency: Urgency;
  readonly items: readonly InventoryView[];
}

export interface InventoryOverview {
  readonly items: readonly InventoryView[];
  /** Nach Dringlichkeit gruppiert, dringendste Gruppe zuerst. */
  readonly sections: readonly InventorySection[];
  /** Wie viele Artikel jetzt Aufmerksamkeit brauchen. */
  readonly urgentCount: number;
  readonly total: number;
}

/**
 * Der Bestand, fertig fuer die Anzeige.
 *
 * Sortiert wird nach DRINGLICHKEIT, nicht alphabetisch. Wer die App
 * oeffnet, soll zuerst sehen, was draengt — nicht, was mit A anfaengt.
 */
export async function loadInventory(
  householdId: string,
  storage?: StorageLocation | null,
): Promise<HouseholdResult<InventoryOverview>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const items = await listActiveItems(householdId);
  if (!items.ok) return items;

  const day = today();
  const views = items.data
    .filter((item) => !storage || item.storage === storage)
    .map((item) => toView(item, day))
    .sort((a, b) => {
      const byUrgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (byUrgency !== 0) return byUrgency;
      // Innerhalb derselben Stufe das frühere Datum zuerst, dann alphabetisch,
      // damit die Reihenfolge zwischen zwei Aufrufen stabil bleibt.
      if (a.expiresAt && b.expiresAt && a.expiresAt !== b.expiresAt) {
        return a.expiresAt < b.expiresAt ? -1 : 1;
      }
      return a.displayName.localeCompare(b.displayName, "de-CH");
    });

  const order: readonly Urgency[] = [
    "expired",
    "today",
    "tomorrow",
    "thisWeek",
    "ok",
    "unknown",
  ];
  const sections = order
    .map((urgency) => ({
      urgency,
      items: views.filter((item) => item.urgency === urgency),
    }))
    .filter((section) => section.items.length > 0);

  const urgentCount = views.filter((item) =>
    ["expired", "today", "tomorrow"].includes(item.urgency),
  ).length;

  return {
    ok: true,
    data: { items: views, sections, urgentCount, total: views.length },
  };
}

/* -------------------------------------------------------------------------
 * Pflegen
 * ---------------------------------------------------------------------- */

async function guardItem(
  householdId: string,
  itemId: string,
): Promise<HouseholdResult<InventoryItem>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const item = await getItem(itemId);
  if (!item.ok) return item;
  if (!item.data || item.data.householdId !== householdId) {
    return householdFailure("not_a_member");
  }
  return { ok: true, data: item.data };
}

/**
 * Die Antwort auf die Nachfrage aus Konzept 4.2.
 *
 * Eine Antwort, drei Wirkungen: Bestand korrigiert, Erinnerung erledigt,
 * Statistik entstanden. Genau deshalb wird nichts geloescht — was hier
 * als `discarded` landet, ist spaeter der Wirkungsnachweis.
 */
export async function resolveItem(
  householdId: string,
  itemId: string,
  status: InventoryStatus,
): Promise<HouseholdResult<null>> {
  const guard = await guardItem(householdId, itemId);
  if (!guard.ok) return guard;

  return setItemStatus(itemId, status);
}

/** Korrigiert das Ablaufdatum — die dritte Antwort: "noch da". */
export async function correctExpiry(
  householdId: string,
  itemId: string,
  expiresAt: string | null,
): Promise<HouseholdResult<null>> {
  const guard = await guardItem(householdId, itemId);
  if (!guard.ok) return guard;

  return setItemExpiry(itemId, expiresAt);
}

/**
 * Markiert einen Artikel als geoeffnet und rechnet das Datum neu.
 *
 * Geoeffnet aendert alles: Eine ungeoeffnete Milch haelt bis zum Aufdruck,
 * eine geoeffnete drei Tage. `computeExpiry` nimmt dabei das FRUEHERE der
 * beiden Daten — der Aufdruck wird durch das Oeffnen nicht laenger gueltig.
 */
export async function markOpened(
  householdId: string,
  itemId: string,
): Promise<HouseholdResult<null>> {
  const guard = await guardItem(householdId, itemId);
  if (!guard.ok) return guard;

  const item = guard.data;
  const day = today();

  const rules = await loadShelfLifeRules(item.productId, item.categoryId);
  if (!rules.ok) return rules;

  const shelfLife = resolveShelfLife({
    productId: item.productId,
    categoryId: item.categoryId,
    householdId,
    storage: item.storage,
    rules: rules.data,
  });

  const expiry = computeExpiry({
    // Der bisherige Wert zaehlt nur dann als Aufdruck, wenn er auch einer
    // war. Eine Schaetzung darf das Oeffnen nicht ueberstimmen.
    labelDate:
      item.expirySource === "label" || item.expirySource === "manual"
        ? item.expiresAt
        : null,
    addedOn: item.addedAt.slice(0, 10),
    openedOn: day,
    shelfLife,
  });

  return setItemOpened(itemId, day, expiry.expiresAt, expiry.source);
}

/* -------------------------------------------------------------------------
 * Auswertung (Grundlage fuer Stufe 4)
 * ---------------------------------------------------------------------- */

export interface WasteSummary {
  readonly consumed: number;
  readonly discarded: number;
  readonly discardedValueChf: number;
  /** Anteil des Weggeworfenen an allem Erledigten, 0 bis 1. */
  readonly wasteRate: number;
}

/**
 * Was der Haushalt seit einem Stichtag verbraucht und weggeworfen hat.
 *
 * Schon jetzt vorhanden, obwohl die Auswertung erst Stufe 4 ist: Die Daten
 * entstehen ab dem ersten Tag, und zeigen laesst sich spaeter nur, was
 * vorher gesammelt wurde.
 */
export async function loadWasteSummary(
  householdId: string,
  since: string,
): Promise<HouseholdResult<WasteSummary>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const items = await listResolvedItems(householdId, since);
  if (!items.ok) return items;

  const consumed = items.data.filter((i) => i.status === "consumed").length;
  const discardedItems = items.data.filter((i) => i.status === "discarded");
  const discarded = discardedItems.length;
  const discardedValueChf = discardedItems.reduce(
    (sum, i) => sum + (i.priceChf ?? 0),
    0,
  );
  const resolved = consumed + discarded;

  return {
    ok: true,
    data: {
      consumed,
      discarded,
      discardedValueChf,
      wasteRate: resolved === 0 ? 0 : discarded / resolved,
    },
  };
}
