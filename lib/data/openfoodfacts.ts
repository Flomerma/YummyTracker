/**
 * Nachschlagen bei Open Food Facts.
 *
 * ======================================================================
 * WAS MAN VON DIESER QUELLE ERWARTEN DARF — UND WAS NICHT
 * ======================================================================
 * Sie liefert einen Namen, oft eine Kategorie, manchmal ein Bild. Sie
 * liefert KEIN HALTBARKEITSDATUM — das steht in keiner Produktdatenbank
 * der Welt, weil es nicht am Produkt haengt, sondern an der Charge.
 *
 * Der Gewinn eines Treffers ist also "Name gespart", nicht "Datum
 * gespart". Das Datum kommt bei uns in jedem Fall aus der
 * Haltbarkeits-Kette (Konzept 4.3). Diese Einschraenkung gehoert in jede
 * Beschreibung dessen, was der Scanner leistet.
 *
 * Bei Schweizer Eigenmarken — M-Budget, Prix Garantie, Naturaplan — ist
 * die Abdeckung ausserdem lueckenhaft. Ein Fehlschlag ist hier der
 * Normalfall, nicht die Ausnahme, und muss sich entsprechend anfuehlen.
 *
 * ======================================================================
 * WARUM DAS IM BROWSER LAEUFT UND NICHT AUF DEM SERVER
 * ======================================================================
 * Diese Datei traegt BEWUSST kein 'server-only'. Open Food Facts begrenzt
 * Leseanfragen auf 15 pro Minute und IP-Adresse. Auf Vercel teilen sich
 * alle Nutzer dieselben Ausgangsadressen — serverseitig gaelten die 15
 * also fuer die GANZE Anwendung, und ein einziger Mensch, der einen
 * Wocheneinkauf scannt, wuerde sie fuer alle anderen aufbrauchen.
 *
 * Die Dokumentation von Open Food Facts nennt den Ausweg ausdruecklich:
 * Kommen die Anfragen direkt vom Geraet des Nutzers, gilt die Grenze pro
 * Nutzer. Deshalb ruft die Oberflaeche diese Funktion auf und reicht das
 * Ergebnis als VORSCHLAG an den Server weiter — nicht umgekehrt.
 *
 * Die Schichtenregel bleibt gewahrt: Dies ist ein Zugriff auf eine fremde
 * Datenquelle und gehoert damit nach lib/data. Dass er in beiden
 * Laufzeitumgebungen funktioniert, aendert daran nichts. Was er NICHT darf
 * und auch nicht tut: Supabase anfassen oder ein Geheimnis kennen.
 *
 * ======================================================================
 * WARUM EIN HARTES ZEITLIMIT
 * ======================================================================
 * Der Nutzer steht vor dem Regal und hat gerade gescannt. Zwei Sekunden
 * Warten sind das Aeusserste; danach ist Weitertippen schneller als jede
 * Antwort. Deshalb bricht der Aufruf ab, statt zu warten — und liefert
 * `null` statt zu werfen. Ein Scan darf den Erfassungsablauf nie
 * abbrechen.
 */

/**
 * Open Food Facts verlangt in den Nutzungsbedingungen eine aussagekraeftige
 * Kennung mit Kontaktmoeglichkeit. Anfragen ohne werden gedrosselt oder
 * gesperrt.
 */
const USER_AGENT =
  "yummytracker/0.1 (Semesterarbeit GIBZ; https://github.com/Flomerma/YummyTracker)";

/** Mehr als das wartet niemand vor dem Regal. */
export const OFF_TIMEOUT_MS = 2000;

const BASE = "https://world.openfoodfacts.org/api/v2/product";

/**
 * Nur die Felder holen, die wir verwenden. Die vollstaendige Antwort ist
 * mehrere hundert Kilobyte gross — bei einem Mobilfunkzugang im Laden ist
 * das der Unterschied zwischen knapp und zu langsam.
 */
const FIELDS = [
  "product_name",
  "product_name_de",
  "generic_name_de",
  "brands",
  "quantity",
  "categories_tags",
].join(",");

export interface OffProduct {
  readonly ean: string;
  /** Bester verfuegbarer Name, deutsch bevorzugt. */
  readonly name: string;
  readonly brand: string | null;
  /** Mengenangabe als Text, z.B. "500 g". Nicht ausgewertet, nur angezeigt. */
  readonly quantity: string | null;
  /** Die Kategorieangaben, z.B. ["en:dairies", "en:yogurts"]. */
  readonly categoryTags: readonly string[];
}

interface OffResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_name_de?: string;
    generic_name_de?: string;
    brands?: string;
    quantity?: string;
    categories_tags?: string[];
  };
}

/**
 * Der beste Name aus dem, was die Antwort hergibt.
 *
 * Deutsch zuerst, weil die App deutsch ist und ein franzoesischer Name den
 * Abgleich mit unserem Katalog zusaetzlich erschwert. Der Markenname wird
 * NICHT angehaengt: `normalizeName` wuerde ihn ohnehin wieder entfernen,
 * und im Pruef-Schritt liest sich "Vollmilch" besser als "Emmi Vollmilch".
 */
function besterName(p: NonNullable<OffResponse["product"]>): string | null {
  const kandidaten = [p.product_name_de, p.generic_name_de, p.product_name];
  for (const k of kandidaten) {
    const wert = typeof k === "string" ? k.trim() : "";
    if (wert.length > 0) return wert;
  }
  return null;
}

/**
 * Schlaegt einen Strichcode nach.
 *
 * Gibt `null` zurueck bei: unbekanntem Code, Zeitueberschreitung,
 * Netzfehler, unerwarteter Antwort. Alle vier sind fuer den Aufrufer
 * dasselbe — "keine Auskunft" — und keiner davon ist ein Grund, den
 * Erfassungsablauf abzubrechen.
 *
 * Der Aufrufer muss vorher `classifyEan` befragen: Bei einem
 * Waagenetikett (Praefix 20-29) ist diese Anfrage sinnlos, weil solche
 * Codes nur im Laden gelten, der sie gedruckt hat.
 */
export async function lookupOpenFoodFacts(
  ean: string,
): Promise<OffProduct | null> {
  if (!/^\d{8,14}$/.test(ean)) return null;

  try {
    const antwort = await fetch(
      `${BASE}/${encodeURIComponent(ean)}.json?fields=${FIELDS}`,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
        // Produktstammdaten aendern sich nicht stuendlich. Der Browser
        // darf die Antwort behalten; der Next-eigene Zwischenspeicher
        // waere hier falsch, weil die Anfrage gar nicht vom Server kommt.
        cache: "force-cache",
      },
    );

    // 404 ist der Normalfall bei Schweizer Eigenmarken, kein Fehler.
    if (!antwort.ok) return null;

    const daten = (await antwort.json()) as OffResponse;
    if (daten.status !== 1 || !daten.product) return null;

    const name = besterName(daten.product);
    if (!name) return null;

    return {
      ean,
      name,
      brand: daten.product.brands?.split(",")[0]?.trim() || null,
      quantity: daten.product.quantity?.trim() || null,
      categoryTags: Array.isArray(daten.product.categories_tags)
        ? daten.product.categories_tags
        : [],
    };
  } catch {
    // Zeitueberschreitung, kein Netz, ungueltiges JSON — fuer den Aufrufer
    // alles dasselbe. Bewusst stillschweigend: Ein Fehlschlag ist hier der
    // Normalfall und kein Anlass fuer eine Fehlermeldung.
    return null;
  }
}
