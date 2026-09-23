# Lebensmitteltracker für Haushalte — Konzept

**Datum:** 23.09.2026
**Kontext:** GIBZ, Semester 7, Modul IIL — Semesterarbeit mit dem Anspruch, danach im eigenen Haushalt produktiv genutzt zu werden
**Arbeitstitel:** yummytracker
**Status:** Konzept freigegeben, Implementierungsplan folgt

---

## 1. Ausgangslage

Haushalte — Familien wie Wohngemeinschaften — werfen regelmässig Lebensmittel weg, weil sie verderben, bevor jemand sie bemerkt. Daneben treten zwei verwandte Probleme auf: Dieselbe Ware wird doppelt gekauft, weil niemand weiss, was schon da ist, und Benötigtes wird vergessen, weil es nirgends festgehalten wurde.

Alle drei Probleme haben dieselbe Wurzel: **Es fehlt ein gemeinsames, aktuelles Bild davon, was im Haushalt vorhanden ist und wie lange es noch gut ist.**

### Ziel

Eine Webanwendung, die dieses Bild mit minimalem Aufwand aktuell hält und sich von selbst meldet, bevor etwas verdirbt. Nicht ein weiteres Werkzeug, das gepflegt werden muss, sondern eines, das an den zwei Momenten ansetzt, in denen ohnehin Aufmerksamkeit vorhanden ist: **beim Auspacken des Einkaufs** und **kurz bevor etwas abläuft.**

### Erfolgskriterien

| Kriterium | Messgrösse |
|---|---|
| Erfassen ist schnell genug für den Alltag | Ein Artikel in unter 10 Sekunden |
| Die App wird tatsächlich benutzt | Ab Ende Stufe 1 durchgehende Eigennutzung bis Semesterende |
| Der Haushalt nutzt sie gemeinsam | Mindestens zwei aktive Mitglieder |
| Die Wirkung ist belegbar | Weggeworfen-Auswertung über mindestens drei Monate echte Daten |
| Der Zugriffsschutz hält | Automatisierter Nachweis, dass ein fremder Haushalt keine Daten sieht |

---

## 2. Rahmenbedingungen

| Punkt | Festlegung |
|---|---|
| Zweck | Semesterarbeit **und** echtes Werkzeug für den eigenen Haushalt |
| Modulvorgaben | Keine — freie Wahl von Technologie und Vorgehen |
| Zeitbudget | 4–8 Stunden pro Woche bis Ende Januar 2027; rund 16 effektive Wochen |
| Betrieb | Vercel (Hosting) und Supabase (Datenbank, Anmeldung, Dateiablage) |
| Zielgerät | Handy zuerst; Desktop funktioniert, ist aber nicht der Schwerpunkt |
| Sprache | Deutsch in Schweizer Rechtschreibung |
| Haushaltstyp | Familie zuerst; WG-Modus später nachrüstbar, ohne Umbau |

---

## 3. Produktkern

### 3.1 Die Nutzungsschleife

```
   Einkaufsliste ──► im Laden abhaken ──► Eingang prüfen ──► Vorrat
         ▲                                      ▲              │
         │                              tippen · scannen       │
         │                                 · Bon-Foto     Ablauf naht
         │                                                     │
         └────── "war weg" ◄─── Antwort ◄─── Nachfrage ◄───────┘
                                              (Mail + App)
```

Der Bestand pflegt sich an den zwei Stellen, an denen ohnehin Aufmerksamkeit da ist. Es gibt keinen Arbeitsschritt „Inventar aktualisieren".

### 3.2 Probleme und ihre Mechanismen

| Problem | Mechanismus | Belegbar an |
|---|---|---|
| Lebensmittel verderben | Nachfrage vor Ablauf, per Mail zustellbar, in einem Klick beantwortbar | Weggeworfen-Quote über Zeit |
| Doppelt eingekauft | Warnung beim Hinzufügen zur Einkaufsliste, wenn die Ware schon im Vorrat liegt | Anzahl angezeigter Warnungen |
| Etwas vergessen | Eine geteilte Liste, die alle Mitglieder in Echtzeit sehen | Zahl der Mitglieder, die Einträge hinzufügen |

### 3.3 Bildschirme

| Bildschirm | Inhalt |
|---|---|
| **Vorrat** (Start) | Alle aktiven Artikel, sortiert nach Dringlichkeit statt alphabetisch. Wer die App öffnet, sieht zuerst, was drängt. Filter nach Lagerort. |
| **Erfassen** | Eine Taste, dahinter die Erfassungswege. Alle enden im selben Prüf-Schritt mit vorgeschlagener Haltbarkeit. |
| **Einkaufsliste** | Geteilt, in Echtzeit, zum Abhaken. Warnt bei Ware, die schon im Vorrat liegt. |
| **Nachfragen** | Die offenen „noch da?"-Fragen. Aus der Mail direkt aufrufbar. |
| **Auswertung** | Weggeworfenes in Stück und Franken über Zeit, aufgeschlüsselt nach Kategorie. |
| **Haushalt** | Mitglieder, Einladungslink, Einstellungen zum Mailversand. |

Dazu ein Einstieg für neue Nutzer: Haushalt anlegen oder über Einladungslink beitreten.

### 3.4 Rollen

Alle Mitglieder sind gleichberechtigt. Einzige Ausnahme: Wer den Haushalt angelegt hat, kann Mitglieder entfernen und den Haushalt löschen. Es gibt kein weiteres Rechtesystem — ein Haushalt ist keine Firma.

---

## 4. Fachliche Grundentscheidungen

Diese sechs Entscheidungen prägen alles Weitere und wurden bewusst gegen Alternativen abgewogen.

### 4.1 Der Eingang ist eine eigene Stufe

Tippen, Barcode-Scan, Bon-Foto und die abgehakte Einkaufsliste erzeugen **alle denselben Entwurf** mit Zeilen. Erst das Bestätigen macht daraus Bestand.

*Begründung:* Kein Erfassungsweg kennt das Ablaufdatum — weder Bon noch Barcode verraten es. Ein Prüf-Schritt ist deshalb bei allen Wegen unvermeidbar. Wenn er ohnehin nötig ist, soll er genau einmal existieren. Ein weiterer Erfassungsweg bedeutet dann später nur noch: eine Funktion schreiben, die Zeilen erzeugt.

### 4.2 Abgang durch Nachfrage statt durch Pflege

Das System fragt kurz vor Ablauf nach: *gegessen / weggeworfen / noch da, Datum stimmt nicht.* Freiwilliges Abhaken bleibt jederzeit möglich, ist aber nicht nötig.

*Begründung:* Diszipliniertes Abhaken bei jedem Griff in den Kühlschrank ist die Stelle, an der solche Anwendungen im Alltag scheitern. Die Nachfrage dreht die Last um: eine Antwort, drei Wirkungen — Bestand korrigiert, Erinnerung erledigt, Statistik entstanden.

*Verworfen:* Artikel nach Ablauf automatisch verschwinden lassen. Das wäre aufwandsfrei, liefert aber keine Aussage darüber, was tatsächlich im Müll landete — und damit keinen Wirkungsnachweis.

### 4.3 Haltbarkeit über eine Fallback-Kette

```
Haushalt + Produkt  →  Produkt global  →  Kategorie  →  KI-Schätzung
    (gelernt)          (Startkatalog)    (Auffangnetz)   (einmalig)
```

*Begründung:* Manuelles Eintippen des Datums bei jedem Artikel ist genau die Friktion, die zum Abbruch führt. Der Katalog macht den Normalfall zum Einzeiler; die Kette fängt alles ab, was der Katalog nicht kennt.

*Wichtig:* Die KI-Schätzung wird **in den Katalog zurückgeschrieben.** Jedes unbekannte Produkt kostet damit genau einmal eine Abfrage — danach ist der Wert für alle Haushalte vorhanden. Der Katalog wächst im Betrieb, ohne dass ihn jemand pflegt.

*Zusätzlich:* Geöffnet ändert alles. Eine ungeöffnete Milch hält bis zum Aufdruck, eine geöffnete drei Tage. Die Regeln führen deshalb getrennte Werte für ungeöffnet und geöffnet.

### 4.4 Zustellung per E-Mail mit Aktionslinks, zusätzlich in der App

Eine kurze Mail pro Tag listet, was ansteht, und enthält je Artikel drei Antwortlinks. Ein Klick erledigt die Sache ohne Anmeldung und ohne die App zu öffnen. Derselbe Stand ist jederzeit in der App sichtbar.

*Begründung:* Eine Erinnerung, die nur in der App steht, sieht nur, wer die App ohnehin öffnet — und wer sie ohnehin öffnet, braucht keine Erinnerung. E-Mail funktioniert auf jedem Gerät ohne Installation.

*Verworfen für den MVP:* Push-Benachrichtigungen. Sie wirken hochwertiger, erfordern auf dem iPhone aber, dass jedes Mitglied die Web-App zuvor zum Home-Bildschirm hinzufügt. Diese Hürde kostet in einem Haushalt zuverlässig die Hälfte der Mitglieder.

### 4.5 Familie zuerst, WG-Modus nachrüstbar

Im MVP gehört der Vorrat dem Haushalt gemeinsam; es gibt keinen Eigentumsbegriff in der Oberfläche. Das Datenmodell führt jedoch von Anfang an ein leeres Eigentümer-Feld.

*Begründung:* Eigentum gleichzeitig gut zu bedienen kostet Zuordnung, Filter, Sichtbarkeitsregeln und später Kostenaufteilung — ein eigenes Subsystem, kein Feld. Das leere Feld kostet nichts und erspart später den Umbau.

### 4.6 Die Einkaufsliste ist zugleich ein Erfassungsweg

Wer im Laden abhakt, hat dem System bereits gesagt, was gleich nach Hause kommt. Abgehaktes kann auf Wunsch direkt in den Eingang übernommen werden.

*Begründung:* Das ist die bequemste denkbare Erfassung, weil das Abhaken beim Einkaufen ohnehin geschieht. Gleichzeitig schliesst es die Schleife von Abschnitt 3.1.

---

## 5. Datenmodell

Dreizehn Tabellen. Alle Zeitstempel mit Zeitzone, alle Schlüssel als UUID.

| Stufe | Tabellen |
|---|---|
| 0 | `households`, `household_members`, `household_invites` |
| 1 | `categories`, `products`, `shelf_life_rules`, `inventory_items`, `intake_batches`, `intake_lines` |
| 2 | `digest_log`, `action_tokens` |
| 3 | `shopping_list_items` |
| 7 | `recipe_suggestions` |

### 5.1 Haushalt

**`households`**
`id` · `name` · `created_by` → Nutzer · `created_at`

**`household_members`**
`household_id` · `user_id` · `role` (`owner` | `member`) · `display_name` · `joined_at`
Primärschlüssel: (`household_id`, `user_id`)

**`household_invites`**
`id` · `household_id` · `token_hash` · `created_by` · `expires_at` · `used_at` · `used_by`

> Gespeichert wird nur der Hash des Einladungsschlüssels, nie der Klartext. Wer die Datenbank liest, kann damit keinem Haushalt beitreten.

### 5.2 Katalog

**`categories`**
`id` · `slug` · `name` · `sort_order`

**`products`**
`id` · `name` · `normalized_name` (indexiert) · `category_id` · `brand` · `ean` (indexiert) · `default_unit` · `default_storage` · `image_url` · `source` (`seed` | `off` | `ai` | `user`) · `verified` · `household_id` (leer = global) · `created_at` · `created_by`

> Der Katalog wächst über alle Haushalte hinweg. `normalized_name` verhindert Dubletten durch Schreibweisen; `source` und `verified` machen nachvollziehbar, woher ein Eintrag stammt.
>
> Die Regel dazu ist bewusst einfach gehalten: **Einträge aus dem Startkatalog, aus der Produktdatenbank und aus KI-Schätzungen sind global. Von Nutzern selbst angelegte Produkte bleiben dauerhaft beim eigenen Haushalt.** Es gibt im MVP keine automatische Beförderung ins Globale — sie wäre schwer richtig zu treffen und würde Tippfehler über alle Haushalte verteilen.

**`shelf_life_rules`**
`id` · `scope` (`product` | `category`) · `product_id` · `category_id` · `storage` · `days_unopened` · `days_opened` · `household_id` (leer = global) · `source` (`seed` | `ai` | `learned`) · `sample_count` · `created_at` · `updated_at`

> Hier liegt die Fallback-Kette als Daten statt als Code. Die Auflösung ist eine Abfrage, sortiert nach Genauigkeit: haushaltseigene Produktregel vor globaler Produktregel vor Kategorieregel.
>
> **Die Lernregel konkret:** Korrigiert jemand das vorgeschlagene Datum eines Produkts, wird das noch nicht gelernt — einmal kann ein Sonderfall sein. Ab der **zweiten** Korrektur in dieselbe Richtung entsteht eine haushaltseigene Zeile mit dem Mittel der beobachteten Werte. Jede weitere Korrektur aktualisiert diesen Mittelwert, `sample_count` zählt die Beobachtungen. Eine bestehende globale Zeile wird dabei nie verändert.

### 5.3 Vorrat

**`inventory_items`**
`id` · `household_id` · `product_id` · `display_name` · `quantity` · `unit` · `storage` · `expires_at` · `expiry_source` (`label` | `learned` | `catalog` | `category` | `ai` | `manual` | `none`) · `opened_at` · `price_chf` · `owner_id` (leer im MVP) · `note` · `status` (`active` | `consumed` | `discarded`) · `resolved_at` · `resolved_by` · `added_at` · `added_by` · `intake_line_id`

> Drei bewusste Entscheidungen: **Nichts wird gelöscht** — erledigte Artikel bekommen Status und Datum und bleiben stehen, sonst gäbe es keine Auswertung. **`display_name` ist ein Schnappschuss**, damit eine spätere Umbenennung im Katalog die Historie nicht verfälscht. **`expiry_source` wird mitgeführt**, damit in der Oberfläche unterscheidbar bleibt, ob ein Datum abgelesen oder geschätzt wurde — geschätzte Daten dürfen weicher gewarnt werden.

### 5.4 Eingang

**`intake_batches`**
`id` · `household_id` · `source` (`manual` | `barcode` | `receipt` | `shopping_list`) · `status` (`draft` | `confirmed` | `discarded`) · `receipt_path` · `raw_payload` · `created_by` · `created_at` · `confirmed_at`

**`intake_lines`**
`id` · `batch_id` · `position` · `raw_text` · `product_id` · `match_confidence` · `quantity` · `unit` · `price_chf` · `storage` · `suggested_expires_at` · `expiry_source` · `accepted`

> `raw_payload` und `raw_text` bewahren die Rohausgabe der Erkennung auf. Das ist die Grundlage, um später zu beurteilen, wie gut die Bon-Erkennung tatsächlich arbeitet — ein Messwert, der in die Semesterarbeit gehört.

### 5.5 Einkaufsliste

**`shopping_list_items`**
`id` · `household_id` · `product_id` · `free_text` · `quantity` · `unit` · `status` (`open` | `checked` | `cancelled`) · `added_by` · `added_at` · `checked_by` · `checked_at` · `intake_batch_id`

> Bedingung: `product_id` oder `free_text` muss gesetzt sein. Freitext ist ausdrücklich erlaubt — niemand soll gezwungen sein, für „irgendwas zum Znacht" erst ein Produkt anzulegen.

### 5.6 Zustellung

**`digest_log`**
`id` · `household_id` · `user_id` · `channel` · `sent_at` · `item_ids`

> Verhindert, dass dieselbe Nachfrage täglich wiederholt wird.

**`action_tokens`**
`id` · `token_hash` · `household_id` · `inventory_item_id` · `action` (`consumed` | `discarded` | `extend`) · `expires_at` · `used_at`

> Trägt die Ein-Klick-Links der Mail. Kurzlebig, einmal verwendbar, nur als Hash gespeichert.

### 5.7 Verwerte-Vorschlag (Stufe 7)

**`recipe_suggestions`**
`id` · `household_id` · `created_at` · `based_on_item_ids` · `title` · `body` · `used` (ob jemand danach gekocht hat)

> Nur ein Zwischenspeicher: Derselbe Ablaufbestand soll nicht mehrfach abgefragt werden, und `used` macht messbar, ob der Vorschlag überhaupt etwas bewirkt.

---

## 6. Fachlogik-Kern

Diese Regeln leben in `lib/domain/` als reine Funktionen — ohne Datenbank, ohne React, ohne Netzwerk. Jede ist ohne laufende Infrastruktur testbar. Das ist der Teil, der sich am besten dokumentieren lässt und der auch dann noch stimmt, wenn die Oberfläche dreimal umgebaut wird.

| Funktion | Aufgabe | Ergebnis |
|---|---|---|
| `resolveShelfLife` | Fallback-Kette auflösen, getrennt nach ungeöffnet/geöffnet | Tage plus Herkunft der Angabe |
| `computeExpiry` | Ablaufdatum bestimmen aus Aufdruck, Zugangsdatum, Öffnungsdatum, Haltbarkeit | Datum plus Herkunft |
| `bucketUrgency` | Einstufen gegen das heutige Datum | abgelaufen / heute / morgen / diese Woche / unkritisch / unbekannt |
| `normalizeName` | Schreibweisen vereinheitlichen: Grossschreibung, Umlaute, Mehrzahl, Markenrauschen | Vergleichbarer Name |
| `matchProduct` | Unscharfer Abgleich einer Bonzeile gegen Katalogkandidaten | Treffer mit Sicherheitsmass |
| `detectDuplicate` | Neuen Listeneintrag gegen Vorrat und offene Liste prüfen | Art der Dublette plus betroffene Artikel |
| `normalizeQuantity` | Mengen vereinheitlichen | Stück, Gramm oder Milliliter |
| `buildDigest` | Zusammenstellen, was heute in die Mail gehört | Dringend- und Bald-Gruppe |

**`normalizeName` ist die stille Schlüsselfunktion.** Sie entscheidet, ob „M-CLASSIC VOLLMILCH 1L" vom Bon, „Vollmilch" aus der Einkaufsliste und der gescannte Barcode als dasselbe Produkt erkannt werden. Gelingt das nicht, zerfällt der Katalog in Dubletten, die Haltbarkeitsregeln greifen nicht mehr und die Doppelkauf-Warnung schweigt. Sie verdient von allen Funktionen die dichteste Testabdeckung.

---

## 7. Technische Architektur

### 7.1 Schichten

```
  app/           Seiten, Server-Komponenten, Server-Aktionen
  components/    Oberfläche
  lib/services/  Anwendungsfälle  ("Eingang bestätigen", "Nachfrage beantworten")
  lib/domain/    reine Regeln     ← keine Datenbank, kein React, voll testbar
  lib/data/      Datenzugriff     ← die einzige Stelle mit Supabase-Aufrufen
  lib/ai/        KI-Adapter       ← ausschliesslich serverseitig
```

**Die tragende Regel:** `lib/data/` ist die einzige Stelle mit Datenbankzugriff, und `lib/domain/` kennt weder Datenbank noch Oberfläche. Daraus folgt beides: Die Fachlogik ist ohne laufende Datenbank testbar, und der Datenzugriff bleibt austauschbar. Diese eine Regel trägt den grössten Teil der Codequalität.

### 7.2 Technologie

| Baustein | Wahl |
|---|---|
| Anwendung | Next.js mit App Router, TypeScript |
| Oberfläche | Tailwind CSS mit einer zurückhaltenden, eigenen Gestaltung |
| Hosting | Vercel |
| Datenbank, Anmeldung, Dateiablage | Supabase (PostgreSQL) |
| Zeitgesteuerte Aufgaben | Zeitplan in der Datenbank, der eine Server-Funktion aufruft |
| Schema-Verwaltung | Versionierte Migrationen im Repository |
| Tests | Schnelle Tests für die Fachlogik, Durchstiche im Browser |

### 7.3 Anmeldung und Beitritt

Anmeldung per Zauber-Link an die E-Mail-Adresse — kein Passwort. Für einen Familienhaushalt die niedrigste Hürde: nichts zu merken, nichts zurückzusetzen.

Der Beitritt läuft über einen Einladungslink mit begrenzt gültigem Schlüssel. Ein Mitglied teilt ihn per Chat, der Rest sind zwei Klicks. Der Schlüssel ist einmal verwendbar und läuft ab.

### 7.4 Zugriffsschutz auf zwei Ebenen

**Ebene 1 — Datenbank.** Jede Tabelle mit Haushaltsbezug erhält Zeilen-Sicherheitsregeln nach dem Muster: Zugriff nur, wenn der anfragende Nutzer Mitglied dieses Haushalts ist. Der Katalog ist global lesbar, aber nur serverseitig schreibbar.

**Ebene 2 — Anwendung.** Die Dienst-Schicht prüft die Zugehörigkeit zusätzlich selbst, bevor sie etwas ausführt.

Selbst wenn eine Datenbankregel falsch formuliert ist, greift die zweite Ebene. Der allmächtige Datenbankschlüssel liegt ausschliesslich in serverseitigen Funktionen und erreicht den Browser nie.

### 7.5 KI-Aufrufe

Drei Anwendungen, alle ausschliesslich serverseitig:

| Zweck | Art | Stufe |
|---|---|---|
| Bon-Erkennung | Bildauswertung mit festem Ausgabeschema | 6 |
| Haltbarkeits-Schätzung | Kurze Textabfrage, Ergebnis wandert in den Katalog | 1 |
| Verwerte-Vorschlag | Textabfrage über die Ablaufliste | 7 |

Für die Bildauswertung braucht es das stärkere Modell, für die kurzen Textabfragen reicht das günstige. Die konkrete Modellwahl und die Kosten werden im Implementierungsplan festgelegt.

**Kostenbremse:** Pro Haushalt gilt eine Obergrenze an Aufrufen pro Tag. Ohne sie kann ein Fehler in einer Schleife unbemerkt eine hohe Rechnung erzeugen.

### 7.6 Zustellung

Ein täglicher Zeitplan in der Datenbank ruft eine Server-Funktion auf. Diese prüft je Haushalt, was ansteht, gleicht gegen das Versandprotokoll ab und verschickt eine Mail an die Mitglieder, die den Versand aktiviert haben.

Die drei Antwortlinks je Artikel tragen einen signierten, kurzlebigen Schlüssel. Ein Klick erledigt die Sache ohne Anmeldung. Verwendete Schlüssel werden entwertet.

### 7.7 Einkaufsliste im Laden

Die Liste liegt zusätzlich im Gerätespeicher. Abhaken wirkt sofort und wird nachgereicht, sobald wieder Verbindung besteht. Bei bestehender Verbindung sehen alle Mitglieder Änderungen in Echtzeit.

Das ist bewusst kein vollständiger Datenabgleich mit Konfliktauflösung — nur die eine Ansicht, in der schlechter Empfang wirklich stört. Abhaken ist dabei die einzige Aktion, bei der Konflikte unkritisch sind: Zweimal abgehakt bleibt abgehakt.

### 7.8 Installierbarkeit

Die App lässt sich auf dem Handy zum Home-Bildschirm hinzufügen und startet dann ohne Browserleiste. Push-Benachrichtigungen sind **nicht** Teil des MVP.

---

## 8. Qualitätssicherung

Vier Ebenen, absteigend nach Menge:

| Ebene | Umfang | Zweck |
|---|---|---|
| **Fachlogik** | Viele schnelle Tests ohne Datenbank | Schwerpunkt. Hier liegen die Regeln, hier liegt das Risiko stiller Fehler |
| **Datenzugriff** | Ausgewählte Tests gegen eine lokale Datenbank | Beweist, dass Abfragen und Migrationen zusammenpassen |
| **Zugriffsschutz** | Eigener Test mit zwei Haushalten | Beweist, dass Haushalt B nichts von Haushalt A sieht |
| **Durchstiche** | Drei Abläufe von Anfang bis Ende | Erfassen und bestätigen · Liste abhaken · Nachfrage beantworten |

Der Zugriffsschutz-Test ist bewusst als eigene Ebene geführt. Er ist der Nachweis, dass die Trennung zwischen Haushalten nicht nur behauptet, sondern geprüft ist — die Art von Beleg, die in einer Semesterarbeit zählt.

Bei jedem Stand laufen automatisch Formatprüfung, Typprüfung, Tests und Bau. Jeder Änderungsvorschlag erhält eine eigene Vorschau-Adresse.

---

## 9. Betrieb und Kosten

| Posten | Einschätzung |
|---|---|
| Hosting | Gratis-Tarif ausreichend |
| Datenbank | Gratis-Tarif ausreichend |
| Mailversand | Gratis-Kontingent deutlich ausreichend bei einer Mail pro Haushalt und Tag |
| KI-Aufrufe | Rappen pro Nutzung; über das Semester realistisch wenige Franken |

Zwei Stolpersteine:

- **Ungenutzte Gratis-Datenbanken werden nach etwa einer Woche pausiert.** Der tägliche Zeitplan hält sie wach — das ist ein Nebeneffekt, auf den man sich verlassen kann, den man aber kennen muss.
- **Der Gratis-Tarif des Hosters ist nicht für kommerzielle Nutzung vorgesehen.** Für eine Semesterarbeit unproblematisch, für ein späteres Produkt nicht.

---

## 10. Ausbaustufen und Zeitplan

**Grundregel:** Jede Stufe endet mit etwas Benutzbarem. Es gibt nie einen Zwischenstand, bei dem die App halb kaputt ist. Falls die Zeit ausgeht, bleibt eine Stufe weniger — aber nichts Angefangenes.

| Stufe | Was entsteht | ca. h | kumuliert |
|---|---|---|---|
| **0 Fundament** | Anmeldung, Haushalt anlegen, Einladungslink, Auslieferung und Prüfläufe stehen | 10 | 10 |
| **1 Vorrat** | Startkatalog, Fachlogik-Kern, manuelle Erfassung mit Prüf-Schritt, Vorrats-Ansicht nach Dringlichkeit | 25 | 35 |
| **2 Ablauf-Schleife** | Nachfragen beantworten, aus Korrekturen lernen, täglicher Mailversand mit Ein-Klick-Links | 18 | 53 |
| **3 Einkaufsliste** | Geteilt und live, Doppelkauf-Warnung, Abhaken übernimmt in den Eingang, funktioniert ohne Empfang | 15 | 68 |
| **4 Auswertung** | Weggeworfenes in Stück und Franken über Zeit, nach Kategorie | 7 | 75 |
| **5 Barcode** | Kamera-Scan mit Produktabfrage, speist den Eingang | 12 | 87 |
| **6 Bon** | Foto oder PDF hochladen, Bildauswertung, Abgleich gegen den Katalog | 15 | 102 |
| **7 Verwerte-Vorschlag** | „Das läuft bald ab — koch daraus X" | 6 | 108 |

Dazu rund 12 Stunden Dokumentation, über das Semester verteilt.

### Was bei welchem Pensum realistisch ist

Bei 16 effektiven Wochen:

| Pensum | verfügbar | abzüglich Doku | erreichbar |
|---|---|---|---|
| 4 h/Woche | 64 h | 52 h | **Stufe 0–2** (53 h) — exakt aufgebraucht, keine Reserve |
| 6 h/Woche | 96 h | 84 h | **Stufe 0–4** (75 h) — mit rund 9 h Reserve |
| 8 h/Woche | 128 h | 114 h | **Stufe 0–7** (108 h) — knapp, aber machbar |

Der Plan geht von **6 Stunden pro Woche** als Grundlage aus. Zwei Hinweise dazu:

Die Stundenzahlen sind Schätzungen ohne grossen Puffer. Wenn sich abzeichnet, dass es nur für 4 Stunden pro Woche reicht, sollte **Stufe 3 gestrichen und stattdessen Stufe 4 gebaut werden.** Die Auswertung ist der Wirkungsnachweis der Arbeit, die Einkaufsliste nicht — auch wenn sie im Alltag nützlicher wäre.

Umgekehrt gilt: Reserve wird nicht in zusätzliche Stufen investiert, sondern in Stufe 1. Siehe unten.

### Die Sollbruchstelle liegt nach Stufe 4

Stufe 0 bis 4 ergeben zusammen eine vollständige, in sich schlüssige Arbeit: Alle drei Ausgangsprobleme sind gelöst, und die Wirkung ist mit eigenen Daten belegt. Stufe 5 bis 7 sind Ausbau.

Sollte es eng werden, fällt **von hinten** weg. Vorne wird nicht gekürzt.

### Der wichtigste Meilenstein ist das Ende von Stufe 1

Ab da ist die App im eigenen Haushalt benutzbar, und ab da muss sie täglich benutzt werden. Bei 6 Stunden pro Woche fällt das auf Anfang bis Mitte November. Bis Ende Januar entstehen so rund drei Monate echte Daten — und genau die sind das Ergebnis der Arbeit. Ohne sie bleibt es eine Softwaredemo; mit ihnen wird es ein Wirkungsnachweis.

Daraus folgt die wichtigste Planungsregel des Projekts: **Jede gewonnene Stunde geht zuerst in Stufe 1, nicht in eine weitere Stufe.** Eine Woche früher benutzbar ist eine Woche mehr Daten. Und eine Erfassung, die sich gut anfühlt, entscheidet darüber, ob überhaupt Daten entstehen.

### Dokumentation läuft mit

Nach jeder Stufe ein kurzer Eintrag: was gebaut wurde, welche Entscheidung warum gefallen ist, was nicht funktioniert hat. Am Ende ist die Arbeit weitgehend geschrieben, statt in der letzten Woche zu entstehen. Rund 12 Stunden über das Semester verteilt.

### Wie der Implementierungsplan geschnitten wird

Dieses Konzept beschreibt alle acht Stufen, aber **es wird nicht ein einziger Plan daraus.** Das wäre ein Dokument, das nach der zweiten Stufe veraltet ist.

Stattdessen bekommt jede Stufe ihren eigenen Implementierungsplan, geschrieben kurz bevor sie gebaut wird. Den Anfang machen Stufe 0 und 1 gemeinsam, weil das Fundament ohne einen ersten echten Anwendungsfall nicht sinnvoll prüfbar ist. Was in Stufe 2 gelernt wird, fliesst dann in den Plan für Stufe 3 ein — und nicht in eine Korrektur eines längst geschriebenen Plans.

---

## 11. Nicht im Umfang

Ausdrücklich ausgeschlossen, damit es nicht durch die Hintertür zurückkommt:

- WG-Eigentumsverwaltung mit Zuordnung und Kostenaufteilung
- Rezeptverwaltung mit eigener Rezeptdatenbank und Zutaten-Abgleich
- Automatisiertes Bestellen
- Push-Benachrichtigungen
- Mehrsprachigkeit
- Nährwerte und Kalorien
- Preisvergleiche zwischen Händlern

Alles davon steht als Ausblick im Konzept. Keines davon wird gebaut.

---

## 12. Risiken

| Risiko | Wirkung | Gegenmassnahme |
|---|---|---|
| **Erfassen fühlt sich zäh an** | Niemand benutzt die App, im Januar fehlen die Daten — das Projekt verliert seinen Kern | Stufe 1 bekommt mit vier Wochen den grössten Block. Erfolgskriterium ist keine Funktionsliste, sondern eine Zahl: ein Artikel in unter 10 Sekunden |
| **Produktnamen lassen sich nicht zuverlässig zuordnen** | Katalog zerfällt in Dubletten, Haltbarkeitsregeln greifen nicht, Doppelkauf-Warnung schweigt | `normalizeName` bekommt die dichteste Testabdeckung im ganzen Projekt, mit echten Bonzeilen als Testdaten |
| **Bon-Erkennung ist schlechter als erhofft** | Stufe 6 liefert unbrauchbare Ergebnisse | Stufe 6 steht bewusst spät und ist verzichtbar. Die Rohausgaben werden gespeichert, sodass die Qualität messbar statt gefühlt beurteilt wird |
| **Das Semester wird knapper als geplant** | Stufen bleiben offen | Sollbruchstelle nach Stufe 4; jede Stufe ist für sich abgeschlossen |
| **KI-Kosten laufen weg** | Unerwartete Rechnung | Obergrenze pro Haushalt und Tag; Ergebnisse werden im Katalog zwischengespeichert statt wiederholt abgefragt |
| **Datenbank pausiert im Gratis-Tarif** | App scheinbar defekt | Der tägliche Zeitplan hält sie wach |

---

## 13. Ausblick

Diese Punkte sind **nicht** Teil des Projekts, aber im Datenmodell vorbereitet, sodass sie ohne Umbau nachrüstbar bleiben:

**WG-Modus.** Das Eigentümer-Feld in `inventory_items` existiert bereits. Nachzurüsten wären: Zuordnung beim Erfassen, Filter in der Vorratsansicht, getrennte Listenbereiche und optional eine Kostenaufteilung.

**Rezepte.** Zunächst der Verwerte-Vorschlag aus Stufe 7, danach eigene Rezepte mit Zutaten-Abgleich gegen den Vorrat und automatischer Ergänzung fehlender Zutaten auf der Einkaufsliste. Der Katalog mit Kategorien und vereinheitlichten Mengen ist dafür die Grundlage.

**Bestellen.** Hier ist eine Erwartungskorrektur nötig: **LeShop, Migros Online und Coop@home bieten keine öffentlichen Schnittstellen für Drittanbieter an.** Der einzige saubere Weg ist, aus der Einkaufsliste ein Format zu erzeugen, das sich beim Händler zügig übernehmen lässt. Alles darüber hinaus wäre Browser-Automatisierung gegen die Nutzungsbedingungen — nichts, was in einer Semesterarbeit dokumentiert werden sollte.

**Push-Benachrichtigungen.** Nachrüstbar, sobald der E-Mail-Weg steht. Die Zustelllogik ist bereits vom Kanal getrennt.

---

## 14. Offene Punkte

Alle offenen Punkte haben einen Vorschlag, mit dem weitergearbeitet werden kann. Keiner blockiert den Start.

| Punkt | Vorschlag, bis entschieden ist | Zu klären bis |
|---|---|---|
| **Produktname** — „yummytracker" klingt nach Ernährungstagebuch und passt schlecht zur Kernbotschaft „wirf weniger weg" | Arbeitstitel beibehalten; der Name steht an einer Stelle im Code | Stufe 1, vor der ersten Oberfläche |
| **Modellwahl und Kostenrahmen** für die KI-Aufrufe | Starkes Modell für Bilder, günstiges für kurze Texte; Obergrenze 50 Aufrufe pro Haushalt und Tag | Implementierungsplan Stufe 1 |
| **Umfang des Startkatalogs** | Rund 250 Produkte in 25 Kategorien, ausgewählt nach dem, was in einem Schweizer Haushalt wöchentlich vorkommt | Stufe 1 |
| **Versandzeit und Vorwarnzeit** | Mail um 17 Uhr, Vorwarnung 3 Tage vor Ablauf — beides pro Haushalt einstellbar | Stufe 2 |
| **Verhalten bei geschätztem Datum** | Geschätzte Daten (`expiry_source` ist nicht `label`) werden in der Oberfläche als solche gekennzeichnet und lösen die Nachfrage einen Tag später aus als abgelesene | Stufe 2 |
