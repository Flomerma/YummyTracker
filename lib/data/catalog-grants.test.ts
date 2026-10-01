import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Haelt den Code gegen die Spaltenrechte in der Datenbank.
 *
 * WARUM ES DIESEN TEST GIBT
 * Ein Mitglied darf auf `products` nur bestimmte Spalten schreiben — die
 * Migration 20261001150000 gibt sie einzeln frei. Schreibt der Code eine
 * Spalte mehr, lehnt PostgreSQL die GANZE Anweisung ab ("permission denied
 * for table products"), egal ob die Zeilen-Sicherheitsregel passt.
 *
 * Genau das ist beim ersten echten Einsatz passiert: Der Code schrieb
 * `verified: false`, die Migration gab `verified` absichtlich nicht frei.
 * Der Datenbanktest fiel nicht auf, weil er selbst ohne `verified`
 * einfuegte — er pruefte die Regel, nicht das, was die Anwendung schickt.
 *
 * Der Test liest beide Seiten aus den Quelldateien: die freigegebenen
 * Spalten aus der Migration, die geschriebenen aus dem Einfuegen in
 * lib/data/catalog.ts. Wird eine Seite geaendert und die andere nicht,
 * schlaegt er an — vor dem Deployment statt am Kuehlschrank.
 */

const root = join(__dirname, "..", "..");

/** Die Spalten aus `grant insert (…) on public.products to authenticated`. */
function grantedInsertColumns(): Set<string> {
  const dir = join(root, "supabase", "migrations");
  const spalten = new Set<string>();
  for (const datei of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(dir, datei), "utf8");
    const re =
      /grant\s+insert\s*\(([^)]*)\)\s*on\s+public\.products\s+to\s+authenticated/gi;
    for (const m of sql.matchAll(re)) {
      for (const s of m[1]!.split(",")) {
        const name = s.replace(/--.*$/gm, "").trim();
        if (name) spalten.add(name);
      }
    }
  }
  return spalten;
}

/** Die Schluessel im `.insert({ … })` von createHouseholdProduct. */
function insertedColumns(): string[] {
  const code = readFileSync(join(root, "lib", "data", "catalog.ts"), "utf8");
  const start = code.indexOf("export async function createHouseholdProduct");
  expect(start, "createHouseholdProduct nicht gefunden").toBeGreaterThan(-1);
  const rest = code.slice(start);
  const m = rest.match(/\.insert\(\{([\s\S]*?)\}\)/);
  expect(
    m,
    "Einfuegen in createHouseholdProduct nicht gefunden",
  ).not.toBeNull();
  return [...m![1]!.matchAll(/^\s*([a-z_]+)\s*:/gm)].map((x) => x[1]!);
}

describe("createHouseholdProduct gegen die Spaltenrechte", () => {
  it("findet beide Seiten ueberhaupt", () => {
    // Sonst bestuende der eigentliche Test trivial.
    expect(grantedInsertColumns().size).toBeGreaterThan(0);
    expect(insertedColumns().length).toBeGreaterThan(0);
  });

  it("schreibt nur Spalten, die die Migration freigibt", () => {
    const frei = grantedInsertColumns();
    const ohneRecht = insertedColumns().filter((s) => !frei.has(s));
    expect(ohneRecht).toEqual([]);
  });

  it("setzt die Pruefmarkierung nicht selbst", () => {
    // `verified` ist bewusst nicht freigegeben: Eine Selbstbescheinigung
    // waere wertlos. Der Vorgabewert der Spalte ist false.
    expect(insertedColumns()).not.toContain("verified");
  });
});
