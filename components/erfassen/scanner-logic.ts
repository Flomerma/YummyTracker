/**
 * Die reine Logik des Scanners, ohne Kamera und ohne React.
 *
 * Getrennt von der Komponente, weil sich Kamera und Erkennung im Test nicht
 * nachstellen lassen, die Entscheidungen dazwischen aber schon — und genau
 * dort sitzen die Fehler, die man spaeter am Kuehlschrank bemerkt.
 */

/** Die Formate, die auf Lebensmittelverpackungen vorkommen. */
export const FOOD_BARCODE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
] as const;

/**
 * Nach so vielen Millisekunden ohne Treffer weist der Scanner auf den
 * Foto-Weg hin.
 *
 * Der haeufigste Fehlschlag auf dem iPhone ist der Fokus: WebKit gibt dem
 * Video-Stream keine Fokussteuerung (focusMode fehlt im IDL), und kleine
 * Codes auf einer Joghurtecke werden dann nie scharf. Die native Kamera-App
 * kann fokussieren und blitzen. Wer zehn Sekunden vergeblich hinhaelt, soll
 * das erfahren, statt aufzugeben.
 */
export const PHOTO_HINT_AFTER_MS = 10_000;

/**
 * Wie oft derselbe Code hintereinander erkannt sein muss, bevor er gilt.
 *
 * Im Live-Stream liest die Erkennung mehrmals pro Sekunde, auch aus
 * unscharfen oder halb verdeckten Bildern. Die Pruefziffer faengt die meisten
 * Verleser ab, aber nicht alle: Zwei vertauschte Ziffern koennen eine
 * gueltige Pruefziffer ergeben. Zweimal dasselbe Ergebnis kostet rund eine
 * Zehntelsekunde und schliesst das praktisch aus.
 *
 * Beim Standbild gilt das nicht — dort gibt es nur ein Bild, und ein
 * gueltiger Code wird sofort genommen.
 */
export const STABLE_READS_REQUIRED = 2;

/**
 * Sammelt Lesungen aus dem Live-Stream und meldet einen Code erst, wenn er
 * stabil ist.
 *
 * Gibt eine Funktion zurueck, die mit jeder Lesung aufgerufen wird. Sie
 * liefert den Code genau einmal, wenn er oft genug hintereinander kam, und
 * danach nichts mehr — der Scanner soll nicht denselben Joghurt dreimal
 * anlegen, weil die Hand noch im Bild ist.
 */
export function createStableReader(required = STABLE_READS_REQUIRED) {
  let last: string | null = null;
  let count = 0;
  let reported = false;

  return function push(code: string | null): string | null {
    if (reported) return null;

    if (!code) {
      // Ein leeres Bild unterbricht die Serie nicht: Zwischen zwei scharfen
      // Bildern liegt oft ein unscharfes, und die Hand zittert.
      return null;
    }

    if (code === last) {
      count += 1;
    } else {
      last = code;
      count = 1;
    }

    if (count >= required) {
      reported = true;
      return code;
    }
    return null;
  };
}

/* -------------------------------------------------------------------------
 * Fehler der Kamera, in Sätze übersetzt
 * ---------------------------------------------------------------------- */

export interface CameraProblem {
  readonly title: string;
  readonly hint: string;
  /**
   * Lohnt ein zweiter Versuch mit der Live-Kamera? Bei verweigerter Erlaubnis
   * nicht — der Browser fragt nicht noch einmal, und ein Knopf "nochmal" der
   * nichts tut, ist schlimmer als keiner.
   */
  readonly retryLive: boolean;
}

/**
 * Uebersetzt einen Fehler von getUserMedia.
 *
 * Jede Meldung endet mit einem Weg nach vorn. Der Foto-Weg und das Eintippen
 * funktionieren auch dann, wenn die Live-Kamera nicht will — die Oberflaeche
 * zeigt sie in jedem Fall an.
 */
export function cameraProblem(error: unknown): CameraProblem {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "Kein Zugriff auf die Kamera",
        hint:
          "Der Kamerazugriff wurde verweigert. Du kannst stattdessen ein Foto " +
          "machen — dafür braucht es keine Erlaubnis. Oder den Zugriff in den " +
          "Einstellungen des Browsers für diese Seite erlauben.",
        retryLive: false,
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        title: "Keine passende Kamera gefunden",
        hint: "Mach ein Foto vom Barcode oder tippe den Namen ein.",
        retryLive: false,
      };
    case "NotReadableError":
    case "AbortError":
      return {
        title: "Die Kamera ist gerade belegt",
        hint:
          "Eine andere App nutzt die Kamera. Schliesse sie und versuche es " +
          "nochmal — oder mach ein Foto.",
        retryLive: true,
      };
    default:
      return {
        title: "Die Kamera liess sich nicht starten",
        hint: "Mach ein Foto vom Barcode oder tippe den Namen ein.",
        retryLive: true,
      };
  }
}

/**
 * Die Meldung, wenn die Erkennung selbst nicht laedt.
 *
 * Eigener Fall, nicht in `cameraProblem`: Laedt die WASM-Datei nicht (Netz
 * weg, eine strenge Content Security Policy, eine veraltete Datei nach einem
 * Versionswechsel), ist die Kamera unschuldig. Wer dann "Die Kamera liess
 * sich nicht starten" liest, sucht den Fehler in den Kameraeinstellungen —
 * und beim Foto-Weg hiesse es faelschlich "kein Barcode erkannt", obwohl gar
 * nicht gesucht wurde.
 */
export const DETECTOR_UNAVAILABLE: CameraProblem = {
  title: "Die Barcode-Erkennung konnte nicht geladen werden",
  hint:
    "Meist ist die Verbindung kurz weg. Versuche es gleich nochmal — oder " +
    "tippe den Namen ein, das geht auch ohne Netz.",
  retryLive: true,
};

/**
 * Kann dieser Browser ueberhaupt eine Live-Kamera liefern?
 *
 * Ohne gesicherte Verbindung (HTTPS) gibt es `navigator.mediaDevices` gar
 * nicht. Auf Vercel ist das gegeben, im lokalen Netz ueber eine IP-Adresse
 * dagegen nicht — dann soll die Oberflaeche gleich den Foto-Weg anbieten,
 * statt einen Knopf zu zeigen, der nur einen Fehler erzeugt.
 */
export function liveCameraAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}
