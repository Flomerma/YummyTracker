# yummytracker

Ein Lebensmitteltracker für Haushalte. Er soll drei Dinge verhindern: dass Essen
verdirbt, dass doppelt eingekauft wird, und dass Nötiges vergessen geht.

Der Kerngedanke: **Niemand pflegt einen Vorrat.** Der Bestand aktualisiert sich an
den zwei Stellen, an denen ohnehin Aufmerksamkeit da ist — beim Auspacken des
Einkaufs und kurz bevor etwas abläuft.

Das vollständige Konzept mit Datenmodell, Architektur und Stufenplan steht in
[`docs/superpowers/specs/2026-09-23-lebensmitteltracker-design.md`](docs/superpowers/specs/2026-09-23-lebensmitteltracker-design.md).

Semesterarbeit GIBZ, Semester 7, Modul IIL.

---

## Einrichten

### 1. Node

Die Anwendung braucht Node 24 (siehe `.nvmrc`).

```bash
node -v    # v24.x
```

### 2. Abhängigkeiten

```bash
npm install
```

### 3. Supabase-Projekt

Auf [supabase.com](https://supabase.com) ein Projekt anlegen (Gratis-Tarif genügt,
Region Frankfurt oder Zürich). Dann:

```bash
cp .env.example .env.local
```

und in `.env.local` eintragen, was unter _Project Settings → API_ steht. Der
öffentliche Schlüssel heisst je nach Alter des Projekts `publishable key`
(`sb_publishable_…`) oder `anon key` (ein JWT). Beide Namen werden akzeptiert.

Unter _Authentication → URL Configuration_ müssen die Rückleitungsadressen
eingetragen sein, sonst ignoriert Supabase sie stillschweigend und der Link in
der Mail zeigt auf die falsche Adresse:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

### 4. Schema einspielen

```bash
export SUPABASE_ACCESS_TOKEN="…"        # supabase.com/dashboard/account/tokens
npx supabase link --project-ref "<ref>"
npm run db:push -- --dry-run            # erst trocken
npm run db:push
```

> **Aus WSL heraus:** Der direkte Datenbank-Endpunkt `db.<ref>.supabase.co` ist
> nur über IPv6 erreichbar. In reinen IPv4-Netzen scheitert `db:push` mit
> `network is unreachable`. Dann die Session-Pooler-Adresse aus dem Dashboard
> verwenden:
> `npx supabase db push --db-url "postgresql://postgres.<ref>:<passwort>@aws-0-<region>.pooler.supabase.com:5432/postgres"`

### 5. Starten

```bash
npm run dev     # http://localhost:3000
```

---

## Reihenfolge beim Veröffentlichen

**Zuerst die Datenbank, dann der Code.** Immer in dieser Richtung.

```bash
npx supabase migration list          # was fehlt in der Cloud?
npm run db:push                      # erst die Datenbank
git push                             # dann der Code
```

Der Grund steht in `docs/journal/`: Zweimal ist Code live gegangen, der eine
noch nicht eingespielte Migration voraussetzte. Beide Male sah es nach einem
Programmfehler aus, und beide Male war es keiner.

Warum diese Richtung und nicht die andere: Eine Migration ohne den
zugehörigen Code ist harmlos — eine Tabelle, die niemand abfragt, ein Recht,
das niemand nutzt. Code ohne seine Migration bricht dagegen sofort, und zwar
mit einer Meldung, die in die Irre führt.

Falls es doch passiert: `permission denied for table …` bedeutet so gut wie
immer eine fehlende Migration, nicht ein Rechteproblem des Kontos. Die App
sagt das inzwischen auch so.

---

## Befehle

| Befehl                | Zweck                                                         |
| --------------------- | ------------------------------------------------------------- |
| `npm run dev`         | Entwicklungsserver                                            |
| `npm run verify`      | Formatierung, Linter, Typen, Tests und Build — alles am Stück |
| `npm test`            | Tests der Fachlogik und der Komponenten                       |
| `npm run test:db`     | Zugriffsschutz-Nachweis gegen lokales PostgreSQL              |
| `npm run db:new -- x` | Neue Migration anlegen                                        |
| `npm run db:push`     | Migrationen ins Cloudprojekt spielen                          |

`npm run db:diff` steht zwar zur Verfügung, braucht aber Docker und läuft in
dieser Umgebung nicht. Migrationen werden deshalb von Hand geschrieben.

---

## Datenbanktests ohne Docker

Der Zugriffsschutz ist das Erfolgskriterium, bei dem eine Zusicherung nichts
wert ist — er muss belegt werden. `npm run test:db` baut dafür eine
Wegwerf-Datenbank auf einem lokalen PostgreSQL auf, bildet mit einer schlanken
Attrappe so viel von Supabase nach wie nötig (die Rollen, `auth.uid()`, die
grosszügigen Vorgaberechte), spielt alle Migrationen ein und gibt sich dann
nacheinander als verschiedene Personen aus.

Einmalig einzurichten:

```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo service postgresql start
```

Das ersetzt die lokale Supabase-Umgebung nicht vollständig — Supabase Cloud
fährt PostgreSQL 15 oder 17 und hat echte Rollen. Für Syntax, Richtlinienlogik,
Trigger und Rechte ist der Nachweis aber tragfähig, und er läuft in Sekunden.

---

## Aufbau

```
app/            Seiten, Server-Komponenten, Server-Aktionen
components/     Oberfläche
lib/services/   Anwendungsfälle
lib/domain/     reine Regeln     ← keine Datenbank, kein React, voll testbar
lib/data/       Datenzugriff     ← die einzige Stelle mit Supabase-Aufrufen
lib/ai/         KI-Adapter       ← ausschliesslich serverseitig
supabase/       Migrationen, Startkatalog, Datenbanktests
```

Zwei Regeln tragen den grössten Teil der Codequalität, und beide werden vom
Linter durchgesetzt statt nur empfohlen:

- **`lib/domain/` kennt weder Datenbank noch Oberfläche.** Deshalb lässt sich
  die Fachlogik ohne laufende Infrastruktur testen.
- **`lib/data/` ist die einzige Stelle mit Supabase-Aufrufen.** Ein Import von
  `@supabase/*` anderswo bricht `npm run lint` ab.
