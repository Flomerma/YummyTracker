import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import type { StorageLocation } from "@/lib/domain/types";
import { isPlausibleEstimate } from "@/lib/domain/shelf-life-estimate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Das letzte Glied der Haltbarkeits-Kette aus Konzept 4.3.
 *
 * Greift erst, wenn weder ein gelernter Wert noch ein Katalogeintrag noch
 * eine Kategorieregel etwas liefert. Das Ergebnis wird von der aufrufenden
 * Dienstschicht in den Katalog zurueckgeschrieben — jedes unbekannte
 * Produkt kostet damit genau einmal eine Abfrage, danach ist der Wert fuer
 * alle da.
 *
 * ----------------------------------------------------------------------
 * OHNE SCHLUESSEL LAEUFT DIE APP TROTZDEM
 * ----------------------------------------------------------------------
 * Fehlt ANTHROPIC_API_KEY, liefert `suggestShelfLife` null statt zu werfen.
 * Der Erfassungsablauf funktioniert dann weiter, nur ohne Vorschlag fuer
 * Unbekanntes — man traegt das Datum von Hand ein. Eine fehlende
 * Einstellung darf keinen Ablauf blockieren, der auch ohne sie sinnvoll ist.
 */

/** Wie viele Schaetzungen pro Tag hoechstens. Siehe `withinDailyBudget`. */
export const DAILY_ESTIMATE_LIMIT = 50;

export interface ShelfLifeEstimate {
  readonly daysUnopened: number;
  readonly daysOpened: number | null;
  readonly confidence: number;
}

export interface EstimateInput {
  readonly productName: string;
  readonly categoryName: string | null;
  readonly storage: StorageLocation;
}

const STORAGE_TEXT: Record<StorageLocation, string> = {
  fridge: "im Kühlschrank",
  freezer: "im Tiefkühler",
  pantry: "im Vorratsschrank bei Raumtemperatur",
};

/**
 * Die Kostenbremse aus Konzept 7.5.
 *
 * ABWEICHUNG VOM KONZEPT, BEWUSST: Dort steht "pro Haushalt und Tag". Hier
 * ist die Grenze global. Der Grund ist, dass die Schaetzungen als GLOBALE
 * Katalogregeln landen (household_id ist null) und sich deshalb gar nicht
 * einem Haushalt zuordnen lassen. Eine haushaltsgenaue Zaehlung braeuchte
 * eine eigene Tabelle.
 *
 * Fuer den eigentlichen Zweck genuegt die globale Grenze: Sie soll
 * verhindern, dass ein Fehler in einer Schleife unbemerkt eine hohe
 * Rechnung erzeugt. Dafuer ist egal, aus welchem Haushalt die Aufrufe
 * kommen. Mit mehreren aktiven Haushalten gehoert das nachgeschaerft —
 * notiert in docs/journal.
 *
 * Der Zaehler braucht keine eigene Tabelle: Weil jede Schaetzung als Regel
 * mit source='ai' im Katalog landet, SIND die heutigen KI-Regeln die
 * Nutzung. Im Zweifel — wenn die Abfrage scheitert — wird abgelehnt statt
 * durchgelassen.
 */
export async function withinDailyBudget(): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("shelf_life_rules")
    .select("id", { count: "exact", head: true })
    .eq("source", "ai")
    .gte("created_at", since.toISOString());

  if (error) return false;
  return (count ?? 0) < DAILY_ESTIMATE_LIMIT;
}

const TOOL_NAME = "haltbarkeit_melden";

/**
 * Schaetzt die Haltbarkeit eines unbekannten Produkts.
 *
 * Strukturierte Ausgabe ueber ein Werkzeug statt Textauswertung: Damit ist
 * die Antwortform erzwungen und nicht Gegenstand von Hoffnung.
 *
 * Modellwahl: Das guenstige Modell genuegt. Die Aufgabe ist eine kurze
 * Sachfrage mit erzwungener Ausgabeform, kein Schlussfolgern ueber langen
 * Text. Die Bildauswertung fuer den Bon in Stufe 6 braucht das staerkere —
 * das ist dann eine andere Entscheidung.
 */
export async function suggestShelfLife(
  input: EstimateInput,
): Promise<ShelfLifeEstimate | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  if (!(await withinDailyBudget())) return null;

  const client = new Anthropic({ apiKey });

  const kategorie = input.categoryName
    ? ` Es gehört zur Kategorie „${input.categoryName}".`
    : "";

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Meldet die geschätzte Haltbarkeit eines Lebensmittels in Tagen.",
          input_schema: {
            type: "object",
            properties: {
              daysUnopened: {
                type: "integer",
                description:
                  "Haltbarkeit ungeöffnet, in Tagen ab Einkauf, am genannten Lagerort.",
              },
              daysOpened: {
                type: ["integer", "null"],
                description:
                  "Haltbarkeit nach dem Öffnen, in Tagen. null wenn nicht sinnvoll, etwa bei einem Apfel.",
              },
              confidence: {
                type: "number",
                description: "Wie sicher die Schätzung ist, zwischen 0 und 1.",
              },
            },
            required: ["daysUnopened", "daysOpened", "confidence"],
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content:
            `Wie lange ist „${input.productName}" haltbar, gelagert ` +
            `${STORAGE_TEXT[input.storage]}?${kategorie}\n\n` +
            "Es geht um einen Schweizer Privathaushalt und um handelsübliche " +
            "Ware. Schätze KONSERVATIV: Diese Zahl erzeugt später eine Warnung. " +
            "Eine zu frühe Warnung ist harmlos, eine zu späte bedeutet " +
            "verdorbenes Essen. Im Zweifel den kürzeren Wert nehmen.",
        },
      ],
    });

    const block = response.content.find(
      (part) => part.type === "tool_use" && part.name === TOOL_NAME,
    );
    if (!block || block.type !== "tool_use") return null;

    const raw = block.input as Record<string, unknown>;
    const estimate: ShelfLifeEstimate = {
      daysUnopened: Number(raw.daysUnopened),
      daysOpened: raw.daysOpened === null ? null : Number(raw.daysOpened),
      confidence: Number(raw.confidence),
    };

    // Auch eine erzwungene Ausgabeform garantiert keine sinnvollen Zahlen.
    // Die Pruefung ist rein und liegt deshalb in lib/domain.
    return isPlausibleEstimate(estimate) ? estimate : null;
  } catch {
    // Netzfehler, Kontingent erschoepft, Modell nicht erreichbar: Der
    // Erfassungsablauf darf daran nicht scheitern. Ohne Schaetzung traegt
    // man das Datum eben von Hand ein.
    return null;
  }
}
