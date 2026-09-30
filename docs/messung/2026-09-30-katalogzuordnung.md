# Messung: trifft der Katalog echte Kassenbonzeilen?

**Datum:** 30.09.2026
**Grundlage:** ein echter Migros-Bon (34 Zeilen) und ein echter Coop-Bon (12 Zeilen)
**Werkzeug:** `node scripts/measure-catalog-match.mjs <bondatei>`
**Katalog:** 273 Produkte, 27 Kategorien

> Die Bondateien selbst liegen unter `docs/messung/bons/` und sind
> absichtlich **nicht** im Repository: Ein Kassenbon verrät den
> vollständigen Einkauf, und dieses Repository ist öffentlich. Hier stehen
> die Messwerte und die Fehlermuster, nicht die Einkaufsliste.

---

## 1. Das Ergebnis

| | Migros | Coop | zusammen |
| --- | --- | --- | --- |
| Zeilen | 34 | 12 | 46 |
| ohne jeden Kandidaten | 17 (50 %) | 5 (42 %) | **22 (48 %)** |
| irgendeine Zuordnung | 16 | 7 | 23 |
| davon sicher (≥ 0.60) | 6 | 3 | **9 (20 %)** |
| davon unsicher | 10 | 4 | 14 |

**Jede zweite Bonzeile findet im Katalog überhaupt keinen Kandidaten, und
nur jede fünfte wird sicher zugeordnet.**

Zum Vergleich: An 18 selbst formulierten Testzeilen („Hackfleisch Rind
500g", „M-Classic Vollmilch 1L") lag die Quote nach der Suchkorrektur bei
17 von 18. Die selbst gebauten Zeilen waren zu freundlich — sie enthielten
generische Lebensmittelnamen, echte Bonzeilen enthalten Markenkürzel.

---

## 2. Warum es scheitert

### 2.1 Die Hälfte der Produkte gibt es im Katalog nicht

Und zwar nicht aus Nachlässigkeit, sondern grundsätzlich. Auf den beiden
Bons stehen unter anderem: Rispentomaten, Currypaste, Kokosmilch,
Panko-Paniermehl, Schmelzkäse, Tête de Moine, Proteinbrot, Mostmöckli,
Buttergemüse, Pudding, Magnum-Glace, vier verschiedene Lindt-Tafeln.

Ein Katalog aus 273 **Gattungsbegriffen** kann das nicht abdecken, und ein
Katalog, der es abdecken könnte, wäre ein Produktverzeichnis mit
Zehntausenden Einträgen — genau das, was Open Food Facts ist und was für
Schweizer Eigenmarken lückenhaft bleibt.

### 2.2 Die Markenkürzel auf dem Bon kennt `normalizeName` nicht

Die Funktion entfernt „M-Classic" und „M-Budget". Der Bon schreibt aber
**`MClass`, `MBud`, `M-Clas`, `AdR`, `LT Excel.`, `YOU`** — Kürzel, die im
Regal nirgends stehen. Dazu Herstellermarken, die keine Handelsmarken sind
und deshalb bewusst nicht in der Liste stehen: Alnatura, Valflora,
Blévita, Leerdammer, Chiefs, Lindt.

Das ist billig zu beheben und verbessert vor allem den **angezeigten
Namen**. Die Trefferquote hebt es kaum, weil die Produkte ohnehin fehlen.

### 2.3 Der gefährlichste Befund: falsche Treffer sind schlimmer als keine

Sechs der 23 Zuordnungen sind sachlich falsch, und zwar auf eine Weise,
die unmittelbar schadet:

| Bonzeile | zugeordnet | Bewertung |
| --- | --- | --- |
| Tafeln Milch 5×100g | Milchdrink (0.56) | Schokolade als Milch — **6 Tage statt einem Jahr** |
| MBud Choc. Orange 70 % | Orange (0.46) | Schokolade als Zitrusfrucht |
| Lindt Excell Orange | Orange (0.51) | dito |
| LT Excel. Orange I. | Orange (0.47) | dito |
| Blévita Mais & Chia | Maisstärke (0.42) | Cracker als Backzutat |
| Bio Oliven Amphisis | Olivenöl (0.55) | Oliven als Öl |

Eine Schokoladentafel, die als Milch eingestuft wird, erzeugt in sechs
Tagen eine Ablaufwarnung für etwas, das ein Jahr hält. Nach zwei solchen
Warnungen glaubt niemand mehr den echten — und damit ist der Kern der
Anwendung entwertet.

**Die Schwelle von 0.30 in `matchProduct` ist für diesen Zweck zu niedrig.**
Sie ist richtig für eine Vorschlagsliste, in der ein Mensch auswählt. Sie
ist falsch für eine automatische Übernahme.

---

## 3. Was daraus folgt

### 3.1 Beim Bon ist die Kategorie das Ziel, nicht das Produkt

Die Zuordnung auf ein Katalog**produkt** ist bei echten Bonzeilen
aussichtslos. Die Zuordnung auf eine der **27 Kategorien** ist dagegen
einfach und zuverlässig: „LINDT NAPOLITAINS" gehört erkennbar zu
„Süsswaren, Snacks & Nüsse", auch wenn kein Katalogeintrag dafür existiert.

Und die Kategorie genügt für den eigentlichen Zweck: Das Auffangnetz aus
46 Kategorieregeln liefert eine Haltbarkeit. Genau dafür wurde es gebaut
(Konzept 4.3, letztes Glied vor der KI-Schätzung).

Für den Bon-Weg heisst das:

- Das Sprachmodell liefert pro Zeile **Name, Menge, Preis und Kategorie**.
  Die Kategorie kommt aus einer festen Liste von 27 — eine Auswahlaufgabe,
  keine Erfindung.
- Eine Produktzuordnung passiert nur zusätzlich und nur **oberhalb einer
  hohen Schwelle** (Vorschlag: 0.75). Darunter gilt die Kategorie.
- Ein neues haushaltseigenes Produkt entsteht auf Wunsch — dann trifft
  dieselbe Bonzeile beim nächsten Einkauf sofort. Das ist der Lernweg, den
  das Konzept in 4.3 vorsieht.

### 3.2 Die Schwelle für automatische Übernahme muss hoch sein

Zwei Schwellen statt einer:

- **≥ 0.75** — Zuordnung wird übernommen und vorangehakt.
- **0.30 bis 0.75** — als Vorschlag angezeigt, aber **nicht** vorangehakt;
  der Mensch entscheidet.
- **< 0.30** — keine Zuordnung, nur Kategorie.

Gemessen an den beiden Bons hätte das alle sechs falschen Treffer
abgefangen: der höchste davon liegt bei 0.56.

### 3.3 Der Katalog bleibt trotzdem richtig

Er ist nicht für den Bon gebaut, sondern für die **Schnelleingabe** — und
dort funktioniert er: „Vollmilch", „Butter", „Rüebli" trifft er sofort.
Die Messung entwertet ihn nicht, sie zeigt nur, dass Bon und Schnelleingabe
zwei verschiedene Aufgaben sind.

---

## 4. Nebenbefund: Migros und Coop bauen ihre Bons unterschiedlich

Beide Bons tragen Artikelname, Menge, Preis und Total. Der Unterschied
sitzt beim Gewicht:

| | Migros | Coop |
| --- | --- | --- |
| Spalten | Artikelbezeichnung, Menge, Preis, Gespart, Total, MWST | Artikel, Menge, Preis, Aktion, Total |
| Stückware | Menge × Preis = Total | Menge × (Aktion oder Preis) = Total |
| Gewichtsware | Menge zeigt **1**, Preis ist der **Kilopreis**, Total der Betrag | Menge zeigt das **echte Gewicht** (`0.315`) |

Für Migros heisst das: Wo `Menge × Preis ≠ Total`, handelt es sich um
Gewichtsware, und das Gewicht ist `Total ÷ Preis`. Beispiel vom Bon:
`MClass Serrano Rohsch. | 1 | 35.00 | 4.05` → 4.05 ÷ 35.00 = 116 g.

Eine Rabattzeile („Gespart") verfälscht diese Rechnung, weshalb sie
mitgelesen werden muss. Das Sprachmodell soll deshalb **beide Spalten**
liefern und die Ableitung in der Fachlogik passieren — dort ist sie
testbar.

### Und die QR-Frage ist beantwortet

Keiner der beiden Bons trägt einen QR- oder Strichcode mit Positionen.
Das bestätigt die Recherche: Die Schweiz hat keine Fiskalisierungspflicht
und damit keinen vorgeschriebenen Bon-Code. Der Weg über einen Code ist
damit endgültig erledigt — nicht als Vermutung, sondern nachgesehen.
