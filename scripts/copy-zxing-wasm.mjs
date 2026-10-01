/**
 * Kopiert die Barcode-Erkennung (WebAssembly) nach public/, damit die App
 * sie selbst ausliefert.
 *
 *   node scripts/copy-zxing-wasm.mjs
 *
 * Laeuft automatisch vor `npm run dev` und `npm run build` (predev/prebuild),
 * also auch beim Bau auf Vercel.
 *
 * WARUM SELBST AUSLIEFERN
 * `barcode-detector` laedt die WASM-Datei zur Laufzeit standardmaessig von
 * jsDelivr. Dann haengt der Scanner einer produktiven App an einem fremden
 * CDN: faellt es aus, ist er tot, und eine strenge Content Security Policy
 * blockiert ihn ganz.
 *
 * WARUM BEI JEDEM BAU UND NICHT EINMAL VON HAND
 * Die WASM-Datei muss EXAKT zur installierten Version von zxing-wasm passen.
 * Der JavaScript-Teil und die Binaerdatei werden gemeinsam gebaut; eine
 * einmal kopierte Datei veraltet beim naechsten Update stillschweigend, und
 * der Fehler zeigt sich erst auf dem Handy, nicht beim Bauen.
 *
 * Ein Beispiel dafuer gab es schon bei der Installation: barcode-detector
 * 3.2.2 pinnt zxing-wasm auf 3.1.3, nicht auf das neuere 3.1.4. Wer die Datei
 * von Hand aus 3.1.4 geholt haette, haette eine unpassende ausgeliefert.
 *
 * Die Version steht deshalb im Pfad (public/wasm/zxing-<version>/). So kann
 * gar keine falsche Version geladen werden, und der Browser-Zwischenspeicher
 * wird bei einem Update von selbst ungueltig.
 */

import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/**
 * Findet den Ordner eines Pakets ueber seinen Haupteinstieg.
 *
 * `require.resolve("paket/package.json")` waere kuerzer, scheitert aber, wenn
 * das Paket ein `exports`-Feld hat, das package.json nicht freigibt — genau
 * das ist bei barcode-detector der Fall (ERR_PACKAGE_PATH_NOT_EXPORTED).
 * Der Haupteinstieg ist immer aufloesbar; von dort geht es nach oben bis zur
 * package.json mit dem passenden Namen.
 */
function packageDir(name, fromDir) {
  let dir = dirname(require.resolve(name, { paths: [fromDir] }));
  while (dir !== dirname(dir)) {
    const pkg = join(dir, "package.json");
    if (
      existsSync(pkg) &&
      JSON.parse(readFileSync(pkg, "utf8")).name === name
    ) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error(`Paketordner von ${name} nicht gefunden`);
}

// Ueber barcode-detector aufloesen, nicht direkt: Massgeblich ist die
// Version, die barcode-detector tatsaechlich benutzt.
const barcodeDetectorDir = packageDir("barcode-detector", root);
const zxingDir = packageDir("zxing-wasm", barcodeDetectorDir);
const version = JSON.parse(
  readFileSync(join(zxingDir, "package.json"), "utf8"),
).version;

const quelle = join(zxingDir, "dist", "reader", "zxing_reader.wasm");
if (!existsSync(quelle)) {
  console.error(`zxing_reader.wasm nicht gefunden unter ${quelle}`);
  process.exit(1);
}

const zielRoot = join(root, "public", "wasm");
const ziel = join(zielRoot, `zxing-${version}`, "zxing_reader.wasm");

// Alte Versionen wegraeumen, damit sich public/ nicht fuellt.
rmSync(zielRoot, { recursive: true, force: true });
mkdirSync(dirname(ziel), { recursive: true });
copyFileSync(quelle, ziel);

console.log(
  `zxing-wasm ${version} -> public/wasm/zxing-${version}/zxing_reader.wasm`,
);
