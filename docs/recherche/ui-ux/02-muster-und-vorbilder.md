# Marktvergleich: was funktioniert, was scheitert, und warum

Stand: 30.09.2026 · Grundlage für das UI/UX-Konzept yummytracker

---

## Wie dieses Dokument zu lesen ist

Die Recherche konnte nicht so laufen wie geplant. In der Arbeitsumgebung sind
alle allgemeinen Suchmaschinen hinter Bot-Prüfungen (DuckDuckGo, Startpage,
searx: Captcha · Bing: liefert grundsätzlich Leerseiten · Mojeek, Marginalia:
nicht erreichbar), Reddit ist vollständig gesperrt, und App Store wie Play Store
liefern nur JavaScript-Hüllen ohne Rezensionen. Erreichbar blieben die
HN-Algolia-Schnittstelle und die Wikipedia-API.

Deshalb ist **jede Aussage hier mit ihrer Sicherheitsstufe versehen:**

| Marke | Bedeutung |
| --- | --- |
| **[Beleg]** | Aus einer abgerufenen Quelle, mit Autor und Datum. Nachprüfbar. |
| **[Muster]** | Ein Interaktionsmuster, das ich beschreiben kann, weil es strukturell und über Jahre stabil ist. Die Beschreibung ist belastbar, das Urteil ist Argument, nicht Messung. |
| **[Behauptung]** | Tatsachenangabe aus dem Gedächtnis, Wissensstand Mai 2026, **nicht überprüft.** Vor einer Verwendung in der Semesterarbeit nachschlagen. |

Abschnitt 9 enthält die Prüfliste dazu.

> **Einschränkung zu den Zitaten:** Die HN-Kommentare wurden über eine
> Zusammenfassungsstufe abgerufen. Autor und Datum sind mitgeliefert, der
> Wortlaut kann verkürzt sein. Für die Semesterarbeit sind sie über die in
> Abschnitt 9 genannten Abfrage-Adressen im Original zu prüfen.

---

## 0. Der Befund, der alles andere ordnet

**Einkaufslisten-Apps sind erfolgreich. Vorrats-Apps sind es nicht.**

Bring!, AnyList, OurGroceries und Google Keep werden von Millionen Haushalten
täglich benutzt **[Behauptung]**. Eine Vorrats-App in vergleichbarer
Grössenordnung gibt es nicht — die bekanntesten (Grocy, NoWaste, Pantry Check)
bewegen sich um Grössenordnungen darunter **[Behauptung]**.

Das ist kein Marketingversagen. Es ist eine Aussage über die Aufgabe:

|  | Einkaufsliste | Vorrat |
| --- | --- | --- |
| **Anlass** | eingebaut: «mir fehlt etwas» | keiner — man müsste ihn sich selbst geben |
| **Nutzen** | sofort, im Laden, für mich | Wochen später, diffus, für den Haushalt |
| **Aufwand** | ein Wort aufschreiben | jede Bewegung buchen |
| **Was bei Nachlässigkeit passiert** | ein Posten fehlt, ärgerlich | die Daten stimmen nicht mehr, die App ist wertlos |

Die letzte Zeile ist die harte. Eine halb gepflegte Einkaufsliste ist noch
nützlich. Ein halb gepflegter Vorrat ist **schlimmer als keiner**, weil er
falsche Sicherheit gibt: Wer der App glaubt, dass noch Milch da ist, kauft keine.

Das Konzept hat das erkannt («Niemand pflegt einen Vorrat», Abschnitt 3.1). Die
Marktbeobachtung verschärft es aber: Das ist nicht eine gute Idee unter mehreren,
sondern **die einzige bekannte Überlebensbedingung für diese Gattung.** Jede
Entwurfsentscheidung ist daran zu messen, ob sie Pflege verlangt.

---

## 1. Die Belege

Diese Stimmen sind abgerufen, nicht erinnert. Sie stammen aus
Hacker-News-Kommentaren — also von einem technisch überdurchschnittlichen
Publikum. Das ist wichtig: **Wenn diese Leute aufgeben, ist die Aufgabe hart.**
Ein durchschnittlicher Haushalt hat weniger Geduld, nicht mehr.

### Warum Leute mit Grocy aufhören

> «Personally, I find that "keeping track of what you have" introduces a LOT of
> micro-management.»
> — horsawlarway, 2022-08-02 **[Beleg]**

> «I used to run Grocy and Firefly III quite intensively for a while, but Grocy's
> UI started annoying me too much.»
> — jeroenhd, 2022-05-04 **[Beleg]**

> «I've tried to get on with Grocy but its UI really put me off, it felt very
> unintuitive, cluttered.»
> — esskay, 2023-07-24 **[Beleg]**

> «Yeah I had a similar reaction to Grocy, just too much … Now it's just too
> stressful.»
> — dugite-code, 2023-07-25 **[Beleg]**

Vier unabhängige Stimmen, zwei verschiedene Ursachen: **Buchungslast** und
**Überladung der Oberfläche**. Bemerkenswert ist das Wort «stressful». Eine
Vorrats-App kann sich in eine Schuldmaschine verwandeln — eine Liste von Dingen,
die man versäumt hat nachzutragen.

### Wer es schafft, und womit

> Baute eine eigene Angular-Oberfläche auf Grocy mit Barcode-Lesern für schnelles
> Ausbuchen beim Verbrauch; führt damit den Haushaltsbestand erfolgreich, mit
> Beteiligung der Partnerin/des Partners.
> — larrybolt, 2024-07-05 **[Beleg]**

Der einzige gefundene Erfolgsbericht beschreibt jemanden, der sich **eine eigene
Oberfläche gebaut hat**, weil die mitgelieferte nicht schnell genug war. Das ist
kein Gegenbeweis, sondern eine Bestätigung: Die Erfassungsgeschwindigkeit war der
Unterschied zwischen Aufgeben und Durchhalten.

### Das vernichtendste Zitat

> «His 78 year old mother had 2 notepads attached to the fridge with a pencil on
> a string … I felt so stupid for the amount of effort I put.»
> — eddythompson80, 2026-02-15 **[Beleg]**

Jemand suchte jahrelang die perfekte Lösung, um den Vorrat zu führen und daraus
Einkaufslisten zu erzeugen. Gefunden hat er sie bei einer 78-Jährigen mit zwei
Blöcken und einem Bleistift an einer Schnur.

**Das ist der Massstab.** Nicht die andere App — der Zettel. Er ist immer da, hat
keine Ladezeit, keine Anmeldung, keine Synchronisierung, und jeder im Haushalt
kann ihn bedienen. Was yummytracker bietet und der Zettel nicht, muss diesen
Vorsprung überwiegen: Ablaufdaten, Erinnerung von selbst, Auswertung.

Was der Zettel besser kann und die App einholen muss: **null Reibung beim
Hinschreiben** und **jeder im Haushalt kann ihn ohne Erklärung bedienen.** Beides
trifft direkt auf die Vorgabe «gemischter Haushalt».

### Die Pflege-Falle, ausgesprochen

> «it hinges on me updating the ingredients I have in my pantry and I don't
> typically do this as it is manual and too time consuming.»
> — NiagaraThistle, 2022-08-02 **[Beleg]**

Jemand baute selbst einen Essensplaner mit Vorratsführung und benutzte ihn nicht,
weil der Vorrat von Hand aktuell gehalten werden müsste. **Der Autor der Software
war der Erste, der aufgab.**

### Was stattdessen funktioniert

> «Turns out the thing that actually works is a screen in the kitchen that
> everyone walks past.»
> — danialkhilji, 2026-09-02 **[Beleg]**

> «Google Keep makes for a super easy way to manage shopping lists … basically me
> or my wife can pull open the app, check a box.» — nach Ladenaufteilung geordnet.
> — refurb, 2020-08-13 **[Beleg]**

> Geteilte Todoist-Listen funktionieren «as a shopping list, not really a TODO
> app».
> — perlgeek, 2025-08-12 **[Beleg]**

Drei Muster: **Sichtbarkeit am Ort des Geschehens** · **eine einzige Interaktion
(Häkchen)** · **Einzweck schlägt Vielzweck.**

### Zum Barcode

> «How do you make it not miserable to get food purchase data into the app, given
> that food doesn't have an RFID tag.»
> — thebenedict, 2014-05-04 **[Beleg]**

> Ein Ablaufmodell, das dem echten Vorgang folgt — Vorrat → Einkaufsliste →
> Einkaufswagen → Vorrat —, mit Wischgesten statt Ziehen und automatischer
> Übernahme vom Wagen in den Vorrat, funktioniert gut.
> — jldugger, 2023-04-25 **[Beleg]**

Das zweite Zitat beschreibt fast wörtlich die Nutzungsschleife aus Konzept 3.1.
Eine unabhängige Bestätigung, dass der Grundriss stimmt.

### Zur Grössenordnung des Problems

> «an average person wastes 238 pounds of food per year … costing them $1,800 per
> year.»
> — searchableguy, 2020-07-29 **[Beleg]** (US-Zahlen, für die Schweiz nicht
> übertragbar — für die Semesterarbeit wäre die Erhebung des BAFU oder von
> foodwaste.ch die richtige Quelle)

---

## 2. Vorrats- und Ablauftracker im Einzelnen

### Grocy — die Vollständigkeitsfalle

**[Muster]** Grocy ist eine selbstgehostete Haushaltsverwaltung: Vorrat,
Einkaufsliste, Rezepte, Mengeneinheiten mit Umrechnung, Ablaufdaten, dazu
Hausarbeiten, Batterien und Wartungsgeräte. Fachlich beeindruckend vollständig.

Die Bedienung folgt einem Buchhaltungsmodell: Jede Bewegung ist eine Buchung.
«Purchase», «Consume», «Open», «Inventory correction». Wer eine Packung Milch
öffnet, soll das buchen.

**Was es gut macht:** Das Datenmodell ist durchdacht — getrennte Werte für
ungeöffnet und geöffnet, Mengenumrechnung, Chargen. Wer durchhält, hat perfekte
Daten. Der Barcode-Schnellverbrauch (Code scannen = eine Einheit ausbuchen) ist
die klügste Einzelidee: Er koppelt die Buchung an einen physischen Vorgang.

**Woran es scheitert:** An der Kopplung, die nie stattfindet. Niemand nimmt beim
Milcheinschenken das Handy in die Hand. Die vier Zitate oben sind das Ergebnis.
Dazu kommt die Überladung: Eine Oberfläche mit fünfzehn Menüpunkten, von denen
zwölf einen Haushalt nicht interessieren, macht die drei relevanten schwerer
auffindbar.

**Für yummytracker:** Grocy ist das **Gegenbeispiel, an dem sich der Entwurf
ausrichtet.** Die Nachfrage-statt-Pflege-Entscheidung (Konzept 4.2) ist die
direkte Antwort darauf, und sie ist richtig. Zu übernehmen wäre die Trennung
ungeöffnet/geöffnet — die hat das Konzept bereits. Nicht zu übernehmen ist alles
andere.

### NoWaste, Pantry Check, Fridgely, KitchenPal, Cozzo

**[Behauptung]** Diese Gruppe kenne ich nur oberflächlich, und ich kann weder
bestätigen, dass sie alle noch existieren, noch etwas über ihre Verbreitung
sagen. Was ich mit Vorbehalt berichten kann:

Sie sind fokussierter als Grocy — Ablaufdaten, Lagerorte, fertig. Die
wiederkehrende Schwäche ist das **Eintippen des Ablaufdatums pro Artikel**.
Genau dort liegt yummytrackers Vorsprung: Die Fallback-Kette mit 300
Haltbarkeitsregeln bedeutet, dass das Datum normalerweise vorgeschlagen und nur
bestätigt wird.

**Das ist der wichtigste Unterscheidungspunkt gegenüber dieser Gruppe und gehört
in die Semesterarbeit** — aber er ist ungeprüft. Vor einer Behauptung in der
Arbeit wären zwei, drei dieser Apps tatsächlich zu installieren und der Weg
«eine Milch erfassen» durchzuzählen. Das ist eine halbe Stunde Arbeit und macht
aus einer Vermutung einen Messwert.

### KitchenOwl

**[Behauptung]** Selbsthostbar, Flutter, deutlich modernere Oberfläche als
Grocy, mit Haushalts-Sharing. Beginnt als Einkaufsliste und wächst in den Vorrat
hinein — der umgekehrte Weg zu yummytracker.

**[Muster]** Diese Richtung ist bemerkenswert, weil sie dem Anlass folgt: Die
Einkaufsliste hat einen, der Vorrat nicht. Wer bei der Liste anfängt, hat die
Nutzer schon, bevor er sie um Vorratspflege bittet. Konzept 4.6 nutzt denselben
Hebel, baut die Liste aber erst in Stufe 3.

### USDA FoodKeeper

**[Muster]** Keine Tracker-App, sondern eine **gepflegte öffentliche
Haltbarkeits-Datenbank** mit einer App davor. Relevant als Beleg dafür, dass der
Startkatalog mit 254 Produkten und 300 Haltbarkeitsregeln der eigentliche
Vermögenswert des Projekts ist — nicht die Oberfläche. Für die Schweiz wäre
foodwaste.ch oder savefood.ch die Entsprechung **[Behauptung]**.

### Too Good To Go

**[Muster]** Anderes Geschäft (Marktplatz für Restposten), aber für die
Auswertung lehrreich: Die App zählt **gerettete** Mahlzeiten, nicht vermiedene
Verschwendung. Positiv gerahmt, sammelbar, teilbar. Siehe Abschnitt 6.

---

## 3. Bring! — der Massstab, den der Haushalt schon kennt

**[Muster]** Bring! ist eine Zürcher Einkaufslisten-App und im DACH-Raum der
Marktführer. Für dieses Projekt ist sie der wichtigste Vergleich, weil die
Mitglieder des Haushalts sie mit hoher Wahrscheinlichkeit bereits benutzen —
und die Erwartung mitbringen.

### Was sie richtig macht

1. **Kachelraster statt Textfeld.** Beim Hinzufügen erscheint kein Eingabefeld,
   sondern ein Raster aus Produktkacheln mit Illustration und Name, gruppiert
   nach Kategorie. **Ein Tap legt einen Posten auf die Liste. Kein Tippen.** Das
   ist die zentrale Entscheidung, und alles andere folgt daraus.
2. **Das Raster ordnet sich nach dem eigenen Verhalten.** Häufig Gekauftes
   wandert nach oben. Nach zwei Wochen stehen die zwölf Dinge, die dieser
   Haushalt immer kauft, auf dem ersten Bildschirm — ohne Scrollen.
3. **Illustrationen, keine Fotos.** In einem Zehntel einer Sekunde erkennbar,
   einheitlich im Stil, klein in der Datenmenge. Fotos wären uneinheitlich,
   schwer und rechtlich heikel.
4. **Teilen ohne Konto-Hürde.** Ein Link oder Code, und die zweite Person ist
   drin.
5. **Die Liste ist der ganze Bildschirm.** Keine konkurrierende Navigation.
6. **Abgehaktes verschwindet nicht, es wandert nach unten** in einen
   zusammengeklappten Bereich. Man sieht, was schon im Wagen liegt.

### Was sie schlecht macht

**[Behauptung]** Das Geschäftsmodell frisst die Klarheit: Werbekacheln,
Marken-Platzierungen und Rezeptvorschläge wandern in die Listenansicht. Mehrere
Bewertungsstimmen kritisieren das — verifizieren.

**[Muster]** Mengen sind schwach: Eine Kachel plus ein Textzusatz, keine
brauchbare Mengenführung. Für eine Einkaufsliste genügt das. Für einen Vorrat
nicht.

### Was übertragbar ist — und was nicht

Das Kachelraster ist **direkt auf das Erfassen übertragbar.** Der Startkatalog
hat 254 Produkte in 27 Kategorien; sortiert nach der Haushalts-Historie ist das
genau Bring!s Aufbau. Das ist der glaubwürdigste Weg unter zehn Sekunden.

**Der entscheidende Unterschied:** Bring! braucht nur den Namen. yummytracker
braucht zusätzlich Menge, Lagerort und Ablaufdatum. Ein Tap auf «Milch» legt bei
Bring! einen fertigen Posten an; bei yummytracker beginnt danach die eigentliche
Arbeit.

**Genau darin besteht die Entwurfsaufgabe:** Lagerort und Haltbarkeit kommen
bereits aus dem Katalog (`default_storage`, `shelf_life_rules`), die Menge ist
in der überwiegenden Zahl der Fälle «1 Stück». Es ist also möglich, dass ein Tap
auf die Kachel einen **vollständigen, korrigierbaren Eintrag** erzeugt — und der
Prüf-Schritt zu einer Liste wird, die man meistens ungelesen bestätigt.

Ob das mit Konzept 4.1 (ein Prüf-Schritt bei jedem Weg) vereinbar ist oder
dagegen verstösst, ist die wichtigste offene Frage des Entwurfs.

---

## 4. Schnelle Erfasser ausserhalb der Küche

Diese Apps haben mit Lebensmitteln nichts zu tun, lösen aber dieselbe Aufgabe:
etwas so beiläufig festhalten, dass es täglich geschieht.

### MyFitnessPal — der Verlauf schlägt den Katalog

**[Muster]** Der Barcode-Scan ist das Werbeversprechen, aber der eigentliche
Beschleuniger sind **«Recent», «Frequent» und «My Meals»**. Die überwiegende
Mehrheit der Einträge sind Wiederholungen der letzten Tage, und die stehen
vorne.

**Lehre:** Nicht der Katalog ist die Abkürzung, sondern die **Historie dieses
Haushalts**. Dieselbe Milch, dasselbe Brot, jede Woche. Die Datenbank hat das
schon — `inventory_items` mit `added_at` ist die Rangliste.

### Daylio — zwei Taps, und man macht es jahrelang

**[Muster]** Ein Stimmungs-Tagebuch, das auf zwei Taps reduziert ist: Stimmung
wählen, Tätigkeit wählen, fertig. Radikal wenig, und genau deshalb wird es
jahrelang täglich benutzt.

**Lehre:** Es gibt eine Schwelle, unterhalb derer man etwas sofort erledigt und
oberhalb derer man «später» denkt. «Später» heisst nie. Die Zehn-Sekunden-Vorgabe
des Konzepts zielt auf diese Schwelle — sie ist keine Bequemlichkeit, sondern die
Bedingung dafür, dass überhaupt Daten entstehen.

### Splitwise — Vorbelegung

**[Muster]** Betrag, Beschreibung, fertig. Die Aufteilung ist vorbelegt und wird
selten geändert. Der Trick ist nicht Geschwindigkeit beim Tippen, sondern dass
die meisten Felder **schon richtig sind**.

### Superhuman — die 100-Millisekunden-Regel

**[Beleg, indirekt]** Superhuman hat als Produktversprechen, dass jede
Interaktion in unter 100 ms antwortet; dafür wird das Postfach lokal
vorgehalten. **[Muster]** Die Folgerung für yummytracker: Der Server darf nicht
im kritischen Pfad einer Erfassung stehen. Eine optimistische Oberfläche —
sofort anzeigen, im Hintergrund speichern — ist kein Feinschliff, sondern der
Unterschied zwischen sieben und zwölf Sekunden.

---

## 5. Triage: die Nachfrage beantworten

### Anki — der Stapel und die Lawine

**[Muster]** Ankis Struktur ist yummytrackers Nachfrage, eins zu eins: eine
Karte, drei bis vier Antwortknöpfe, weiter zur nächsten.

**Was funktioniert:** Der Stapel hat ein Ende, und man sieht es («23
verbleibend»). Abarbeiten ist befriedigend, weil es abschliesst.

**Was scheitert:** Die **Lawine**. Zwei Wochen Pause, und es liegen 400 Karten
da. Das ist die bekannteste Abbruchursache bei Anki überhaupt, und sie ist
strukturell: Ein Rückstand, der nur wächst, führt zum Aufgeben, nicht zum
Aufholen.

**Direkte Folgerung für yummytracker:** Nach zwei Wochen Ferien darf «Nachfragen»
nicht vierzig Einträge zeigen. Das würde die App genau in dem Moment töten, in
dem sie am meisten leisten müsste. Es braucht eine Bündelungsregel — etwa: Was
seit mehr als einer Woche abgelaufen ist, wird zu **einer** Sammelfrage
zusammengezogen («Während deiner Abwesenheit sind 7 Artikel abgelaufen — alle
weggeworfen?»), mit der Möglichkeit, sie einzeln aufzuklappen.

**Das steht bisher nirgends im Konzept und ist eine echte Lücke.**

### Todoist — Verschieben ohne Schuldgefühl

**[Muster]** Das Aufschieben ist erstklassig gelöst: ein Tap, dann Vorschläge
(«morgen», «nächste Woche», «Wochenende»). Kein Datumswähler, kein Tadel.

**Direkte Folgerung:** Die dritte Antwort «noch da, Datum stimmt nicht» braucht
**Ein-Tap-Vorschläge** («+3 Tage», «+1 Woche»), keinen Kalender. Der heutige Code
öffnet einen `<input type="date">` — das ist eine Systemauswahl, mehrere Sekunden
und auf dem Handy eine ganze Bildschirmfläche.

### Wischen oder Knöpfe?

**[Muster]** Wischgesten sind für Geübte schneller und für alle anderen
unsichtbar. Es gibt keinen Hinweis darauf, dass man wischen könnte.

**Für einen gemischten Haushalt ist Wischen als einziger Weg damit
ausgeschlossen.** Als *zusätzlicher* Weg neben sichtbaren Knöpfen ist es
unproblematisch und für die tägliche Nutzerin ein Gewinn. Das Zitat von jldugger
(2023-04-25) lobt Wischen ausdrücklich — aber das ist ein
Hacker-News-Kommentator, nicht die Grossmutter mit dem Bleistift an der Schnur.

---

## 6. Wirkung zeigen, ohne zu beschämen

Die Auswertung ist der Wirkungsnachweis der Semesterarbeit. Sie ist zugleich
eine Zahl, die dem Haushalt sagt: Ihr habt Essen für 47 Franken weggeworfen.

### Drei Rahmungen derselben Information

**[Muster]**

| Beispiel | Rahmung | Wirkung |
| --- | --- | --- |
| Apple Bildschirmzeit | «Du warst 4 h 12 min am Handy» | Anklage ohne Handlungsmöglichkeit. Wird massenhaft ignoriert oder abgeschaltet. |
| YNAB | «Jeder Franken hat eine Aufgabe» | Einschränkung als Kontrolle umgedeutet. Starke Bindung. |
| Too Good To Go | «Du hast 12 Mahlzeiten gerettet» | Gerettet statt vermieden. Sammelbar, teilbar. |

Bildschirmzeit ist das Lehrstück: dieselbe Zahl, die eine Verhaltensänderung
auslösen sollte, löst Abwehr aus, weil sie nichts anbietet ausser dem Urteil.

### Der Vorschlag für yummytracker

Die Semesterarbeit braucht die Weggeworfen-Zahl. Der Haushalt braucht sie nicht
täglich vor der Nase. Beides ist erfüllbar, wenn der **Vordergrund dem Verhältnis
gehört, nicht dem Betrag:**

> Von 100 erfassten Artikeln wurden **94 gegessen.**

Dieselbe Datengrundlage, dieselbe Auswertbarkeit, aber sie beschämt nicht — und
sie wird besser, wenn man mehr erfasst, statt schlechter. Die absolute
Frankenzahl und die Aufschlüsselung nach Kategorie bleiben vollständig
verfügbar, eine Ebene tiefer.

**Gegenargument, das ernst zu nehmen ist:** Eine geschönte Darstellung
untergräbt den Zweck. Wenn die Arbeit belegen will, dass die App Verschwendung
senkt, darf die App die Verschwendung nicht verstecken. — **Entkräftung:** Das
Verhältnis versteckt nichts, es normiert. «94 von 100» ist strenger als «47
Franken», weil es nicht mit der Haushaltsgrösse mitwächst und über Monate
vergleichbar bleibt. Die absolute Zahl ist einen Tap entfernt.

### Anti-Muster, die hier nichts verloren haben

- **Serien («Streak»).** Erzeugen Verlustangst und brechen beim ersten
  Ferientag. In einem Vorratstracker zusätzlich absurd: Es gibt keinen Grund,
  jeden Tag etwas zu erfassen.
- **Inhaltslose Erinnerungen** («Schau mal wieder rein!»). Führen zur
  Abmeldung, und zwar endgültig.
- **Punkte, Abzeichen, Ranglisten** zwischen Haushaltsmitgliedern. Wer hat mehr
  weggeworfen — das ist eine Streitquelle, kein Anreiz.

---

## 7. Was das für yummytracker heisst

Acht Empfehlungen. Jede mit dem Gegenargument, weil ein Vorschlag ohne
Gegenargument nicht durchdacht ist.

### 7.1 Das Kachelraster wird der Haupterfassungsweg

**Empfehlung:** Statt eines Eingabefelds ein Raster aus Katalog-Kacheln,
sortiert nach der Historie dieses Haushalts, darunter erst das Suchfeld.

**Begründung:** Bring! belegt das Muster im selben Markt und bei denselben
Leuten. MyFitnessPal belegt, dass die Historie mehr trägt als der Katalog. Beides
zusammen ist der einzige glaubwürdige Weg unter zehn Sekunden.

**Gegenargument:** 254 Produkte brauchen 254 Illustrationen, die niemand hat.
— **Antwort:** Kacheln funktionieren auch ohne Bild, mit Name und
Kategoriefarbe. Bilder sind später nachrüstbar. Aber die Kachel ohne Bild ist
deutlich schwächer als Bring!s, und das ist ehrlich zu benennen.

### 7.2 Ein Tap erzeugt einen vollständigen Eintrag

**Empfehlung:** Tap auf die Kachel = Artikel im Vorrat, mit Menge 1, Lagerort aus
`default_storage` und Ablaufdatum aus der Haltbarkeitskette. Keine Rückfrage.

**Begründung:** Alle drei Angaben liegen bereits vor. Sie abzufragen, obwohl man
sie kennt, ist die Friktion, an der die Gattung stirbt.

**Gegenargument:** Das steht gegen Konzept 4.1 (ein Prüf-Schritt bei jedem Weg),
und dessen Begründung ist gut. — **Antwort:** Die Begründung von 4.1 gilt für
Wege, die *mehrere* Zeilen auf einmal erzeugen (Bon, Einkaufsliste, Barcode-Serie)
und deren Erkennung unsicher ist. Beim Tap auf eine Katalogkachel ist nichts
unsicher. **Das ist der Punkt, an dem das Konzept zu ändern wäre.**

### 7.3 Korrigieren statt bestätigen

**Empfehlung:** Nach dem Erfassen bleibt der Eintrag einige Sekunden als
korrigierbare Zeile am oberen Rand stehen: Menge ändern, Lagerort ändern, Datum
ändern, rückgängig.

**Begründung:** Verlagert die Prüfung von *vor* die Erfassung nach *danach*, wo
sie nichts kostet, weil man sie meistens nicht braucht. Das ist derselbe
Mechanismus wie Gmails «Rückgängig» beim Senden.

**Gegenargument:** Wer nicht hinschaut, bekommt falsche Daten. — **Antwort:**
Richtig, aber falsche Daten aus einer benutzten App sind mehr wert als korrekte
aus einer unbenutzten. Und die Nachfrage vor Ablauf korrigiert ohnehin nach.

### 7.4 Die Lawine muss gebändigt werden

**Empfehlung:** Was länger als eine Woche abgelaufen ist, wird zu einer einzigen
Sammelfrage gebündelt, aufklappbar. Die Nachfrage-Ansicht zeigt nie mehr als
etwa sieben Einzelfragen.

**Begründung:** Ankis bekannteste Abbruchursache. Der Rückstand nach Ferien ist
genau der Moment, in dem die App bewiese, wofür sie da ist — und genau der, in
dem sie gelöscht wird.

**Gegenargument:** Die Sammelantwort verfälscht die Auswertung, weil «alle
weggeworfen» pauschal ist. — **Antwort:** Zutreffend. Deshalb sollte die
Sammelantwort in `expiry_source`-Manier als pauschal gekennzeichnet und in der
Auswertung getrennt ausweisbar sein.

### 7.5 «Datum stimmt nicht» braucht keinen Kalender

**Empfehlung:** Drei Ein-Tap-Vorschläge («+3 Tage», «+1 Woche», «+1 Monat»),
Kalender nur als vierte Möglichkeit.

**Begründung:** Todoists Verschiebe-Muster. Der heutige `<input type="date">`
kostet auf dem Handy eine Systemauswahl und mehrere Sekunden.

**Gegenargument:** Bei einem abgelesenen Aufdruck will man das genaue Datum. —
**Antwort:** Dann nimmt man den Kalender. Der Normalfall ist aber die Schätzung,
die um ein paar Tage danebenlag.

### 7.6 Die zweite Person kommt über die Mail, nicht über die App

**Empfehlung:** Der Beitritt und die tägliche Nachfrage müssen vollständig ohne
App-Nutzung funktionieren. Wer nur auf Mail-Links tippt, ist ein vollwertiges
Mitglied.

**Begründung:** Vorgabe «gemischter Haushalt» plus die Beobachtung von
danialkhilji (2026-09-02), dass Sichtbarkeit am Ort des Geschehens mehr bewirkt
als Benachrichtigungen. Die Mail ist die niedrigste erreichbare Hürde: keine
Installation, kein Konto, kein Erklärbedarf.

**Gegenargument:** Ein-Klick-Links in Mails werden von Mail-Programmen teils
selbst abgerufen (Virenscanner, Vorschaubild-Dienste), was Aktionen auslösen
kann, ohne dass jemand geklickt hat. — **Antwort:** Das ist ein echtes und
bekanntes Problem, es war einer der Punkte des ausgefallenen Rechercheauftrags,
und es ist **ungeklärt**. Die übliche Gegenmassnahme ist eine
Zwischenbestätigungsseite («Willst du "Milch" als weggeworfen buchen?» mit einem
Knopf), die den Vorteil des einen Klicks halbiert. Das ist vor Stufe 2 zu klären
und gehört in die Risikoliste.

### 7.7 Die Auswertung führt mit dem Verhältnis

**Empfehlung:** «94 von 100 Artikeln gegessen» im Vordergrund, Franken und
Kategorien eine Ebene tiefer.

**Begründung und Gegenargument:** siehe Abschnitt 6.

### 7.8 Der Zettel bleibt der Massstab

**Empfehlung:** Jede Entwurfsentscheidung gegen die Frage prüfen: *Ist das
schneller und zuverlässiger als zwei Blöcke am Kühlschrank mit einem Bleistift
an der Schnur?* Wo die Antwort nein ist, gehört die Funktion nicht in die App.

**Begründung:** eddythompson80, 2026-02-15. Der Zettel hat null Ladezeit, keine
Anmeldung, keine Synchronisierung und wird von jedem im Haushalt bedient.

**Gegenargument:** Das schreibt einen zu engen Massstab fest; manche
Funktionen (Auswertung, Erinnerung) hat der Zettel gar nicht. — **Antwort:**
Genau deshalb ist die Frage nützlich. Sie trennt das, was die App *besser* macht
(erinnern, auswerten, teilen), von dem, was sie nur *anders* macht.

---

## 8. Was wir bewusst nicht übernehmen

| Muster | Wo es vorkommt | Warum nicht |
| --- | --- | --- |
| Buchen jeder Bewegung | Grocy | Die belegte Hauptabbruchursache dieser Gattung |
| Vollständigkeit als Ziel | Grocy | «Now it's just too stressful» (dugite-code, 2023-07-25) |
| Werbung in der Arbeitsfläche | Bring! | Frisst genau die Klarheit, die das Muster ausmacht |
| Serien und Abzeichen | Duolingo u. a. | Verlustangst, bricht bei Ferien, hier ohne Sinn |
| Wischen als einziger Weg | viele Triage-Apps | Unsichtbar; unvereinbar mit «gemischter Haushalt» |
| Rangliste zwischen Mitgliedern | Gamification allgemein | «Wer hat mehr weggeworfen» ist eine Streitquelle |
| Absolute Schuldzahl im Vordergrund | Apple Bildschirmzeit | Anklage ohne Handlungsmöglichkeit |

---

## 9. Prüfliste für die Semesterarbeit

Alles unter **[Behauptung]** ist vor der Verwendung zu prüfen. Die lohnendsten
Punkte, nach Aufwand geordnet:

### Eine halbe Stunde, grosser Gewinn

1. **Zwei, drei Vorratstracker installieren und «eine Milch erfassen»
   durchzählen.** Taps, Tippeingaben, Sekunden. Macht aus Abschnitt 2 eine
   Messung. Das ist der wertvollste einzelne Prüfschritt.
2. **Bring! öffnen und dasselbe für «Milch auf die Liste» tun.** Der Vergleich
   der beiden Zahlen ist das stärkste Argument der ganzen Arbeit.

### Nachzuschlagen

| Behauptung | Wo prüfen |
| --- | --- |
| Verbreitung Bring! vs. Vorratstracker | `bring.app` Presseseite; Play-Store-Installationszahlen |
| Bring! Werbung in der Liste | Aktuelle Store-Rezensionen, beide Plattformen |
| Status von NoWaste, Pantry Check, Fridgely, KitchenPal, Cozzo | App Store / Play Store: letztes Update, Bewertung |
| KitchenOwl Funktionsumfang | `github.com/TomBursch/kitchenowl` |
| Grocy Funktionsumfang | `grocy.info`, `github.com/grocy/grocy` |
| FoodKeeper als Datenquelle | `foodsafety.gov/keep-food-safe/foodkeeper-app` |
| Schweizer Foodwaste-Zahlen (statt der US-Zahl) | BAFU; `foodwaste.ch`; `savefood.ch` |
| Link-Vorabruf durch Mail-Programme | Eigene Recherche nötig — **vor Stufe 2**, siehe 7.6 |

### Die HN-Belege im Original

Die Zitate in Abschnitt 1 stammen aus diesen Abfragen und sind dort im
Volltext nachlesbar:

```
https://hn.algolia.com/api/v1/search?query=grocy&tags=comment
https://hn.algolia.com/api/v1/search?query=pantry%20inventory%20app&tags=comment
https://hn.algolia.com/api/v1/search?query=shared%20shopping%20list%20app%20household&tags=comment
https://hn.algolia.com/api/v1/search?query=barcode%20scan%20groceries%20inventory&tags=comment
https://hn.algolia.com/api/v1/search?query=%22food%20waste%22%20household%20reduce&tags=comment
```

Lesbar auch über `hn.algolia.com` mit derselben Suchanfrage.

---

## 10. Die drei Sätze, auf die es ankommt

1. **Eine halb gepflegte Vorratsliste ist schlimmer als keine**, weil sie
   falsche Sicherheit gibt. Das ist der Grund, warum diese Gattung kaum
   Erfolgsfälle kennt — und warum «Nachfrage statt Pflege» nicht eine gute Idee
   unter mehreren ist, sondern die Überlebensbedingung.
2. **Der Massstab ist nicht die Konkurrenz-App, sondern der Zettel am
   Kühlschrank.** Er hat null Reibung und wird von jedem bedient. Was die App
   dem entgegensetzt, muss erinnern, auswerten und teilen — Dinge, die der Zettel
   nicht kann.
3. **Bring! hat den Erfassungsweg gelöst, den yummytracker braucht**, und der
   Haushalt kennt ihn bereits. Der Unterschied ist, dass ein Vorratseintrag mehr
   als einen Namen braucht — aber Lagerort und Haltbarkeit stehen schon im
   Katalog. Ein Tap kann genügen. Das zu Ende zu denken ist die eigentliche
   Entwurfsaufgabe.
