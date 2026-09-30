/**
 * Misst, wie gut der Startkatalog echte Kassenbonzeilen trifft.
 *
 *   node scripts/measure-catalog-match.mjs docs/messung/bons/migros.txt
 *
 * WARUM DIESES SKRIPT EXISTIERT
 * Vor dem Bau des Bon-Wegs steht die Frage, ob die Zuordnung ueberhaupt
 * trifft. Eine geschaetzte Antwort darauf ist wertlos: Die Namen auf einem
 * Schweizer Bon sind abgekuerzt, markenlastig und teilweise gar keine
 * Lebensmittelbezeichnungen ("LT Excel. Orange I."). Also messen.
 *
 * Das Skript laeuft gegen den Katalog in supabase/seed/catalog.json, nicht
 * gegen eine Datenbank — damit ist es ohne laufende Infrastruktur
 * ausfuehrbar und liefert bei jedem Lauf dasselbe Ergebnis.
 *
 * Es benutzt AUSSCHLIESSLICH die echten Funktionen aus lib/domain. Eine
 * Nachbildung wuerde messen, was das Skript tut, nicht was die Anwendung
 * tut.
 *
 * Die Bondateien selbst sind absichtlich nicht im Repository (siehe
 * .gitignore): ein Bon verraet den vollstaendigen Einkauf.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { normalizeName } from "../lib/domain/normalize-name.ts";
import { searchTerms } from "../lib/domain/search-terms.ts";
import { matchProduct } from "../lib/domain/match-product.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const datei = process.argv[2];
if (!datei) {
  console.error(
    "Aufruf: node scripts/measure-catalog-match.mjs <bondatei.txt>",
  );
  process.exit(1);
}

const katalog = JSON.parse(
  readFileSync(join(root, "supabase/seed/catalog.json"), "utf8"),
);

/** Die Kandidaten so, wie matchProduct sie erwartet. */
const kandidaten = katalog.products.map((p, i) => ({
  id: String(i),
  name: p.name,
  normalizedName: p.normalizedName,
}));

const zeilen = readFileSync(resolve(datei), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

/**
 * Bildet nach, was lib/data/catalog.ts in der Datenbank tut: ODER ueber die
 * Einzelbegriffe. Danach raengt matchProduct wie in der Anwendung.
 */
function suche(normalisiert) {
  const terms = searchTerms(normalisiert);
  if (terms.length === 0) return [];
  return kandidaten.filter((k) =>
    terms.some((t) => k.normalizedName.includes(t)),
  );
}

let ohneKandidat = 0;
let mitTreffer = 0;
const zeilenErgebnis = [];

for (const roh of zeilen) {
  const normalisiert = normalizeName(roh);
  const gefunden = suche(normalisiert);
  const treffer = matchProduct(roh, gefunden);
  const beste = treffer[0] ?? null;

  if (gefunden.length === 0) ohneKandidat += 1;
  if (beste) mitTreffer += 1;

  zeilenErgebnis.push({
    roh,
    normalisiert,
    kandidaten: gefunden.length,
    treffer: beste
      ? kandidaten.find((k) => k.id === beste.productId)?.name
      : null,
    confidence: beste ? beste.confidence : 0,
  });
}

const breite = Math.max(...zeilen.map((z) => z.length));

console.log(
  `\n${datei} — ${zeilen.length} Zeilen, Katalog mit ${kandidaten.length} Produkten\n`,
);
console.log(
  `${"Bonzeile".padEnd(breite)}  ${"normalisiert".padEnd(26)}  Kand  Zuordnung`,
);
console.log("-".repeat(breite + 60));

for (const r of zeilenErgebnis) {
  const marke = r.treffer ? (r.confidence >= 0.6 ? "  " : "~ ") : "! ";
  const zuordnung = r.treffer
    ? `${r.treffer} (${r.confidence.toFixed(2)})`
    : r.kandidaten === 0
      ? "— kein Kandidat"
      : "— kein Treffer über der Schwelle";
  console.log(
    `${marke}${r.roh.padEnd(breite)}  ${r.normalisiert.padEnd(26)}  ${String(r.kandidaten).padStart(4)}  ${zuordnung}`,
  );
}

const sicher = zeilenErgebnis.filter((r) => r.confidence >= 0.6).length;
const unsicher = mitTreffer - sicher;

console.log(`
Zusammenfassung
  Zeilen gesamt          ${zeilen.length}
  ohne jeden Kandidaten  ${ohneKandidat}
  irgendein Treffer      ${mitTreffer}
    davon sicher (>=.60) ${sicher}
    davon unsicher       ${unsicher}
  gar keine Zuordnung    ${zeilen.length - mitTreffer}

Legende: "  " sicher, "~ " unsicher (im Pruef-Schritt nicht vorangehakt),
         "! " kein Kandidat gefunden.
`);
