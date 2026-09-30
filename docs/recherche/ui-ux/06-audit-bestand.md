# Audit der bestehenden Oberflaeche
Stand: 30.09.2026 · Grundlage fuer das UI/UX-Konzept

Geprueft wurde der gesamte Code unter `app/`, `components/`, `lib/services/` und
`lib/domain/types.ts` gegen `docs/superpowers/specs/2026-09-23-lebensmitteltracker-design.md`
und `docs/journal/2026-09-stufe-0-1.md`. Stand des Codes: Stufe 0 vollstaendig,
Stufe 1 im Bau (Vorrat, Erfassen, Haushalt existieren; Einkaufsliste, Nachfragen,
Auswertung noch nicht). Jede Aussage unten ist mit einem Dateiverweis belegt.

---

## Die drei wichtigsten Befunde

**1. Kein Rueckweg nach "Gegessen" oder "Weggeworfen".** Ein Fehltipp auf den
falschen der beiden nebeneinanderliegenden Knoepfe in
`components/vorrat/artikel-zeile.tsx:106-124` veraendert den Bestand dauerhaft,
ohne Bestaetigungsdialog. Es gibt weder Oberflaeche noch Dienstfunktion, um
einen Artikel von `consumed`/`discarded` zurueck nach `active` zu holen. Das
trifft die empfindlichste Stelle der Arbeit: Die Weggeworfen-Auswertung ist
laut Konzept (Abschnitt 1) der Wirkungsnachweis der Semesterarbeit. Verfaelschte
Rohdaten greifen hier die Grundlage der spaeteren Auswertung an.

**2. Das 10-Sekunden-Ziel haelt nur, wenn man den Bestaetigungsschritt nicht
mitzaehlt — das Konzept zaehlt ihn aber mit.** Der Weg von "Eingabe tippen" bis
"Artikel steht im Bestand" durchlaeuft mindestens neun sequenzielle
Datenbankzugriffe in zwei getrennten Server-Aktionen, darunter zwei
nachweislich redundante Mitgliedschaftspruefungen in derselben Anfrage
(`lib/services/intake.ts:150` und `:242`). Details im naechsten Abschnitt.

**3. Verschluckte Fehler genau auf dem wichtigsten Pfad.** Die Aktion, die aus
einem Entwurf Bestand macht — `entwurfUebernehmenAction` in
`app/(app)/erfassen/actions.ts:104-117` — prueft zwar `result.ok`, tut bei
einem Fehlschlag aber schlicht nichts: kein Redirect, keine Meldung. Der
Nutzer tippt auf "Uebernehmen", die App antwortet mit Stille. Dieselbe
Fehlerfamilie steckt in `components/vorrat/artikel-zeile.tsx:61` (Zustand
syntaktisch verworfen) und `app/(app)/haushalt/actions.ts:62-70` (Ergebnis
komplett ignoriert).

---

## Das 10-Sekunden-Kriterium heute

Das Konzept nennt dies das haerteste Kriterium der Arbeit (Risiko-Tabelle,
Abschnitt 12: *"Erfolgskriterium ist keine Funktionsliste, sondern eine
Zahl"*). Deshalb lohnt es sich, den Weg wirklich durchzuzaehlen.

Ausgangslage: bekanntes Produkt, Haltbarkeitsregel bereits vorhanden
(Normalfall nach einigen Wochen Nutzung), warme Server-Funktion, keine
KI-Abfrage noetig.

| # | Schritt | Datei/Zeile | Wartepunkt |
|---|---|---|---|
| 1 | Zur Erfassen-Seite navigieren | `app/(app)/erfassen/page.tsx:45-49` | `currentContext()` + `loadOpenDraft()`: 4-6 sequenzielle DB-Zugriffe |
| 2 | Feld antippen (falls Tastatur nicht schon offen) | `components/erfassen/schnelleingabe.tsx:52` | siehe Kasten unten |
| 3 | Produktname eintippen | — | reine Tippzeit |
| 4 | Enter / "Hinzu" | `app/(app)/erfassen/actions.ts:36-71` | sechs sequenzielle DB-Zugriffe, siehe unten |
| 5 | Feld leert sich, Bestaetigung erscheint | `components/erfassen/schnelleingabe.tsx:38-44` | — |
| 6 | "Artikel uebernehmen" antippen | `app/(app)/erfassen/page.tsx:143-149` | — |
| 7 | Uebernehmen + Wechsel zum Vorrat | `app/(app)/erfassen/actions.ts:104-117` | 3 Zugriffe + volle Navigation, die selbst 4-5 weitere ausloest |

**Schritt 4 im Detail** (`lib/services/intake.ts`, Funktion `captureLine`,
Zeilen 265-272, zusammengesetzt aus `prepareLine` und `addPreparedLine`):

1. `requireMembership` in `prepareLine` (Zeile 150) — SELECT auf `household_members`
2. `searchProducts` (Zeile 158) — SELECT auf `products`
3. `loadShelfLifeRules` (Zeile 182) — SELECT auf `shelf_life_rules`
4. `requireMembership` **erneut** in `addPreparedLine` (Zeile 242) — dieselbe Abfrage wie #1
5. `getBatch` (`lib/data/intake.ts:205-218`)
6. `addLine`, INSERT mit RETURNING (`lib/data/intake.ts:259-283`)

Sechs sequenzielle Datenbankrunden fuer **einen** Tastendruck, wovon zwei
(#1 und #4) dieselbe Frage zweimal stellen. Der Kommentar in
`app/(app)/erfassen/actions.ts:28-35` behauptet: *"EIN Rundgang zum Server
erledigt alles"* — richtig aus Sicht des Browsers (eine HTTP-Anfrage), nicht
aus Sicht der Datenbank. Bei angenommenen 60-150 ms je Supabase-Zugriff sind
das grob 400-900 ms Datenbank-Wartezeit allein, ohne Vercel-Overhead und ohne
Mobilfunkstrecke. Bei Regions-Mismatch oder kaltem Funktionsstart — beim
Gratis-Tarif nicht unwahrscheinlich, vgl. Konzept-Risiko "Datenbank pausiert"
— sind 1,5-3 Sekunden realistisch.

**Kasten: die Tastatur, die vielleicht nicht aufgeht.** Der Kommentar in
`components/erfassen/schnelleingabe.tsx:18-19` sagt: *"Das Feld hat beim Laden
den Fokus. Niemand soll erst hineintippen muessen, um tippen zu koennen."*
Das ist nur die halbe Wahrheit: `autoFocus` (Zeile 52) setzt den DOM-Fokus
zuverlaessig, aber auf den meisten mobilen Browsern oeffnet ein Fokus, der
nicht unmittelbar aus einer Nutzergeste stammt, die Bildschirmtastatur
*nicht* automatisch. Fuer die technisch schwaechste Person im Haushalt
bedeutet das im ungluecklichsten Fall: Der Cursor blinkt, aber nichts
passiert beim Tippen, und niemand erklaert, dass man das Feld antippen muss —
ein bis zwei Sekunden Verwirrung genau an der Stelle, die am haertesten
gemessen wird. Dasselbe Muster liegt in `app/anmelden/anmelde-formular.tsx:47`.

### Zwei ehrliche Zahlen statt einer

**Marginalkosten waehrend eines laufenden Einkaufs** (Entwurf bereits offen,
Funktion warm, Produkt bekannt): tippen + Enter + eine Serverrunde ≈
**3 bis 6 Sekunden**. Genau darauf optimiert der Kommentar in
`components/erfassen/schnelleingabe.tsx:20-23` (*"Sechs Sachen auszupacken
heisst sechsmal tippen und Enter"*) — und dafuer ist die Zahl plausibel.

**Ein einzelner Artikel, "im Bestand" im Sinn des Konzepts** (4.1: *"Erst das
Bestaetigen macht daraus Bestand"*): Navigation (≈1 s) + Tastatur/Fokus
(0-1,5 s) + Tippen (1,5-3 s) + Serverrunde erfassen (1-2,5 s) + "Uebernehmen"
suchen und antippen (0,5-1 s) + Serverrunde bestaetigen und Wechsel zum
Vorrat (1-2,5 s) ergibt **rund 7 bis 12 Sekunden im guenstigen Fall** und
**15 bis 25 Sekunden**, wenn das Produkt unbekannt ist (die KI-Schaetzung in
`lib/ai/shelf-life.ts:96-177` laeuft synchron *innerhalb* der Anfrage) oder
die Funktion kalt startet. Unbekanntes Produkt ist zudem am haeufigsten, wenn
ein Haushalt die App gerade neu benutzt — also genau dann, wenn der erste
Eindruck entsteht.

**Fazit:** Fuer "sechs Sachen auspacken" (Konzept 3.1) ist das Ziel plausibel
erreichbar. Fuer den ebenso alltaeglichen Fall "ein einzelnes Ding erfassen"
haelt die heutige Umsetzung ihr eigenes Kriterium wahrscheinlich nicht ein,
und der Bestaetigungsschritt ist dabei der teuerste einzelne Teil des Weges,
nicht ein Nebenschauplatz.

---

## Was existiert

| Bildschirm/Fluss | Route | Zustand | Dateien |
|---|---|---|---|
| Anmelden (Konto) | `/anmelden` | Vollstaendig fuer E-Mail+Passwort. Zauber-Link-Code liegt vor, ist aber von keiner Oberflaeche mehr erreichbar | `app/anmelden/*`, `lib/data/auth.ts` |
| Auth-Infrastruktur | `/auth/callback`, `/auth/confirm`, `/auth/abmelden`, `/auth/fehler` | Vollstaendig, inkl. verstaendlicher Fehlerseite | `app/auth/*` |
| Einstieg (anlegen/beitreten) | `/einstieg`, `/beitreten` | Vollstaendig fuer Stufe 0 | `app/einstieg/*`, `app/beitreten/page.tsx` |
| **Vorrat** (Start) | `/vorrat` | Vollstaendig fuer Stufe 1: Dringlichkeitssortierung, Lagerort-Filter, drei Schnellaktionen. Leer- und Fehlerzustand vorhanden | `app/(app)/vorrat/*`, `components/vorrat/artikel-zeile.tsx`, `components/urgency-badge.tsx`, `lib/services/inventory.ts` |
| **Erfassen** | `/erfassen` | Angefangen: nur der Tipp-Weg existiert (Scan/Bon = spaetere Stufen, erwartungsgemaess). Bestaetigung deckt nur das Datum ab, nicht die Produktzuordnung. Wichtigster Fehlerfall (Uebernehmen) wird verschluckt | `app/(app)/erfassen/*`, `components/erfassen/schnelleingabe.tsx`, `lib/services/intake.ts`, `lib/data/intake.ts` |
| Einkaufsliste | — | **Fehlt vollstaendig** (Stufe 3 laut Plan). `detectDuplicate` existiert isoliert, getestet, unbenutzt | `lib/domain/detect-duplicate.ts` |
| Nachfragen | — | **Fehlt vollstaendig** (Stufe 2 laut Plan). `buildDigest` existiert isoliert, getestet, unbenutzt; `digest_log`/`action_tokens` fehlen in den Migrationen | `lib/domain/build-digest.ts` |
| Auswertung | — | Datenschicht angefangen (`loadWasteSummary`), Oberflaeche fehlt vollstaendig (Stufe 4) | `lib/services/inventory.ts:236-279` |
| **Haushalt** | `/haushalt` | Vollstaendig fuer Stufe 0/1: Mitglieder, Einladung, Anzeigename, Abmelden. Fehler beim Entfernen wird verschluckt | `app/(app)/haushalt/*`, `components/haushalt/*` |

**Uebersehene Zustaende, projektweit geprueft:** Kein `loading.tsx`,
`error.tsx` oder `not-found.tsx` existiert irgendwo unter `app/`. Bei
langsamer Verbindung zeigt eine Navigation deshalb keine eigene Rueckmeldung
— die alte Seite bleibt stehen, bis die neue fertig ist; ein Absturz in einer
Server-Komponente liefert die unstilisierte Next.js-Standardseite. "Keine
Berechtigung" ist dagegen konsistent geloest: Layout-Weiterleitung
(`app/(app)/layout.tsx:15-22`) plus Dienstschicht-Pruefung
(`lib/services/household.ts:90-103`) plus verstaendliche Fehlermeldung.
"Offline" ist nirgends behandelt — laut Konzept (7.7) ohnehin nur fuer die
noch nicht gebaute Einkaufsliste vorgesehen, insofern kein Rueckstand.

---

## Luecke und Widerspruch zum Konzept

Von sechs vorgesehenen Bildschirmen plus Einstieg stehen drei ganz oder
teilweise (Vorrat, Erfassen, Haushalt), drei fehlen komplett (Einkaufsliste,
Nachfragen, Auswertung). Das deckt sich mit dem Ausbauplan (Abschnitt 10) und
ist keine Abweichung, sondern der planmaessige Zwischenstand. Interessanter
sind vier Stellen, an denen das Gebaute nicht nur fehlt, sondern etwas anderes
tut als das Konzept sagt:

**1. Das 10-Sekunden-Kriterium wird stillschweigend neu definiert.** Das
Konzept macht die Bestaetigung zur Pflicht (4.1: *"Erst das Bestaetigen macht
daraus Bestand"*) und nennt keine Ausnahme fuer die Zeitmessung. Die
Code-Kommentare in `schnelleingabe.tsx:20-23` rechnen den
Bestaetigungsschritt faktisch heraus, indem sie nur "tippen und Enter"
zaehlen. Das ist keine begruendete Entscheidung, sondern eine Verengung durch
Formulierung. Sie sollte entweder explizit getroffen (dann gehoert sie ins
Konzept) oder der Bestaetigungsschritt selbst beschleunigt werden.

**2. Die Haltbarkeits-Kette legt ihre teuerste Operation auf den kritischen
Pfad statt daneben.** Konzept 4.3 begruendet die KI-Schaetzung mit
Kostenamortisierung, sagt aber nichts zur Latenz. In
`lib/services/intake.ts:196-215` laeuft `suggestShelfLife` synchron
*innerhalb* der Anfrage, bevor die Zeile ueberhaupt gespeichert wird.
Denkbar waere ebenso, die Zeile sofort ohne Datum zu speichern (der Zustand
"kein Haltbarkeitswert bekannt" existiert im UI bereits,
`app/(app)/erfassen/page.tsx:132-137`) und die Schaetzung im Hintergrund
nachzutragen. So trifft die teuerste Stufe der Kette genau den Fall, der zu
Beginn einer Haushaltsnutzung am haeufigsten ist: unbekannte Produkte.

**3. Die E-Mail-Zustellung (4.4) haengt an einer Infrastruktur, die laut
eigenem Journal bereits fuer einen kleineren Zweck versagt hat.** Der
Nachtrag vom 30.09. (`docs/journal/2026-09-stufe-0-1.md:182-235`) beschreibt,
wie Supabases eigener Mailversand schon fuer die Anmeldung allein
(`over_email_send_rate_limit`) nicht reichte und durch Passwort-Anmeldung
ersetzt wurde. Stufe 2 braucht denselben Versandweg taeglich, an mehrere
Mitglieder, mit Aktionslinks. Das Journal erkennt die Abhaengigkeit bereits,
aber die Risikotabelle des Konzepts (Abschnitt 12) fuehrt sie noch nicht.
Sollte vor Beginn von Stufe 2 nachgetragen werden.

**4. Die Produktzuordnung wird nie zur Bestaetigung vorgelegt, obwohl das
Konzept ihre Fehleranfaelligkeit als Risiko 2 fuehrt.** Die dort genannte
Gegenmassnahme ist Testabdeckung von `normalizeName` — das federt eine
*falsche* Zuordnung aber nicht ab, wenn sie trotzdem passiert.
`matchProduct` akzeptiert jeden Treffer ab 0.3 Konfidenz automatisch
(`lib/domain/match-product.ts:52`); die Schnelleingabe zeigt nach dem
Hinzufuegen nur den Namen des moeglicherweise falsch zugeordneten
Katalogprodukts (`app/(app)/erfassen/actions.ts:66-70`), nie die Konfidenz.
`IntakeLine.matchConfidence` wird berechnet und gespeichert
(`lib/data/intake.ts:79`), aber nirgends gelesen.

---

## Fehler

**1. Uebernehmen-Aktion verschluckt Fehler auf dem wichtigsten Pfad.**
Verweis: `app/(app)/erfassen/actions.ts:104-117` (`if (!result.ok) return;`
ohne Meldung oder Redirect). Wirkung: Schlaegt `confirmDraft` fehl, tippt der
Nutzer erneut und weiss nie, ob etwas passiert ist. Vorschlag: Auf
`useActionState` umstellen und den Fehlerfall mit `Notice tone="error"`
anzeigen, wie in den uebrigen Formularen der Seite.

**2. Fehlerzustand syntaktisch verworfen.** Verweis:
`components/vorrat/artikel-zeile.tsx:61-64`
(`const [, oeffnenAction, oeffnenPending] = useActionState(...)`). Wirkung:
Schlaegt "Geoeffnet" markieren fehl, existiert die Meldung im Code, erreicht
aber nie den Bildschirm. Vorschlag: Zustand wie bei `erledigt`/`korrigiert`
benennen und in die bestehende `fehler`-Verzweigung (Zeile 66-71) aufnehmen.

**3. Mitglied-entfernen-Aktion ignoriert ihr Ergebnis vollstaendig.**
Verweis: `app/(app)/haushalt/actions.ts:62-70`. Wirkung: Der in
`lib/services/household.ts:325-344` begruendete Schutz des letzten
Eigentuemers meldet im Fehlerfall `last_owner_protected` — das kommt nie an,
der Tap wirkt folgenlos. Vorschlag: Rueckgabewert pruefen, ueber
`useActionState` anzeigen.

**4. Weitere Void-Aktionen ohne Rueckmeldekanal und ohne Sperre.** Verweis:
`zeileEntfernenAction`, `zeileDatumAction` (`app/(app)/erfassen/actions.ts:73-96`),
`entwurfVerwerfenAction` (Zeilen 119-127) — alle `Promise<void>`, kein
`disabled` waehrend der Anfrage. Wirkung: Auf schwacher Verbindung lassen
sich diese Aktionen mehrfach ausloesen, ohne dass sichtbar wird, ob und wie
oft sie wirkten. Vorschlag: gemeinsame `pending`-Sperre ueber
`useFormStatus`.

**5. Kein Rueckweg von "Gegessen"/"Weggeworfen".** Siehe Befund 1. Verweis:
`components/vorrat/artikel-zeile.tsx:106-124`; `lib/data/inventory.ts` kennt
keine Funktion, die `status` zurueck auf `active` setzt; keine Oberflaeche
zeigt erledigte Artikel ueberhaupt an. Vorschlag: kurzes Zeitfenster mit
"Rueckgaengig" direkt nach dem Tippen; mittelfristig eine
"kuerzlich erledigt"-Ansicht mit Korrekturweg.

**6. Destruktive Aktionen ohne Bestaetigungsdialog.** Verweis: "Weggeworfen"
(`artikel-zeile.tsx:118-124`) und "Entfernen" eines Mitglieds
(`app/(app)/haushalt/page.tsx:76-83`) wirken beim ersten Tap. Wirkung: in
Kombination mit Befund 5 hoeheres Fehlerpotenzial als ueblich. Vorschlag:
gemeinsamer Bestaetigungs-Baustein, siehe Abschnitt "Bausteine".

**7. Berechnete Zuordnungssicherheit wird nirgends angezeigt.** Siehe Luecke
4. Verweis: `lib/domain/match-product.ts:52`, `lib/data/intake.ts:79`,
`app/(app)/erfassen/page.tsx:85-140`. Vorschlag: unterhalb einer
Konfidenzschwelle (z. B. 0.7) einen Hinweis "unsichere Zuordnung, pruefen" in
der Entwurfsliste einblenden.

**8. Doppelte Mitgliedschaftspruefung in derselben Anfrage.** Verweis:
`lib/services/intake.ts:150` und `:242`. Wirkung: vermeidbarer Zeitverlust
auf dem zeitkritischsten Pfad der App. Vorschlag: `captureLine` prueft die
Mitgliedschaft einmal und reicht das Ergebnis weiter.

**9. Entwicklerinterne Anweisung in einer Nutzermeldung.** Verweis:
`lib/domain/auth.ts:77-78` (*"Im Supabase-Dashboard ... die
Bestaetigungspflicht abschalten."*). Wirkung: Sollte die Einstellung je
versehentlich aktiv sein, liest eine registrierende Person eine Anweisung
fuer ein Dashboard, das sie nicht besitzt. Vorschlag: Nutzertext von der
Betriebsnotiz trennen.

**10. Kein Ladezustand bei Navigation.** Verweis: kein `loading.tsx` im
gesamten `app`-Baum. Wirkung: Bei jeder Navigation zwischen
Vorrat/Erfassen/Haushalt — alle mit mehreren sequenziellen DB-Zugriffen beim
Laden — bleibt die alte Seite ohne Rueckmeldung stehen. Vorschlag: je ein
einfaches `loading.tsx` pro Routen-Ordner unter `app/(app)/`.

---

## Schuld

Bewusst unfertig, mit nachvollziehbarem Grund:

- **Kein Dunkelmodus.** `app/globals.css:9-13` begruendet das ausdruecklich:
  *"Ein halber Dunkelmodus ist schlechter als keiner."* Dem ist nichts
  hinzuzufuegen — richtige Reihenfolge bei begrenztem Zeitbudget.
- **Zauber-Link-Code liegt vor, aber ohne Zugang**, nachvollziehbar begruendet
  im Journal-Nachtrag: Er soll zurueckkehren, sobald ein eigener Mailversand
  steht.
- **Einkaufsliste, Nachfragen, Auswertung fehlen als Oberflaeche**,
  roadmap-konform. Die zugehoerige Fachlogik (`buildDigest`,
  `detectDuplicate`, `loadWasteSummary`) ist bereits geschrieben und
  getestet, bevor sie gebraucht wird.
- **Kein Baustein fuer Bestaetigungsdialoge oder Rueckgaengig** — eher
  fehlende Entscheidung als bewusster Verzicht, deshalb hier statt bei
  "Fehler".
- **Kostenbremse fuer KI-Schaetzungen ist global statt pro Haushalt**
  (`lib/ai/shelf-life.ts:49-66`), technisch nachvollziehbar begruendet und
  selbst als nachschaerfungsbeduerftig vermerkt, sobald ein zweiter Haushalt
  aktiv wird.
- **Nur ein Oberflaechen-Test existiert** (`components/urgency-badge.test.tsx`).
  Passt zur QA-Reihenfolge aus Konzept Abschnitt 8, erklaert aber auch
  plausibel, wieso die hier gefundenen Bedienfehler trotz sorgfaeltiger
  Fachlogik-Tests unentdeckt blieben: Sie liegen exakt in der noch nicht
  automatisiert gepruften Schicht.

---

## Geschmack

- **Rot bedient drei Bedeutungen, ohne dass das entschieden wurde.** Die
  Farbregel (*"Farbe gehoert ausschliesslich der Dringlichkeit"*,
  `components/ui.tsx:10-13`) wird im Kern eingehalten, die dokumentierte
  Ausnahme fuer den `danger`-Knopftext (Zeilen 36-40) ist umsichtig begruendet.
  Trotzdem sitzt dieser rote "Weggeworfen"-Text in `artikel-zeile.tsx` in
  derselben Zeile wie ein ebenfalls rotes Dringlichkeits-Badge
  (`urgency-badge.tsx:26-27`) — genau dort, wo die Dringlichkeitsfarbe am
  meisten leisten soll, konkurriert sie mit einer andersbedeutenden
  Rot-Verwendung. Dazu kommt Rot fuer Formularfehler (`ui.tsx:104-111`).
  Verbreitete Konvention, aber das Konzept sollte explizit sagen, ob
  Dringlichkeit, destruktive Aktion und Formularfehler sich eine Farbe
  teilen duerfen.
- **Zwei H1-Stile ohne gemeinsamen Baustein:** `PageHeader` (`ui.tsx:141`,
  `text-xl`) vs. eigenstaendige `text-2xl`-Ueberschriften in
  `app/anmelden/page.tsx:31` und `app/auth/fehler/page.tsx:27`. Nachvollziehbar,
  weil ausserhalb des App-Rahmens, aber ein zweiter kleiner Baustein waere
  konsequenter.
- **Zwei Muster fuer "Link, der wie ein Knopf aussieht":** korrekt in
  `app/(app)/vorrat/page.tsx:71-74` (`Link` um `Button`), eigene Klassen in
  `app/auth/fehler/page.tsx:38-43`.
- **Amber und Gelb fuer "morgen"/"diese Woche" liegen optisch nah beieinander**
  (`urgency-badge.tsx:28-29`) — folgenlos, weil der Text entscheidet, aber
  auf den ersten Blick schwer zu unterscheiden.
- **Kein Passwort-Sichtbar-Umschalter** (`app/anmelden/anmelde-formular.tsx:57-68`)
  — fuer eine gemischte Zielgruppe eine kleine, real spuerbare Erleichterung.

---

## Barrierefreiheit

| Pruefpunkt | Befund | Verweis | Schwere |
|---|---|---|---|
| Ueberschriftenhierarchie | Durchgaengig korrekt: ein h1 je Seite, h2 darunter, keine Sprungstufen | `components/ui.tsx:141`, `app/(app)/*/page.tsx` | in Ordnung |
| Landmarken | `<main>` genau einmal je Seite, beide `<nav>` mit unterscheidbarem `aria-label` | `app/(app)/layout.tsx:31`, `components/haupt-navigation.tsx:27-29` | in Ordnung |
| Listen als Listen | Hauptnavigation/Lagerort-Filter sind `Link` in `div`/`nav`, nicht `ul`/`li`; die drei Datenlisten (Vorrat, Entwurf, Mitglieder) dagegen korrekt | `components/haupt-navigation.tsx:31-52`, `app/(app)/vorrat/page.tsx:77-103` | gering |
| Fokus nach Aufklappen | Fokus bleibt regelkonform auf dem Ausloeser (korrektes Disclosure-Verhalten) | `components/vorrat/artikel-zeile.tsx:77-95` | in Ordnung |
| `aria-expanded` | Korrekt gesetzt; `aria-controls` fehlt (Inhalt folgt aber unmittelbar im DOM) | `components/vorrat/artikel-zeile.tsx:80` | gering |
| `aria-current` | Korrekt bei Hauptnavigation und Lagerort-Filter | `components/haupt-navigation.tsx:40`, `app/(app)/vorrat/page.tsx:91` | in Ordnung |
| `role="alert"`/`role="status"` | Wo gerendert, korrekt erst bei DOM-Einfuegung erzeugt, kein stummer Container | `components/ui.tsx:104-111`, `schnelleingabe.tsx:90-106` | in Ordnung |
| Erfolgsrueckmeldung nach Aktion | "Gegessen"/"Weggeworfen"/"Geoeffnet" erzeugen Erfolgstext, der nirgends gerendert wird — nur die Zeile aendert sich sichtbar, ohne Ankuendigung fuer Screenreader | `components/vorrat/artikel-zeile.tsx:47-173` | mittel |
| Beschriftungen | Felder korrekt ueber `label for`/`id` verbunden; Hinweis-/Fehlertext im `Field`-Baustein nie ueber `aria-describedby` verknuepft (0 Treffer projektweit) | `components/ui.tsx:81-114` | mittel |
| Knoepfe ohne sichtbaren Text | Keine gefunden; verdeckte Felder tragen `aria-label`/`sr-only` | `app/(app)/erfassen/page.tsx:118-125` | in Ordnung |
| Farbe als einziges Merkmal (1.4.1) | Dringlichkeit traegt immer Text, Schaetzung zusaetzlich Symbol mit eigenem `aria-label` | `components/urgency-badge.tsx:38-84` | in Ordnung |
| Kontrast | `text-neutral-400` auf Weiss ≈ 2,5:1, unter AA-Minimum 4,5:1 — am deutlichsten dauerhaft auf jeder Seite sichtbar | `components/haupt-navigation.tsx:53-55` (Haushaltsname); auch `haushalt/page.tsx:62`, `einstieg/page.tsx:63`, `auth/fehler/page.tsx:46` | hoch (Fussnavigation) / gering (Rest) |
| Beruehrungsziele ≥44px | Gilt zuverlaessig ueberall mit `Button`/`Input`, Ausnahme: eigener `<button>` mit eigenen, kleineren Klassen ohne garantierte Mindesthoehe | `components/abmelde-formular.tsx:9-15` | mittel |
| `autoFocus` auf dem Handy | Zweimal verwendet; oeffnet auf vielen mobilen Browsern beim erstmaligen Laden nicht automatisch die Bildschirmtastatur | `schnelleingabe.tsx:52`, `anmelde-formular.tsx:47` | mittel (trifft 10-Sekunden-Ziel direkt) |
| `inputmode`/`enterkeyhint`/`autocomplete` | Vorbildlich gesetzt auf allen Formularfeldern | `schnelleingabe.tsx:54-70`, `anmelde-formular.tsx:41-68` | in Ordnung |
| Tastatur verdeckt Feld/Knopf | Eingabefeld liegt oben, nicht unter fixer Leiste; ohne Geraetetest nicht abschliessend beurteilbar | `components/erfassen/schnelleingabe.tsx` | gering (ungeprueft) |
| `prefers-reduced-motion` | Keine Regel vorhanden; im Interface aber praktisch nur eine `transition-opacity` am Knopf | `app/globals.css`, `components/ui.tsx:26-29` | gering |
| Dunkelmodus | Bewusst nicht umgesetzt, siehe "Schuld" | `app/globals.css:9-13` | Schuld |
| Zoom bis 200% | Kein `maximumScale`/`userScalable=no` gesetzt, Zoom technisch nicht blockiert; Layoutfestigkeit ungetestet | `app/layout.tsx:9-13` | gering (ungeprueft) |

---

## Bausteine: Abweichungen und Luecken

**Wortgleiche Duplikate, gezaehlt:**

- `async function householdId()` — identisch **dreimal**:
  `app/(app)/erfassen/actions.ts:19-22`, `app/(app)/haushalt/actions.ts:14-17`,
  `app/(app)/vorrat/actions.ts:22-25`. Gehoert nach `lib/services/current.ts`
  oder `lib/services/household.ts`.
- `const LAGERORT: Record<StorageLocation, string>` und
  `const EINHEIT: Record<Unit, string>` — je **zweimal** identisch:
  `app/(app)/erfassen/page.tsx:28-34`, `components/vorrat/artikel-zeile.tsx:19-29`.
- Der Abschnittskopf ("kleine graue Grossbuchstaben-Ueberschrift mit Zaehler")
  wird **dreimal** von Hand nachgebaut: `app/(app)/erfassen/page.tsx:80-83`,
  `app/(app)/vorrat/page.tsx:123-127`, vereinfacht dreimal in
  `app/(app)/haushalt/page.tsx:47,91,102`. Ein `SectionHeading`-Baustein
  wuerde sechs Stellen auf eine reduzieren.
- Das Muster "abgerundete Listenkarte mit `border-b`-Trennlinien" wird
  **dreimal** eigenstaendig gebaut statt als `ListCard`-Baustein:
  `app/(app)/vorrat/page.tsx:129`, `app/(app)/erfassen/page.tsx:85`,
  `app/(app)/haushalt/page.tsx:50`.

**Abweichungen von `components/ui.tsx`:**

- `components/abmelde-formular.tsx:9-15` baut einen eigenen `<button>` statt
  `<Button variant="secondary">` zu verwenden — dabei geht die garantierte
  Mindesthoehe verloren. Da `Button` eine gewoehnliche, JS-freie
  Funktionskomponente ist, gibt es keinen technischen Grund fuer den
  Alleingang.
- `app/auth/fehler/page.tsx:38-43` baut einen "Knopf" aus einem `<Link>` mit
  eigenen Klassen statt, wie in `vorrat/page.tsx:71-74` korrekt gemacht,
  `<Link>` um `<Button>` zu legen.

**Fehlende Bausteine, die mehrere Stellen brauchen wuerden:** ein
Bestaetigungsdialog fuer destruktive Aktionen (Weggeworfen, Mitglied
entfernen); ein Rueckgaengig-Baustein (siehe Fehler 5); ein Ladezustand fuer
Routenwechsel (siehe Fehler 10); eine einheitliche Erfolgsrueckmeldung — das
Datenmuster `{status:"done", message: string}` existiert bereits identisch
in allen betroffenen Dateien, wird aber nur in zwei von vier Formularen
(`AnzeigenameFormular`, `EinladungErzeugen`) tatsaechlich angezeigt.

**Zur Farbregel:** Sie wird im Kern eingehalten — keine zweite Stelle
erfindet eine eigene Dringlichkeitsfarbe, und die eine dokumentierte Ausnahme
ist bewusst schmal gehalten. Offen ist nur, ob sie auch Formularfehler und
destruktive Knoepfe meint (siehe "Geschmack").

---

## Was gut ist

- **Die Schichtentrennung aus Konzept 7.1 wird vom Linter erzwungen**
  (`no-restricted-imports`, Journal 3.1), nicht nur behauptet — das machte
  jede Suche waehrend dieses Audits verlaesslich schnell.
- **Fehlermeldungen sind durchgaengig deutsch, verstaendlich und
  ursachengenau**, z. B. *"Der letzte Eigentuemer eines Haushalts kann nicht
  entfernt werden..."* (`lib/domain/invite.ts:260-261`), verglichen wird
  konsequent gegen maschinenlesbare Marker statt gegen Texte
  (`lib/domain/invite.ts:239-247`).
- **Wo `role="alert"`/`role="status"` gerendert wird, passiert es korrekt** —
  als frisch eingefuegter Knoten, nicht als stiller, nachtraeglich befuellter
  Container. Genau das im Auftrag genannte, haeufige Fehlermuster wurde
  gezielt gesucht und nicht gefunden.
- **Die Fachlogik ist aussergewoehnlich dicht getestet** (373-395 Tests laut
  Journal), inklusive der Schweizer Spezialfaelle, auf die es ankommt:
  "Rueebli"/"Rueebli" vs. "Ruebli" (`lib/domain/normalize-name.ts:70-90`),
  "6er-Pack", der Vitamin-B12-Fallstrick bei Mengen. Genau die im Konzept
  selbst als Risiko 2 benannte Stelle wurde ernst genommen.
- **"Nichts wird geloescht" ist ein fehlendes Datenbankrecht, keine
  Konvention** (Journal 2.3): `authenticated` hat schlicht kein DELETE auf
  `inventory_items` — eine robustere Garantie als jede Anwendungsregel.
- **Idempotenz wird dort, wo sie zaehlt, hergestellt und auch so
  dokumentiert:** `confirm_intake_batch` ist ausdruecklich wiederholbar
  (`supabase/migrations/20260924090300_stage1_intake_confirm.sql:159-160`),
  und der Kommentar dazu (`lib/services/intake.ts:320-324`) erklaert korrekt,
  warum ein Doppelklick hier harmlos ist — eine begruendete Entscheidung, die
  dieses Audit nicht antasten will.
- **Das Datumsmodell als Zeichenkette statt `Date`** (`lib/domain/types.ts:6-13`)
  beugt einer ganzen Klasse von Zeitzonenfehlern vor, bevor sie entstehen kann.
- **Sortierung nach Dringlichkeit statt alphabetisch** wird konsequent
  durchgehalten und mit einem passenden Datenbankindex unterlegt
  (`lib/data/inventory.ts:136-144`).
- **`inputmode`, `enterkeyhint` und `autocomplete`** sind auf allen
  Formularen bewusst und korrekt gesetzt.
- **Der Verzicht auf einen halbfertigen Dunkelmodus** ist die richtige
  Entscheidung zur richtigen Zeit, mit einer Begruendung, die Bestand haben
  sollte.

Diese Substanz sollte das kommende UI/UX-Konzept sichtbar machen statt neu zu
erfinden: Fachlogik und Datenschicht sind in einem Zustand, der ein
konsistenteres Oberflaechenschicht-Konzept ohne grosse Umbauten tragen kann.
Die in diesem Audit gefundenen Probleme liegen fast ausschliesslich in der
duennsten, am wenigsten getesteten Schicht — der Oberflaeche selbst.
