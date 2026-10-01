"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Notice } from "@/components/ui";

import {
  cameraProblem,
  createStableReader,
  DETECTOR_UNAVAILABLE,
  FOOD_BARCODE_FORMATS,
  liveCameraAvailable,
  PHOTO_HINT_AFTER_MS,
  type CameraProblem,
} from "./scanner-logic";

/**
 * Der Barcode-Scanner.
 *
 * ======================================================================
 * WARUM NICHT DIE EINGEBAUTE BarcodeDetector-SCHNITTSTELLE
 * ======================================================================
 * Sie ist auf dem iPhone in keiner Safari-Version nutzbar. Im WebKit-
 * Quelltext steht sie als `ShapeDetection: status: testable, defaultValue:
 * false` — hinter einem ausgeschalteten Schalter, zwei Stufen vor
 * "stabil". Chrome bietet sie auf dem Desktop nur unter macOS und ChromeOS
 * an, Firefox gar nicht.
 *
 * Deshalb kommt die Erkennung mit: `barcode-detector` als Ponyfill auf
 * zxing-wasm, rund 314 KB, auf allen Geraeten derselbe Codepfad. Geladen
 * wird sie erst, wenn jemand den Scanner oeffnet — nicht auf jeder Seite.
 *
 * ======================================================================
 * ZWEI GLEICHWERTIGE WEGE
 * ======================================================================
 * Live-Kamera und Foto. Das Foto ist kein Notnagel: WebKit gibt dem
 * Video-Stream keine Fokussteuerung, kleine Codes auf einer Joghurtecke
 * werden dort oft nie scharf. Die native Kamera-App, die das Foto macht,
 * kann fokussieren, blitzen und mit voller Aufloesung aufnehmen. Beide Wege
 * laufen ueber dieselbe Erkennung.
 *
 * Und unter beiden steht immer der dritte: den Namen eintippen. Ein
 * Scanner, aus dem man nicht herauskommt, ist schlimmer als keiner.
 */

type Detector = {
  detect(image: HTMLVideoElement | Blob): Promise<{ rawValue: string }[]>;
};

/** Die Erkennung nur einmal pro Seitenbesuch laden und vorbereiten. */
let detectorPromise: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = import("barcode-detector/ponyfill")
      .then(({ BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION }) => {
        // Selbst ausgeliefert statt von jsDelivr: Der Pfad wird bei jedem Bau
        // aus node_modules befuellt (scripts/copy-zxing-wasm.mjs) und traegt
        // die Version, damit nie eine unpassende Datei geladen wird.
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm")
                ? `/wasm/zxing-${ZXING_WASM_VERSION}/${path}`
                : prefix + path,
          },
        });
        return new BarcodeDetector({
          formats: [...FOOD_BARCODE_FORMATS],
        }) as unknown as Detector;
      })
      .catch((error: unknown) => {
        // Beim naechsten Versuch neu laden, statt den Fehlschlag fuer immer
        // zwischenzuspeichern — etwa wenn nur das Netz kurz weg war.
        detectorPromise = null;
        throw error;
      });
  }
  return detectorPromise;
}

type Mode = "idle" | "starting" | "live" | "reading-photo";

export function BarcodeScanner({
  onDetected,
  onCancel,
}: {
  /** Ein gueltig gelesener Code. Ab hier entscheidet der Aufrufer. */
  onDetected: (ean: string) => void;
  /** Zurueck zur Schnelleingabe, ohne Code. */
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [problem, setProblem] = useState<CameraProblem | null>(null);
  const [photoHint, setPhotoHint] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [torch, setTorch] = useState<{ on: boolean } | null>(null);

  const [canLive, setCanLive] = useState(false);
  useEffect(() => setCanLive(liveCameraAvailable()), []);

  /**
   * Kamera freigeben. Wichtig auf dem iPhone: Bleibt der Stream offen,
   * leuchtet die Kameraanzeige weiter, und Safari gibt die Kamera fuer
   * andere Apps nicht frei.
   */
  const stop = useCallback(() => {
    if (loopRef.current !== null) {
      window.clearTimeout(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorch(null);
  }, []);

  useEffect(() => stop, [stop]);

  const found = useCallback(
    (ean: string) => {
      stop();
      setMode("idle");
      // Kurzes Vibrieren als Rueckmeldung. Gibt es auf iOS nicht — dann
      // passiert eben nichts, ein Fehler entsteht daraus nicht.
      navigator.vibrate?.(60);
      onDetected(ean);
    },
    [onDetected, stop],
  );

  async function startLive() {
    setProblem(null);
    setPhotoHint(false);
    setMode("starting");

    // Erkennung und Kamera gleichzeitig vorbereiten: Beides dauert, und
    // hintereinander waeren es beim ersten Scan einige Sekunden mehr. Die
    // Erkennung bekommt aber einen eigenen Fehlerfall — schlaegt sie fehl,
    // ist die Kamera unschuldig, und die Meldung muss das sagen.
    const detectorReady = loadDetector().then(
      (d) => ({ ok: true as const, detector: d }),
      () => ({ ok: false as const }),
    );

    try {
      const [loaded, stream] = await Promise.all([
        detectorReady,
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // `ideal` statt `exact`: `exact` wirft auf Geraeten ohne
            // Rueckkamera, etwa an einem Laptop.
            facingMode: { ideal: "environment" },
            // Hohe Aufloesung ersetzt die fehlende Fokussteuerung teilweise:
            // Aus 15 bis 20 cm hat der Code dann genug Bildpunkte, auch wenn
            // die Kamera nicht ganz scharf stellt.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        }),
      ]);

      if (!loaded.ok) {
        stream.getTracks().forEach((t) => t.stop());
        setMode("idle");
        setProblem(DETECTOR_UNAVAILABLE);
        return;
      }
      const detector = loaded.detector;

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setMode("live");

      // Lichtknopf nur anbieten, wenn die Kamera ihn wirklich kann. Die
      // WebKit-Schnittstelle kennt `torch`, aber nicht jede Kamera meldet ihn.
      const [track] = stream.getVideoTracks();
      const caps = track?.getCapabilities?.() as
        (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      if (caps?.torch) setTorch({ on: false });

      const push = createStableReader();
      const startedAt = Date.now();
      let busy = false;

      const tick = async () => {
        if (!streamRef.current) return;

        if (!busy && video.readyState >= 2) {
          busy = true;
          try {
            const codes = await detector.detect(video);
            const stable = push(codes[0]?.rawValue ?? null);
            if (stable) {
              found(stable);
              return;
            }
          } catch {
            // Ein einzelnes Bild, das sich nicht auswerten liess, ist kein
            // Grund aufzugeben — das naechste kommt in 150 ms.
          } finally {
            busy = false;
          }
        }

        if (Date.now() - startedAt > PHOTO_HINT_AFTER_MS) setPhotoHint(true);
        loopRef.current = window.setTimeout(tick, 150);
      };

      void tick();
    } catch (error) {
      stop();
      setMode("idle");
      setProblem(cameraProblem(error));
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torch) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorch({ on: next });
    } catch {
      // Manche Kameras melden das Licht und koennen es dann doch nicht.
      // Den Knopf dann verstecken statt einen Fehler zu zeigen.
      setTorch(null);
    }
  }

  async function readPhoto(file: File | undefined) {
    if (!file) return;
    stop();
    setProblem(null);
    setPhotoFailed(false);
    setMode("reading-photo");

    let detector: Detector;
    try {
      detector = await loadDetector();
    } catch {
      // Nicht "kein Barcode erkannt" melden — es wurde gar nicht gesucht.
      setMode("idle");
      setProblem(DETECTOR_UNAVAILABLE);
      if (photoRef.current) photoRef.current.value = "";
      return;
    }

    try {
      const codes = await detector.detect(file);
      const code = codes[0]?.rawValue;
      if (code) {
        found(code);
      } else {
        setMode("idle");
        setPhotoFailed(true);
      }
    } catch {
      setMode("idle");
      setPhotoFailed(true);
    } finally {
      // Dasselbe Foto erneut waehlen koennen, falls es nur ein Ausrutscher war.
      if (photoRef.current) photoRef.current.value = "";
    }
  }

  const live = mode === "live" || mode === "starting";

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          "relative overflow-hidden rounded-xl bg-neutral-900 " +
          (live ? "aspect-[4/3]" : "hidden")
        }
      >
        {/*
          playsInline ist auf dem iPhone Pflicht: Ohne springt das Video in
          die Vollbildansicht, und der Scanner ist nicht mehr zu bedienen.
          muted ist Voraussetzung dafuer, dass Safari ohne Nutzergeste
          abspielt.
        */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80"
        />
        {mode === "starting" && (
          <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">
            Kamera wird gestartet …
          </p>
        )}
      </div>

      {problem && (
        <Notice tone="error">
          <strong className="font-medium">{problem.title}.</strong>{" "}
          {problem.hint}
        </Notice>
      )}

      {photoHint && mode === "live" && (
        <Notice>
          Klappt nicht? Ein <strong className="font-medium">Foto</strong>{" "}
          fokussiert besser — die Kamera-App kann scharf stellen und blitzen.
        </Notice>
      )}

      {photoFailed && (
        <Notice tone="error">
          Auf dem Foto war kein Barcode zu erkennen. Nochmal näher heran und
          gerade von vorn — oder den Namen eintippen.
        </Notice>
      )}

      {mode === "reading-photo" && (
        <p role="status" className="text-sm text-neutral-600">
          Foto wird ausgewertet …
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {canLive && !live && (
          <Button
            type="button"
            onClick={startLive}
            disabled={problem !== null && !problem.retryLive}
          >
            Live scannen
          </Button>
        )}
        {live && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              stop();
              setMode("idle");
            }}
          >
            Kamera aus
          </Button>
        )}

        {/*
          Das Foto ueber ein Datei-Eingabefeld. capture="environment" oeffnet
          auf dem Handy direkt die Rueckkamera. Es braucht keine
          Kameraerlaubnis — deshalb funktioniert dieser Weg auch dann, wenn
          die Live-Kamera verweigert wurde.
        */}
        <label
          className={
            "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 hover:bg-neutral-50 " +
            (canLive ? "" : "col-span-2")
          }
        >
          Foto machen
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => void readPhoto(e.target.files?.[0])}
          />
        </label>

        {torch && (
          <Button
            type="button"
            variant="ghost"
            onClick={toggleTorch}
            className="col-span-2"
          >
            {torch.on ? "Licht aus" : "Licht an"}
          </Button>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          stop();
          onCancel();
        }}
      >
        Stattdessen Namen eintippen
      </Button>
    </div>
  );
}
