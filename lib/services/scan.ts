import "server-only";

import {
  findProductByEan,
  listCategories,
  rememberEan,
} from "@/lib/data/catalog";
import { householdFailure } from "@/lib/data/households";
import { addLine, getBatch, type IntakeLine } from "@/lib/data/intake";
import { computeExpiry } from "@/lib/domain/compute-expiry";
import { formatIsoDate } from "@/lib/domain/date";
import { classifyEan, normalizeEan } from "@/lib/domain/ean";
import { mapOffCategory } from "@/lib/domain/off-category";
import { learningKey, parseRcn } from "@/lib/domain/rcn";
import { normalizeQuantity } from "@/lib/domain/normalize-quantity";
import { resolveShelfLife } from "@/lib/domain/resolve-shelf-life";
import type { StorageLocation } from "@/lib/domain/types";
import { loadShelfLifeRulesForMany } from "@/lib/data/catalog";
import {
  requireMembership,
  type HouseholdResult,
} from "@/lib/services/household";
import { addOwnProduct } from "@/lib/services/intake";

/**
 * Der Anwendungsfall "etwas gescannt".
 *
 * ======================================================================
 * WAS EIN SCAN EHRLICH BRINGT
 * ======================================================================
 * Keine Produktdatenbank liefert ein Haltbarkeitsdatum — das haengt an der
 * Charge, nicht am Produkt. Der Gewinn eines Scans ist also "Name
 * gespart", nicht "Datum gespart". Bei einem Artikel, dessen Namen man in
 * vier Sekunden tippt, ist das wenig.
 *
 * Der Gewinn liegt beim ZWEITEN Scan desselben Produkts: Dann greift die
 * gelernte Zuordnung, und aus dem Scan wird ein Antippen — ohne
 * Netzzugriff, ohne Fremdanbieter. Gerade bei Schweizer Eigenmarken, die
 * in keiner globalen Datenbank stehen, ist das der einzige Weg, der
 * ueberhaupt funktioniert. Darauf ist dieser Ablauf ausgelegt.
 *
 * ======================================================================
 * DIE REIHENFOLGE, UND WARUM SIE SO IST
 * ======================================================================
 *  1. `classifyEan` — ohne jeden Netzzugriff. Ein Waagenetikett
 *     (Praefix 20-29) gilt nur im Laden, der es gedruckt hat; eine Abfrage
 *     dagegen MUSS scheitern. Sofort zu sagen "hier kann ich nicht helfen"
 *     ist ehrlicher als zwei Sekunden zu laden und dann dasselbe.
 *  2. Die eigene Zuordnung und der Katalog. Ein EAN ist eine EXAKTE
 *     Kennung — hier braucht es keine Aehnlichkeitsschwelle und kein
 *     `matchProduct`. Treffer heisst Treffer.
 *  3. Open Food Facts, mit hartem Zeitlimit. Das Ergebnis wird NICHT
 *     automatisch uebernommen, sondern als Vorschlag zurueckgegeben: Der
 *     Name stimmt dann meist, aber die Kategorie ist geraten — und eine
 *     falsche Kategorie heisst eine falsche Haltbarkeit. Das ist die Lehre
 *     aus der Messung an echten Bons, und sie gilt hier genauso.
 */

function today(): string {
  return formatIsoDate(Date.now());
}

export interface ScanSuggestion {
  readonly name: string;
  readonly categoryId: string | null;
  readonly source: "openfoodfacts";
  /** Mengenangabe als Text, nur zur Anzeige. */
  readonly quantity: string | null;
}

export type ScanOutcome =
  /** Bekannt — die Zeile liegt schon im Entwurf. */
  | {
      readonly kind: "added";
      readonly line: IntakeLine;
      readonly via: "learned" | "catalog";
    }
  /**
   * Ladeninternes Waagenetikett, zu dem noch nichts gelernt wurde.
   *
   * Kein Fehler und keine Sackgasse: Der Artikelschluessel ist stabil, der
   * Nutzer kann also einmal zuordnen und ab dann trifft jedes weitere
   * Stueck. Der eingedruckte Preis wird mitgegeben — Vorschlag, nicht
   * Tatsache.
   */
  | {
      readonly kind: "restricted";
      readonly itemKey: string | null;
      readonly priceChf: number | null;
    }
  /** Pruefziffer falsch — die Kamera hat sich verlesen. */
  | { readonly kind: "invalid" }
  /** Buch, Zeitschrift, Gutschein. Kein Lebensmittel, keine Abfrage. */
  | { readonly kind: "non-food" }
  /** Unbekannt. Mit Vorschlag, wenn Open Food Facts etwas wusste. */
  | {
      readonly kind: "unknown";
      readonly ean: string;
      readonly suggestion: ScanSuggestion | null;
    };

async function guardBatch(
  householdId: string,
  batchId: string,
): Promise<HouseholdResult<null>> {
  const membership = await requireMembership(householdId);
  if (!membership.ok) return membership;

  const batch = await getBatch(batchId);
  if (!batch.ok) return batch;
  if (!batch.data || batch.data.householdId !== householdId) {
    return householdFailure("not_a_member");
  }
  return { ok: true, data: null };
}

/**
 * Legt eine Zeile fuer ein BEKANNTES Produkt an.
 *
 * `accepted` ist hier true und die Sicherheit 1, ohne Abgleich: Ein EAN ist
 * eine exakte Kennung. Eine Aehnlichkeitsschwelle waere hier nicht
 * vorsichtig, sondern falsch — sie wuerde einen eindeutigen Treffer
 * kuenstlich in Zweifel ziehen.
 */
async function zeileFuerProdukt(
  householdId: string,
  batchId: string,
  produkt: {
    id: string;
    name: string;
    categoryId: string | null;
    defaultUnit: string;
    defaultStorage: StorageLocation | null;
  },
  storage: StorageLocation | null,
  optionen?: { accepted?: boolean; priceChf?: number | null },
): Promise<HouseholdResult<IntakeLine>> {
  const ort: StorageLocation = storage ?? produkt.defaultStorage ?? "pantry";
  const { qty, unit } = normalizeQuantity(1, produkt.defaultUnit);

  const regeln = await loadShelfLifeRulesForMany(
    [produkt.id],
    produkt.categoryId ? [produkt.categoryId] : [],
  );
  if (!regeln.ok) return regeln;

  const shelfLife = resolveShelfLife({
    productId: produkt.id,
    categoryId: produkt.categoryId,
    householdId,
    storage: ort,
    rules: regeln.data,
  });

  const expiry = computeExpiry({ addedOn: today(), shelfLife });

  return addLine({
    batchId,
    rawText: produkt.name,
    productId: produkt.id,
    matchConfidence: 1,
    quantity: qty,
    unit,
    storage: ort,
    suggestedExpiresAt: expiry.expiresAt,
    expirySource: expiry.source,
    accepted: optionen?.accepted ?? true,
    priceChf: optionen?.priceChf ?? null,
  });
}

/**
 * Ein Scan, von vorne bis hinten.
 *
 * Wirft nie. Jeder Fehlerfall hat ein eigenes Ergebnis, damit die
 * Oberflaeche etwas Sinnvolles anzeigen kann statt einer Fehlermeldung.
 */
export async function captureScan(input: {
  readonly householdId: string;
  readonly batchId: string;
  readonly ean: string;
  readonly storage?: StorageLocation | null;
  /**
   * Was Open Food Facts gesagt hat — ABGEFRAGT VOM BROWSER, nicht hier.
   *
   * Open Food Facts begrenzt Leseanfragen auf 15 pro Minute und
   * IP-Adresse. Auf Vercel teilen alle Nutzer dieselben Ausgangsadressen;
   * serverseitig gaelten die 15 also fuer die ganze Anwendung, und ein
   * einziger Wocheneinkauf wuerde sie fuer alle aufbrauchen. Vom Geraet
   * aus zaehlt die Grenze pro Nutzer — deshalb fragt die Oberflaeche und
   * reicht das Ergebnis hierher.
   *
   * Die Kategorie wird hier abgebildet, nicht dort: Die Zuordnung auf
   * unsere 27 Kategorien ist Fachlogik und gehoert an eine Stelle, an der
   * sie getestet ist.
   */
  readonly offSuggestion?: {
    readonly name: string;
    readonly categoryTags: readonly string[];
    readonly quantity?: string | null;
  } | null;
}): Promise<HouseholdResult<ScanOutcome>> {
  const guard = await guardBatch(input.householdId, input.batchId);
  if (!guard.ok) return guard;

  const ean = normalizeEan(input.ean);

  // 1. Ohne jeden Netzzugriff entscheiden, ob sich eine Abfrage lohnt.
  const art = classifyEan(ean);
  if (art === "invalid") return { ok: true, data: { kind: "invalid" } };
  if (art === "non-food") return { ok: true, data: { kind: "non-food" } };

  // Waagenetikett: Der Vollcode loest nirgends auf, aber der Artikelteil
  // ist stabil. Also erst nachsehen, ob dieser Haushalt ihn schon kennt —
  // und nur wenn nicht, den Nutzer fragen.
  if (art === "restricted") {
    const rcn = parseRcn(ean);
    if (!rcn) {
      return {
        ok: true,
        data: { kind: "restricted", itemKey: null, priceChf: null },
      };
    }

    const gelernt = await findProductByEan(rcn.itemKey, input.householdId);
    if (!gelernt.ok) return gelernt;

    if (gelernt.data) {
      // NICHT vorangehakt, trotz Treffer: Ob sich die Artikelschluessel
      // zweier Haendler ueberschneiden koennen, ist nicht belegt. Ein Blick
      // kostet eine Sekunde, eine stille Verwechslung kostet eine falsche
      // Ablaufwarnung.
      const zeile = await zeileFuerProdukt(
        input.householdId,
        input.batchId,
        gelernt.data,
        input.storage ?? null,
        { accepted: false, priceChf: rcn.priceChf },
      );
      if (!zeile.ok) return zeile;
      return {
        ok: true,
        data: { kind: "added", line: zeile.data, via: "learned" },
      };
    }

    return {
      ok: true,
      data: {
        kind: "restricted",
        itemKey: rcn.itemKey,
        priceChf: rcn.priceChf,
      },
    };
  }

  // 2. Eigene Zuordnung, dann Katalog. Exakte Kennung, keine Schwelle.
  const bekannt = await findProductByEan(ean, input.householdId);
  if (!bekannt.ok) return bekannt;

  if (bekannt.data) {
    const zeile = await zeileFuerProdukt(
      input.householdId,
      input.batchId,
      bekannt.data,
      input.storage ?? null,
    );
    if (!zeile.ok) return zeile;

    // Ob der Treffer aus der eigenen Zuordnung oder dem globalen Katalog
    // kam, laesst sich daran ablesen, ob das Produkt dem Haushalt gehoert
    // oder global ist — fuer die Oberflaeche der Unterschied zwischen
    // "kennst du schon" und "steht im Katalog".
    return {
      ok: true,
      data: {
        kind: "added",
        line: zeile.data,
        via: bekannt.data.householdId ? "learned" : "catalog",
      },
    };
  }

  // 3. Der Vorschlag vom Browser, falls es einen gibt. Ein Fehlschlag ist
  //    hier der Normalfall — bei Schweizer Eigenmarken kennt Open Food
  //    Facts die meisten Produkte nicht.
  const off = input.offSuggestion ?? null;
  if (!off || off.name.trim().length === 0) {
    return { ok: true, data: { kind: "unknown", ean, suggestion: null } };
  }

  // Die Kategorie wird NICHT uebernommen, nur vorgeschlagen. Sie ist aus
  // einer fremden Taxonomie abgeleitet, und eine falsche Kategorie heisst
  // eine falsche Haltbarkeit. Ein Antippen bestaetigt.
  const kategorien = await listCategories();
  const slug = kategorien.ok
    ? mapOffCategory(
        off.categoryTags,
        kategorien.data.map((k) => k.slug),
      )
    : null;
  const categoryId = slug
    ? ((kategorien.ok
        ? kategorien.data.find((k) => k.slug === slug)?.id
        : null) ?? null)
    : null;

  return {
    ok: true,
    data: {
      kind: "unknown",
      ean,
      suggestion: {
        name: off.name.trim(),
        categoryId,
        source: "openfoodfacts",
        quantity: off.quantity ?? null,
      },
    },
  };
}

/**
 * Bestaetigt einen unbekannten Scan: legt die Zeile an UND merkt sich den
 * Code.
 *
 * Das Merken ist der eigentliche Zweck. Ohne es waere jeder Scan desselben
 * Produkts wieder derselbe Aufwand; mit ihm trifft der naechste sofort als
 * `added/learned`.
 *
 * Ohne `productId` entsteht ein haushaltseigenes Produkt. Das ist noetig,
 * nicht bequem: Die Zuordnungstabelle braucht ein Produkt, auf das sie
 * zeigen kann. Und es ist richtig so — ein Artikel, den der globale Katalog
 * nicht kennt, gehoert nach Konzept 5.2 dem Haushalt und nicht der Welt.
 */
export async function resolveUnknownScan(input: {
  readonly householdId: string;
  readonly batchId: string;
  readonly ean: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly productId?: string | null;
  readonly storage?: StorageLocation | null;
}): Promise<HouseholdResult<IntakeLine>> {
  const guard = await guardBatch(input.householdId, input.batchId);
  if (!guard.ok) return guard;

  // Der LERNSCHLUESSEL, nicht der Vollcode: Bei einem Waagenetikett ist
  // der Vollcode bei jedem Stueck anders, nur der Artikelteil bleibt. Wer
  // hier den Vollcode speicherte, lernte etwas, das nie wieder trifft.
  const schluessel = learningKey(input.ean);
  if (!schluessel) return householdFailure("validation_failed");

  const art = classifyEan(normalizeEan(input.ean));
  if (art === "invalid" || art === "non-food") {
    return householdFailure("validation_failed");
  }

  const name = input.name.trim();
  if (name.length === 0) return householdFailure("empty_input");

  // Entweder zeigt der Nutzer auf ein bestehendes Produkt, oder es entsteht
  // ein neues, das ihm gehoert.
  let produktId = input.productId ?? null;
  let kategorieId = input.categoryId;
  let einheit = "piece";
  let ort = input.storage ?? null;

  if (!produktId) {
    const neu = await addOwnProduct({
      householdId: input.householdId,
      name,
      categoryId: input.categoryId,
      defaultUnit: "piece",
      defaultStorage: ort,
    });
    if (!neu.ok) return neu;

    produktId = neu.data.id;
    kategorieId = neu.data.categoryId;
    einheit = neu.data.defaultUnit;
    ort = ort ?? neu.data.defaultStorage;
  }

  // Erst merken, dann die Zeile anlegen: Schlaegt das Merken fehl, hat der
  // Nutzer nichts gewonnen und soll es erfahren. Scheitert umgekehrt nur
  // die Zeile, bleibt die Zuordnung erhalten und hilft beim naechsten Mal.
  const gemerkt = await rememberEan({
    householdId: input.householdId,
    ean: schluessel,
    productId: produktId,
  });
  if (!gemerkt.ok) return gemerkt;

  return zeileFuerProdukt(
    input.householdId,
    input.batchId,
    {
      id: produktId,
      name,
      categoryId: kategorieId,
      defaultUnit: einheit,
      defaultStorage: ort,
    },
    ort,
  );
}
