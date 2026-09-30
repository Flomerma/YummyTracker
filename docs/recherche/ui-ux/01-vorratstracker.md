# Marktvergleich: Vorrats- und Ablauftracker
Stand: 30.09.2026 · Recherche für das UI/UX-Konzept yummytracker

**Hinweis zur Recherche:** Allgemeine Suchmaschinen (Google, Bing, DuckDuckGo, Mojeek, Brave, Ecosia, Startpage) und Reddit (reddit.com, old.reddit.com, auch über die Wayback Machine) waren in der Recherche-Umgebung durchgehend technisch blockiert (Captcha, HTTP 403/429, TLS-Fehler) - über mehrere unabhängige Rechercheläufe hinweg konsistent bestätigt. Reddit-O-Töne, wie im Auftrag gewünscht, konnten deshalb für keine der Apps beschafft werden; das ist eine echte Lücke, keine unterlassene Suche. Als Ersatz dienten: Apples offizielle iTunes-Search/Lookup-API und ihr Kundenrezensions-RSS-Feed (liefert echte, datierte, wörtliche Rezensionen), Google-Play-Suchergebnisseiten, Trustpilot, GitHub (Issues/Releases/Discussions/API), Hacker News (Algolia-API), das Home-Assistant-Community-Forum, Wikipedia, Companies House (UK-Handelsregister) und Herstellerwebsites. Wo eine Angabe trotz Recherche nicht verifizierbar war, steht das explizit im Text statt einer Vermutung.

## Überblick

| App | Plattform | Stand | Bewertung | Modell | Kerngedanke |
|---|---|---|---|---|---|
| NoWaste | iOS/Android/Web | aktiv, Update 30.9.2026 | iOS ~4,1★ (751+ Bew., US), Android 2,75★/275 | gratis + Abo 6.99 USD/Jahr | Barcode/Bon/KI-Erfassung, Ringe zeigen Ablaufnähe |
| Kitche | iOS/Android | **eingestellt** Feb./Mär. 2025 (von Remy übernommen) | Android 3,7★/~70 (vor Delisting) | war gratis | Vier Erfassungswege, aber nur Pauschal-Timer statt echtem Datum |
| Fridgely | iOS/Android (3 unabh. Apps) | alle 2026 neu, 0-1 Bewertungen | nicht aussagekräftig | gratis/Freemium | Name mehrfach vergeben, keine der drei mit Substanz |
| Pantry Check | iOS (+ neu Android) | aktiv, seit Mitte 2025 verlangsamt | iOS 4,51★/1'566 | gratis bis 200 Artikel, dann Abo | Barcode-Scan mit Crowd-Fotodatenbank |
| KitchenPal | iOS/Android/Web | aktiv, Update 9/2026 | iOS 4,48★/646, Android 4,6★/6'570 | gratis + Abo/Lifetime | Scan + Nutri-Score, Bestand→Liste→Rezept |
| Pantry Chef | iOS/Android (Cluster) | mehrere Kleinstapps 2024-2026 | 0-2 Bewertungen je App | gratis/kleine Einmalkäufe | Reine Rezept-Generatoren, kein Bestand |
| Cozzo | nicht auffindbar | - | - | - | über mehrere Kanäle nicht identifizierbar |
| Nosh | Android (1 relevante App) | gelistet, dünn belegt | 3,2★/185 | vermutlich gratis | Name stark mehrdeutig (7+ fremde Apps teilen ihn) |
| MyFridgeFood | iOS/Android | seit 2/2023 kein Update | iOS 3,23★/69 | gratis | Reiner Rezeptfinder, kein Ablaufdatum-Konzept |
| Prepear | iOS/Android | sehr aktiv, Update 30.9.2026 | iOS 4,40★/503, Android 3,8★/1'080 | gratis+Werbung / Abo ~120 USD/Jahr | Menüplaner, explizit kein Pantry-Feature |
| Grocy | Self-hosted Web/PWA | sehr aktiv (Release alle 1-2 Mte.) | keine Store-Note, GitHub ~9'500 Stars | gratis/Spenden | Umfassendstes Haushalts-Bestandssystem ("Haushalts-ERP") |
| Tandoor Recipes | Self-hosted Web | sehr aktiv | GitHub ~8'600 Stars | gratis/Sponsoring | Rezeptmanager mit 6 Monate altem, rudimentärem Pantry |
| KitchenOwl | Self-hosted + eigene Apps | aktiv, "Public Alpha" | App Store 5,0★ (n=5) | gratis/Sponsoring | Schlanke Liste, Bestandstracking bewusst abgelehnt |
| Samsung Food (ex-Whisk) | iOS/Android | aktiv (nur Wartung) | iOS 4,78★/6'377, Android 4,6★/23'000 | gratis + "Food+"-Abo | Rezeptplattform, Pantry nur in Bezahlstufe |
| Jow | iOS/Android | sehr aktiv | FR 4,81★/46'942, Android 3,4★/19'200 | gratis (Handelspartnerschaften) | Menüplanung → Warenkorb, kein Bestandsbezug |
| OLIO | iOS/Android | sehr aktiv | iOS UK 4,88★/74'446, Android 4,1★/50'200 | gratis | Nachbarschafts-Marktplatz für Lebensmittelüberschuss |
| Too Good To Go | iOS/Android | sehr aktiv | Store ~4,9★ (diverse Länder), Trustpilot 3,6★/115'683 | gratis (Tüte kostet ~1/3) | Restposten-Marktplatz mit hartem Abholfenster |
| USDA FoodKeeper | iOS/Android | seit 2023 kein Update, oft technisch defekt | iOS 2,31★/115 | gratis | Reine Haltbarkeits-Nachschlagedatenbank |
| Zu gut für die Tonne! | Website + App (BMLEH) | aktiv, Update 7/2026 | iOS 4,48★/1'682 | gratis | Reste-Rezepte + Haltbarkeits-Lexikon, kein Tracking |
| Beste Reste | nicht auffindbar | - | - | - | vermutlich nur ein Kochbuchtitel, kein digitales Angebot |

## Die Apps im Einzelnen

### NoWaste

iOS/Android/Web · seit 2014, dänisches Ein-Personen-Team (KH Creations ApS) · aktiv, Update heute · iOS US 4,16★/751, UK 4,14★/354, CH 4,11★/101, DE 3,96★/257, Android 2,75★/275 (auffällige iOS/Android-Kluft) · gratis + "Pro"-Abo 6.99 USD/Jahr (historisch Einmalkauf, Umstellung sorgte für Ärger.

**Was sie ist:** der langlebigste und mit Abstand ausführlichste kommerzielle Vorratstracker im Feld - Barcode, Bon, Foto und ein neuer KI-Assistent führen alle in dieselbe Bestandsliste. **Erfassen:** Liste wählen → Scanner → Barcode scannen → bei fehlendem Treffer Name selbst eintippen → Ablaufdatum defaultet standardmässig auf das **heutige** Datum und muss pro Artikel einzeln korrigiert werden → Menge/Kategorie/Ort → «add all» für den ganzen Stapel. Der beworbene "in seconds"-Anspruch wird dadurch regelmässig verfehlt. **Dringlichkeit:** Ringe pro Artikelkarte zeigen die Nähe zum Ablauf, Sortierung nach Datum/Name/Kategorie, Push-Erinnerungen (nur Pro). **Abgang:** rein manuell löschen/bearbeiten, keine Rückfrage, nichts verschwindet automatisch. **Gut:** flexibles Datenmodell (mehrere Lagerorte, Verpackung, Gewicht), kompakte Ring-Anzeige, elf Jahre Durchhalten als Solo-Projekt. **Scheitert an:** Datenverlust ist das dominante Muster - «I spent a fair amount of time creating an inventory, only to have the app unexpectedly crash and lose all of the data» (1★, 2020); das Datum-Default macht die Erfassung mühsam - «Every time I scan an item the app displays the expiration date as today's date. […] I am told they are all expired» (1★, 2019); Mehrbenutzer-Sync zerstört Fremddaten - «My wife purchased this app for us to use to track inventory […] we tried to setup the user for sharing and import her list, that deleted everything she had spent hours working on» (1★, 2020); Push-Erinnerungen funktionieren häufig nicht - «Without notifications, this app is worthless to me» (1★, 2020). Selbst zufriedene Langzeitnutzer räumen das Grundproblem der Kategorie ein: «it obviously only works if you keep it up to date!» (5★, 2026). **Übertragbar:** keine der Rezensionen erwähnt eine aktive Rückfrage der App - genau diese Lücke lässt NoWaste trotz elf Jahren Marktpräsenz offen.

### Kitche (eingestellt)

iOS/Android (kein Web) · UK, Kitche Limited, gegründet 2018, Launch 2019 · **eingestellt**: Übernahme durch das Startup Remy, Februar 2025; The Grocer (5.3.2025): «The Kitche brand will cease to exist in the UK, and the app has been retired»; Kitche Limited steht im Handelsregister vor der Löschung · Android 3,7★/~70 Bewertungen (vor Delisting) · war komplett gratis.

**Was sie ist:** ein Lehrstück über eine bewusste Vereinfachung, die zum eigenen Untergang beiträgt. **Erfassen:** «+»-Button → Barcode **oder** Kassenbon-Foto **oder** Spracheingabe mehrerer Artikel am Stück («say banana and apple and bread») **oder** Textliste → automatische Kategorisierung mit Näherungspreis; vom Einkaufszettel per Wischgeste direkt in den Bestand («At home»). Vier parallele, schnelle Wege - aber: Kitche erfasste **keine echten Ablaufdaten**, sondern nur eine pauschale Erinnerung nach Produktkategorie (Frischware z. B. fünf Tage nach Kauf). **Dringlichkeit:** gelbe Uhr ab 48 Stunden vor dem Reminder-Datum, rote Uhr danach - simpler als jede Farbskala im Feld. **Abgang:** aktives «ditch»-Melden für die eigene Verschwendungsstatistik, aber keine echte Rückfrage. **Gut:** die Zwei-Listen-Logik (Einkaufsliste → Wisch → Bestand) und die Uhr-Symbolik sind bewährte, direkt übertragbare Muster; ein neunmonatiger Feldversuch mit einer Supermarktkette auf Jersey zeigte bei App-Nutzenden 2,6 % Lebensmittelverschwendung gegenüber rund 16 % im nationalen Schnitt. **Scheitert an:** weil es keine echten Ablaufdaten gab, lagen die Warnungen oft daneben - Vertrauen erodierte, bis der eigene Käufer den Kernmechanismus als Wachstumshindernis benannte: Remy-Co-CEO Jake Blaisdell (The Grocer, 9.4.2025) begründete den Ersatz des Bon-Scans durch eine direkte Kontoanbindung damit, dass «household food management apps typically require users to take a photo of a receipt, and correct any anomalies» - genau das nennt er «a major barrier to engagement». Dazu kollidiert der Name mit «Kitchen»/«Kitsch» (Auffindbarkeitsproblem), und die Entwicklung war schon 2023 praktisch eingeschlafen. **Übertragbar:** das Zwei-Listen-Modell mit Wischgeste beim Auspacken ist fast identisch mit yummytrackers Konzept - ein Beleg, dass es funktioniert. Die Kehrseite ist die eigentliche Lehre: Wer beim Ablaufdatum abkürzt, verliert Vertrauen, sobald eine Warnung spürbar falsch liegt. yummytrackers Rückfrage «Datum stimmt nicht» ist die richtige Antwort auf exakt das Problem, das Kitches eigener Käufer als Haupthindernis benannte.

### Pantry Check

iOS (+ inzwischen Android) · Sunroom Labs LLC (San Francisco), seit 2015 · aktiv, aber seit Mitte 2025 sichtbar verlangsamt (letztes Update 6/2025) · iOS 4,51★/1'566 · gratis bis 200 Artikel, danach Abo (rund 12 USD/Jahr für 2'000 Artikel), kein Einmalkauf.

**Was sie ist:** ein Barcode-first-Tracker mit grosser, crowdgesourcter Foto-Produktdatenbank. **Erfassen:** Scan-Icon → Kamera → Barcode scannen (hörbares «Boop», Produkt erscheint mit Foto in einer wachsenden Batch-Liste, Duplikate zählen als Menge) → pro Artikel «Set Expiration» → einmal «Add to Inventory» für den ganzen Stapel; unbekannte Barcodes per Foto + manuellem Namen. **Dringlichkeit:** Start-Tab ist nach **Kategorien** gruppiert, nicht nach Dringlichkeit; Farbbalken pro Karte, ein eigener «Expiring»-Tab, Push-Benachrichtigungen. **Abgang:** drei Buttons «Spoil» / «Restock» / «Finish» plus Verbrauchs-Schieberegler - rein manuell, keine Rückfrage. **Gut:** schneller, zuverlässiger Scan mit echten Produktfotos; frei benennbare, granulare Lagerorte; bei einem Teil der Fälle aussergewöhnlich schneller persönlicher Support. **Scheitert an:** kein Undo - «there is no 'undo' button for inventory or shopping lists. I am constantly erasing entries by accident» (3★, 2022); kein Mehrgeräte-Sync, der Kernbefund für yummytracker - «it does not sync with multiple devices. […] if one person in the house updates the app to remove an item, the other person still sees it in inventory. […] so much frustration and makes it almost pointless. We have since started using another app that does sync» (4★, 2021); starre Kategorien als über Jahre meistgenannter Punkt - «I REALLY want to set my own categories» (3★, 2026); unvorhersehbare Auto-Einkaufsliste ohne Schwellenwert - «it just seems like a tool that gets in your way instead of solving the problem» (1★, 2023); Account-Lockout ohne Support-Zugang (1★, 2026). **Übertragbar:** der Sync-Fehler zwischen Haushaltsmitgliedern ist die exakte Fallgrube, die yummytrackers Kernversprechen (gemeinsamer Bestand) treffen würde, wenn Echtzeit-Konsistenz nicht hart getestet wird.

### KitchenPal

iOS/Android/Web (einzige der drei mit echter Web-Version) · iCuisto Pte. Ltd. · aktiv, Update 9/2026 · iOS 4,48★/646, Android 4,6★/6'570 (grössere Basis) · gratis + Premium 3.99 USD/Monat, 14.99/Jahr, 29.99 Einzelperson lebenslang, 39.99 «Family Lifetime».

**Was sie ist:** ein Scan-first-Tracker mit Nutri-Score-Anzeige und enger Verzahnung von Bestand, Einkaufsliste und Rezeptvorschlägen. **Erfassen:** Barcode scannen → «1 match found» mit Name/Marke/Nutri-Score-Badge → Menge/Einheit setzen (dokumentierter Schwachpunkt: oft nur Gewichtseinheiten, keine Stückzahl - «I can't add 4 chicken breasts, I can only add how many ounces», 2★, 2026) → Ablaufdatum (teils nur grobe Zeiträume statt freiem Datum) → Lagerort. Alternative Sprach-/Texteingabe ist laut aktuellen Rezensionen verbuggt. **Dringlichkeit:** «expiry date tracker» mit Alerts, sortierbar nach Ablaufdatum, separater «running low»-Status. **Abgang:** Löschen eines Artikels kann automatisch einen Einkaufslisten-Eintrag erzeugen - aber keine aktive Rückfrage. **Gut:** echte iOS/Android/Web-Parität, nachweislich alltagstauglich für gemischte Haushalte («it works great on my iPhone and on my husband's android!», 5★); enge Bestand→Liste→Rezept-Kopplung; durchgehend über Jahre gelobter, schneller Support. **Scheitert an:** Bezahlschranke **nach** bereits investierter Erfassungszeit - «Catalogued my entire food stock and then discovered I needed to pay for a subscription to continue. […] wouldn't have spent so much time […] had I known» (1★, 2024), von anderen explizit als «predatory» bezeichnet; Mehrpersonenpflege als Überforderung - «The problem is when there is more than one person and having to monitor quantities […] It is just way too much work. I haven't figured out a good way to best utilize it» (3★, 2024); fehlerhafte KI-Rezeptzuordnung («it associates things like ketchup as a cheese ingredient», 1★, 2026); kein Offline-Betrieb im Laden; Serverausfälle («server issues 75% of the time», 2★, 2024). **Übertragbar:** Limits/Paywalls müssen **vor** der Zeitinvestition transparent sein; das Zitat von TN4UK bestätigt direkt yummytrackers Grundthese, dass manuelle Mehrpersonenpflege scheitert.

### MyFridgeFood

iOS/Android · reiner Rezeptfinder, **kein** Ablaufdatum-Konzept · seit 2021, letztes Update 2/2023 (seit 3,5 Jahren stillgelegt), Android-Paket nutzt das veraltete PhoneGap/Cordova-Framework · iOS 3,23★/69, Android 3,0★ · gratis.

**Was sie ist:** die Frage «was koche ich mit dem, was ich habe» reduziert auf reines Ankreuzen aus einer festen Zutatenliste - kein Bestand, keine Mengen, keine Daten. **Erfassen:** Zutatenliste öffnen → Zutat suchen → ankreuzen → «Find Recipes». **Dringlichkeit/Abgang:** nicht anwendbar. **Gut:** sehr niedrige Eintrittsschwelle für die eine Frage, kostenlos, laut Eigenangabe grosse Community (unverifiziert, «over 2 million community members»). **Scheitert an:** die Kernfunktion Speichern ist oft schlicht kaputt - «App doesn't save your ingredients even after making an account. Useless» (1★, 2025); Account/Login über Jahre wiederholt komplett defekt (mehrere 1★-Rezensionen 2024/2025); die feste Zutatenliste hat Lücken bei Alltagsprodukten - «Hard to use when basic ingredients are missing (tofu, lentils)» (2★, 2024), ähnlich zu fehlenden Kartoffeln, Karotten, Alfredo-Sauce (2021-2023); Rezepte passen nicht zu den ausgewählten Zutaten - das Kernversprechen bricht («I did the example of bacon and avocado and nothing pulled», 1★, 2024); Nutzer bemerken den Stillstand selbst - «seit einem Jahr kein Update mehr» (3★, 2024). **Übertragbar:** eine geschlossene Produktliste ohne Freitext-Fallback frustriert sofort, sobald ein Alltagsprodukt fehlt - yummytrackers geplanter Freitext-Fallback in der Einkaufsliste ist hier bestätigt richtig, und Vertrauen erodiert extrem schnell, wenn die simpelste Grundfunktion (Speichern) unzuverlässig ist.

### Prepear

iOS/Android · Rezept-Organizer, Menüplaner, Einkaufsliste - **keine** Pantry-Funktion · seit 2017, sehr aktiv (Update heute) · iOS 4,40★/503, Android 3,8★/1'080 (100K+ Installationen) · gratis mit Werbung + «Prepear Gold»-Abo (laut Nutzerangabe rund 120 USD/Jahr, nicht offiziell bestätigt).

**Was sie ist:** kein Vorratstracker, sondern der nächstgelegene Vergleichsfall für ein Rezept-/Menüplanungswerkzeug, das nie eine Bestandsseite bekommen hat. **Ablauf:** Rezept speichern/importieren → Cookbook zuordnen → im Kalender einplanen → Portionen anpassen → automatische Einkaufsliste. **Dringlichkeit/Abgang:** nicht anwendbar. **Gut:** Rezept-Import von beliebigen Webseiten plus automatische, mengenberechnete Einkaufsliste wird über Jahre konsistent gelobt; grosszügiger Gratis-Kern sorgte historisch für hohe Bindung. **Scheitert an:** bezahlte Funktionen nach Abo-Kauf teils nicht erreichbar - «none of the features are accessible» (1★, 2026); Kündigung wiederholt erschwert; Datenverlust nach Updates - «Buggy-update Lost my recipes and meal plans» (1★, 2026); die App wirkt zunehmend unbetreut - «no longer being maintained» (2★, 2026); selbst jahrelang treue Nutzer kippen - «I've used this app for years—why is it crashing???» (1★, 2025). Eine im Auftrag vermutete Kontroverse um ein Pinterest-ähnliches Birnen-Logo liess sich trotz mehrerer Versuche **nicht verifizieren** (aus dem Gedächtnis, nicht überprüft) - in 50 gesichteten Rezensionen kommt sie kein einziges Mal vor; die tatsächlichen Abbruchgründe sind Zuverlässigkeit und Paywall, nicht eine Logo-Geschichte. **Übertragbar:** ein gutes Gratisprodukt langsam hinter eine Paywall zu schieben, während gleichzeitig Zuverlässigkeit sinkt, zerstört das Vertrauen der loyalsten Nutzer - für ein täglich genutztes Haushaltstool zählt technische Verlässlichkeit mehr als Feature-Breite.

### Grocy

Self-hosted Web/PWA (PHP/SQLite, MIT-Lizenz), keine offizielle Mobile-App (nur Community-App) · sehr aktiv, Release im Schnitt alle 1-2 Monate, aktuell v4.7.1 (4.9.2026) · keine Store-Note; GitHub ~9'500 Stars, Docker-Pulls ca. 58 Mio. (Image linuxserver/grocy) - mit weitem Abstand die grösste Verbreitung der drei Self-Hosted-Tools · gratis/Open-Source, freiwillige Spenden.

**Was sie ist:** die funktional umfassendste Lösung im ganzen Feld - Vorrat, Barcode mit Open-Food-Facts-Abgleich, Ablaufdaten, Mahlzeitenplan, Chores, Batterien. Grocy nennt sich selbst treffend «ERP beyond your fridge». **Erfassen:** ein Produkt muss zuerst einmalig als «Master Data» angelegt werden (Name, Einheit, Lagerort); danach über «Purchase»: Produkt wählen/Barcode scannen → Menge → Einheit → Ablaufdatum (Pflichtfeld, mit Tastatur-Shortcuts für schnelle Datumsverschiebung) → optional Preis/Laden/Lagerort. Jede EAN-Nummer braucht einen eigenen Produkteintrag. **Dringlichkeit:** Bestandsliste mit Status «expired / overdue / due soon / below min. stock / in stock», filterbar - listenbasiert, kein Dashboard-Badge. **Abgang:** ausschliesslich aktiv über «Consume» (mit Sonderoptionen wie «Spoiled», «Mark as opened»), «Transfer» und «Inventory»-Korrektur; kein automatisches Verschwinden, keine aktive Nachfrage. **Gut:** grösstes Funktionspaket aus einer Hand, Barcode-first mit echten Produktivitäts-Kniffen, elf Jahre aktive Community. **Scheitert an:** das mit Abstand aussagekräftigste Einzelergebnis der ganzen Recherche - GitHub-Issue #156 «Mail/Pushbullet/Telegram notifications», offen seit dem **28. Februar 2019**, bis heute (September 2026, über **sieben Jahre**) unbeantwortet. Grocy hat nie eine proaktive Erinnerung gebaut und bleibt rein «pull-basiert» - man muss aktiv nachschauen. Dazu die hohe Einstiegslast: «Grocy macht am Anfang eine Menge Arbeit, denn es ist am Anfang komplett leer […] Man tippt sich also erst mal einen Wolf» (deutschsprachiger Erfahrungsbericht, nerd-o-mania.de). Aus dem Home-Assistant-Forum (2019): die Partnerin eines Nutzers fand die visuell aufgehübschte Oberfläche reizvoller als er selbst («she is more exited for this, than me») - ein Hinweis, dass die rohe Web-Oberfläche selbst ein Reibungspunkt ist, das Konzept aber bei Laien ankommen kann, wenn die Bedienung freundlicher ist. **Übertragbar:** der sieben Jahre alte, unbeantwortete Wunsch nach proaktiven Erinnerungen ist die stärkste externe Bestätigung für yummytrackers Kern-Feature (tägliche Mail statt Selbst-Nachschauen) - selbst die technisch versierteste Nutzerschaft im ganzen Feld wartet seit Jahren genau darauf.

### Tandoor Recipes

Self-hosted Web (Django/Vue), keine offizielle Mobile-App (inoffizielle Community-App «kitshn» ohne Pantry-Funktion) · sehr aktiv, mehrere Releases pro Monat, aktuell v2.6.15 (7.9.2026) · GitHub ~8'600 Stars, Docker-Pulls ca. 13,8 Mio. · gratis für Selbsthoster (AGPLv3 mit Commons Clause), Finanzierung über GitHub Sponsors.

**Was sie ist:** in erster Linie ein Rezeptmanager mit Menüplanung; ein Vorrats-Feature («Pantry») existiert erst seit Release v2.6.0 vom **26. März 2026** - zum Zeitpunkt dieser Recherche also gut sechs Monate alt. **Erfassen:** der genaue Klick-Ablauf liess sich nicht rekonstruieren (die Doku enthält noch keinen Pantry-Artikel); aus einem GitHub-Issue (#4701, 15.6.2026) direkt zitiert: «Management of items in pantry is very manual» - kein automatisches Angebot beim Abhaken der Einkaufsliste, kein Barcode. **Dringlichkeit:** Sortierung nach Ablaufdatum war erst seit Juni 2026 überhaupt möglich (Issue #4708). **Abgang:** nur manuelles Buchen «in, out and inbetween» konfigurierten Lagerorten; ein Issue namens «Grocy integration» ist seit **2020** offen - die Community wollte lange lieber eine Brücke zu Grocy als ein eigenes Pantry. **Gut:** sehr aktiv entwickelt mit klarer Release-Kommunikation, ausgereifter Rezept-/Menüplanungskern, öffentliche Live-Demo mit Auto-Login als echte Onboarding-Erleichterung. **Scheitert an:** «very manual» aus der eigenen Nutzerschaft direkt nach Launch; Release 2.6.0 war zugleich ein Breaking Change - «previously shared items are no longer shared/visible. Please create a household for each group of space members that should share this data» (offizielle Release Notes) - bestehende Mehrpersonen-Installationen verloren über Nacht die gemeinsame Sichtbarkeit ihrer Daten, bis ein Admin händisch neue Haushalte anlegte. **Übertragbar:** ein Lehrstück dafür, wie schwer sich Bestandstracking nachträglich an ein Tool anflanschen lässt, das nicht dafür gebaut wurde - yummytrackers Verzahnung von Einkauf und Bestand von Anfang an ist der richtige Ansatz; die Breaking-Change-Migration zeigt zusätzlich, wie zerbrechlich gemeinsame Sichtbarkeit für nicht-technische Mitnutzende wirkt, wenn sie sich unangekündigt ändert.

### KitchenOwl

Self-hosted (Flask/Flutter) **plus** echte offizielle native Apps vom selben Team (iOS, Android, Web/Desktop) - einzige der drei Self-Hosted-Lösungen mit dieser Plattformparität · aktiv, monatlich/zweimonatlich, aktuell v0.7.10 (26.7.2026), bezeichnet sich selbst als «Public Alpha» · GitHub ~3'700 Stars (kleinste der drei), Docker-Pulls ca. 1,65 Mio., App Store 5,0★ bei nur 5 Bewertungen · gratis (AGPLv3), GitHub Sponsors.

**Was sie ist:** eine bewusst schlanke Kombination aus Einkaufsliste, Rezepten, Menüplan und Ausgabenteilung. **Zentraler Befund:** KitchenOwl hat **kein** Ablaufdatum-Bestandstracking - über vier unabhängige Quellen bestätigt (Website, README, F-Droid-Beschreibung, zehn Release-Changelogs ohne einen einzigen Treffer für «expiry/stock/inventory/pantry»). Es gibt also keinen «Artikel mit Ablaufdatum erfassen»-Fluss zu beschreiben; man kann Artikel nur der Einkaufsliste hinzufügen. **Dringlichkeit/Abgang:** nicht anwendbar - das Feature existiert nicht. **Gut:** einzige echte Plattformparität mit offiziellen Apps aus einer Hand, modernes UI, Echtzeit-Mehrbenutzer-Sync von Anfang an mitgedacht. **Scheitert an:** Bestandstracking wird seit **9. Februar 2022** wiederholt gewünscht (Issue #10); der Maintainer hat einen entsprechenden Vorschlag 2024 explizit als «Not planned» geschlossen (Issue #517); im März 2026 kamen zwei weitere, bis heute offene Anfragen dazu (#1032, #1040) - die Nachfrage ist seit über vier Jahren real und bewusst unbeantwortet. **Übertragbar:** der Maintainer des mobil-nativsten und am «leichtesten» wirkenden der drei Tools hat echtes Ablaufdatum-Tracking mehrfach bewusst abgelehnt - ein Hinweis, dass «einfach bedienbar» und «echtes Ablaufdatum-Tracking» bislang als Zielkonflikt gelten, den keines der drei Self-Hosted-Tools aufgelöst hat. Der Kontrast zu allen dreien (die durchgehend Docker-Kenntnisse und Eigenadministration voraussetzen) ist zugleich der beste Beleg dafür, dass yummytrackers Zielgruppe - gehostet, kein Setup - strukturell eine andere ist.

### Samsung Food (ehemals Whisk)

iOS/Android · Herausgeber laut Store «Foodient Ltd» / Samsung · aktiv, aber nur Wartungsupdates (11.5.2026: «Bug fixes and UI improvements») · iOS 4,78★/6'377, Android 4,6★/23'000, 1 Mio.+ Installationen · gratis + «Samsung Food+»-Abo. *(Die Whisk-Gründung und Samsung-Übernahme 2019 liessen sich in dieser Sitzung nicht verifizieren - aus dem Gedächtnis, nicht überprüft.)*

**Kein Vorratstracker im engeren Sinn**, sondern eine Rezept-/Meal-Planning-Plattform (240'000 Rezepte, automatische Einkaufsliste aus Wochenplan, 23 angebundene Händler). Echte Bestandsverwaltung («Automated pantry management with personalized cooking suggestions») existiert nur in der Bezahlstufe - Bedienung und Dringlichkeitsanzeige dahinter waren nicht einsehbar. Auffällig: für eine Samsung-Marke ungewöhnlich wenige Bewertungen (6'377 gegenüber 250'000+ bei vergleichbaren Rezept-Apps). **Übertragbar:** dass selbst Samsung echte Bestandspflege als KI-Bezahl-Zusatzfeature statt als Kernfunktion behandelt, bestätigt yummytrackers These, dass Bestandspflege nur beiläufig funktioniert, nie als eigene Aufgabe.

### Jow

iOS/Android · Frankreich · sehr aktiv, Update heute · FR 4,81★/46'942, CH 4,78★/78 (deutlich geringere Verbreitung in der Schweiz), Android 3,4★/19'200 (5 Mio.+ Installationen, auffällige iOS/Android-Diskrepanz) · gratis, finanziert über Handelspartnerschaften (Carrefour, Auchan, Monoprix u. a.).

**Kein Bestandsbezug:** kurze Erstbefragung (Haushalt/Geschmack) → Rezeptvorschläge → Auswahl → ein Klick erzeugt einen fertigen, mengenberechneten Warenkorb → optionale Bestellung. Trustpilot 4,4★/394 (überwiegend positiv, u. a. «Superbe application gain de temps énorme», 5★, 2026; vereinzelt harte Kritik, «This app is a scam and a classic bait-and-switch», 1★, 2025). **Übertragbar:** die kurze Erstbefragung als Onboarding-Vorbild; die «1-Klick»-Ungeduld als Referenz für yummytrackers 10-Sekunden-Ziel.

### OLIO

iOS/Android · UK, seit 2015, rund 7 Mio. Nutzer (Stand Mai 2023) · sehr aktiv, Update heute · iOS UK 4,88★/74'446, Android 4,1★/50'200 · gratis mit In-App-Käufen.

Kein Vorratstracker, sondern ein Nachbarschafts-Marktplatz für überschüssige Lebensmittel: Foto + kurze Beschreibung veröffentlichen → Anfragen im Chat → Abholung vereinbaren → als abgeholt markieren; dazu ein Gamification-Programm («Food Waste Hero»). Haltbarkeitsangaben stammen allein von der anbietenden Person, keine Systemschätzung. **Scheitert an** (Trustpilot 4,1★/2'577): vor allem am Kaltstart-Problem ausserhalb der UK-Kernmärkte - «Not a single listing in the whole state or WA or OR??» (2★, 2026), «Needs ambassadors, it's useless right now in my area» (1★, 2026) - sowie an Unzuverlässigkeit bei Partnerläden. **Übertragbar:** das Kaltstart-/Netzwerkeffekt-Problem ist eine direkte Parallele zu yummytrackers Anforderung «mindestens 2 aktive Haushaltsmitglieder» - ein System ohne kritische Mitmach-Masse wirkt schnell nutzlos, aktives Ansprechen eines unteraktiven Haushalts wäre sinnvoller als stilles Verkümmern.

### Too Good To Go

iOS/Android · Dänemark, seit 2015, aktiv in 17+ Ländern · sehr aktiv, Update gestern/heute · Store-Bewertungen sehr hoch (CH 4,89★/120'907, UK 4,91★/656'007, DE 4,89★/475'995), aber Trustpilot nur 3,6★/115'683 · gratis, Tüte kostet für Konsumierende rund ein Drittel des Originalwerts.

Marktplatz für Restposten aus Geschäften/Gastronomie: Karte durchstöbern → Tüte kaufen (Inhalt bewusst unbekannt) → Direktzahlung → Abholung in einem engen, verbindlichen Zeitfenster (typischerweise 30-60 Minuten, keine Rückerstattung bei Verpassen). Genau dieses harte Zeitfenster erzeugt strukturell Dringlichkeit. **Scheitert an** (Trustpilot): häufigste Beschwerde ist Enttäuschung über Wert/Inhalt der Überraschung trotz expliziter Rahmenbedingungen - «The amount I receive is nearly the same as if I had paid full price» (2★, 2026) - sowie kurzfristige Stornos durch die Betriebe («the retailer cancels the order 20 minutes before pick up», 1★, 2026). **Übertragbar:** ein hartes, kurzes Zeitfenster mit klarer Konsequenz erzeugt zuverlässig Dringlichkeit; die grosse Lücke zwischen Store- und Trustpilot-Bewertung zeigt, dass Zufriedenheit direkt nach der Kernhandlung nicht dasselbe ist wie Zufriedenheit mit dem Gesamtsystem.

### USDA FoodKeeper

iOS/Android · US-Bundesbehörde (FSIS) · seit 2023 nicht aktualisiert, laut aktuellen Rezensionen seit Ende 2025 grösstenteils technisch defekt · iOS 2,31★/115 · gratis.

Reine Nachschlage-App, kein Bestandstracker: Lebensmittel suchen → Richtwerte für Kühl-/Gefrier-/Vorratsschrank, teils getrennt nach ungeöffnet/geöffnet. Struktur «Kategorie × Lagerort × geöffnet/ungeöffnet → Zeitspanne» ist ein direkt wiederverwendbares Datenmodell. **Scheitert an:** technischem Verfall ohne Wartung - «You can't search anything useful…. AT ALL!» (1★, 2026), «Usta work. Not anymore» (1★, 2025). **Übertragbar:** das Datenmodell ist übernehmbar; der Verfall bestätigt zugleich yummytrackers Ansatz, Haltbarkeit direkt in den Erfassungsprozess einzubauen statt als separates Nachschlagewerk, das erfahrungsgemäss niemand pflegt - auch nicht der Betreiber selbst.

### Zu gut für die Tonne!

Website + App · Kampagne des deutschen Ministeriums, aktuell als BMLEH statt vormals BMEL geführt (Ministeriumsumbenennung, Zeitpunkt nicht verifiziert) · aktiv, Update 7/2026, wirbt für eine «Aktionswoche 2026» · iOS 4,48★/1'682, Android 3,5★ · gratis.

Kein Tracking-Tool, sondern Reste-Rezepte plus ein Haltbarkeits-Lexikon («Lebensmittel A-Z»). Kritik bewegt sich auf Verbesserungs-, nicht auf Abbruchniveau (fehlende vegane Zutaten, kleine Klickflächen, repetitive Rezepte). **Übertragbar:** Ton und Machart der Reste-Rezeptvorschläge liessen sich direkt in yummytrackers Ablauf-Erinnerungsmail integrieren («Diese Zutat läuft bald ab - hier ein Rezeptvorschlag dafür»), was ohnehin als Stufe 7 im Konzept vorgesehen ist.

### Ohne Substanz oder nicht auffindbar: Fridgely, Cozzo, Nosh, Pantry Chef, Beste Reste

**Fridgely** existiert nicht als eine etablierte App, sondern als drei unabhängige Kleinstprojekte aus 2026 (zwei iOS-Apps mit 0 bzw. 1 Bewertung, eine Android-App ohne sichtbare Bewertung), ohne Presse, ohne Product-Hunt-Eintrag, ohne Google-News-Treffer. Ein Angebot bewirbt reinen Kamera-Scan ganz ohne Barcode/Tippen - ein unbelegtes Marketingversprechen, das als Idee (radikalste denkbare Antwort auf das Erfassungsproblem) trotzdem notiert werden sollte.

**Cozzo** liess sich trotz mehrfacher unabhängiger Prüfung (iTunes US/DE, Google Play, Domain-Check) nicht auffinden. Ob Verwechslung, extreme Nische ausserhalb aller geprüften Kanäle oder falsch überlieferter Name - bleibt offen; es wird hier bewusst nichts erfunden.

**Nosh** ist ein stark mehrdeutiger Name: mindestens sieben unabhängige Apps (Fintech, KI-Foodscanner, Kochroboter-Steuerung, Restaurant-Finder, Lieferdienste) teilen ihn. Der einzige echte Treffer als Vorratstracker, «nosh - Reduce food waste» (nur Android), liegt bei 3,2★/185 Bewertungen bei 10'000+ Installationen - eine unterdurchschnittliche Note bei dünner Bewertungsbasis, ohne dass sich Rezensionstexte beschaffen liessen.

**Pantry Chef** existiert nur als Cluster kleiner, unabhängiger Rezept-aus-Zutaten-Generatoren (0-2 Bewertungen je App), keine mit persistenter Bestandsführung. Der Befund selbst ist die Lehre: «aus dem Vorrat kochen» als eigenständiges Produkt ohne Bestandsführung ist offenbar kein tragfähiges Alleinstellungsmerkmal - bei Pantry Check und KitchenPal wird Rezeptintegration dagegen wiederholt als gewünschte *Zusatz*funktion zu einer bestehenden Bestandsführung genannt.

**Beste Reste** liess sich als eigenständige App, Website oder Kampagne nicht bestätigen; der einzige thematisch passende Treffer ist ein Kochbuchtitel («Beste Reste – 40 Promis kochen mit den Resten aus ihrem Kühlschrank»). Da allgemeine Suchmaschinen blockiert waren, ist das ein Ergebnis dieser eingeschränkten Recherche, kein endgültiger Beweis der Nichtexistenz.

## Was die Rezensionen durchgängig sagen

Über alle zwanzig geprüften Angebote hinweg wiederholen sich dieselben Muster, unabhängig davon, ob die App kommerziell, selbst gehostet oder eine Kampagne ist:

1. **Keine einzige Konkurrenz-App stellt eine aktive Rückfrage beim Ablauf.** NoWaste, Pantry Check, KitchenPal, Grocy und Tandoor verlassen sich durchgehend auf passive Anzeigen oder Erinnerungen, nie auf ein «hast du das gegessen?».

   *Zur Genauigkeit dieses Befunds:* Die Aussage «keine der geprüften Apps fragt aktiv nach» beruht auf der Auswertung von Store-Beschreibungen, Screenshots, Rezensionen und Doku der zwanzig Angebote — sie ist damit gut gestützt, aber nicht formal bewiesen (eine unsichtbare Funktion lässt sich nicht ausschliessen). Separat und härter belegt ist der schwächere, dafür sichere Teilbefund: **Grocy hat in über sieben Jahren überhaupt keine proaktive Benachrichtigung gebaut.** Ausgabe [#156 «Mail/Pushbullet/Telegram notifications»](https://github.com/grocy/grocy/issues/156) ist am 28.02.2019 eröffnet worden, am 30.09.2026 noch offen, zuletzt am 28.07.2025 bearbeitet, mit 16 Kommentaren und 4 Reaktionen (über die GitHub-API geprüft). Die Ausgabe verlangt Benachrichtigungen *überhaupt*, nicht speziell eine Rückfrage — das funktional umfassendste Werkzeug im Feld bleibt also rein «pull-basiert». Für die Semesterarbeit ist diese engere Formulierung zu verwenden.
2. **Das Ablaufdatum ist der eigentliche Erfassungs-Engpass, nicht der Produktname.** NoWaste defaultet auf «heute» und erzwingt eine Korrektur pro Artikel, Kitche verzichtete ganz auf echte Daten und verlor dadurch Vertrauen, Grocy macht es zum manuellen Pflichtfeld.
3. **Mehrbenutzer-Synchronisation ist die häufigste technische Bruchstelle**, sobald ein zweites Haushaltsmitglied dazukommt (Pantry Check: «so much frustration»; NoWaste: Partnerdaten beim Sharing-Setup gelöscht; Tandoor: Breaking-Change-Migration verlor über Nacht die gemeinsame Sichtbarkeit).
4. **Datenverlust nach Updates oder Abstürzen ist der grösste Einzel-Vertrauensbruch** - und trifft am härtesten, wenn zuvor viel Zeit in die Ersterfassung floss (NoWaste mehrfach, Prepear, MyFridgeFood).
5. **Starre, geschlossene Kategorien oder Produktlisten ohne Freitext-Fallback** sind ein über Jahre wiederkehrender Dauerkritikpunkt (Pantry Check, KitchenPal, MyFridgeFood).
6. **Bezahlschranken, die erst nach bereits investierter Ersterfassungszeit sichtbar werden**, erzeugen besonders bittere Reaktionen bis hin zum Vorwurf «predatory» (KitchenPal, NoWaste-Abo-Umstellung).
7. **Reine Nachschlage-Werkzeuge ohne Bezug zum eigenen, aktuellen Bestand verkommen technisch** - USDA FoodKeeper ist seit Jahren kaputt, ohne dass es jemanden zu stören scheint, der es reparieren müsste.
8. **Bestandstracking lässt sich schwer nachträglich an ein Rezept-/Einkaufslisten-Tool anflanschen** (Tandoor: «very manual» sechs Monate nach Launch) oder wird bewusst ausgelassen (KitchenOwl: mehrfach «Not planned»). Kein einziges «Rezept-zuerst»-Tool im Feld hat ein ausgereiftes Bestandstracking.
9. **Der Markt ist übersättigt mit gleichnamigen Kleinstprojekten ohne Traktion** (Fridgely dreifach, Cozzo, der Pantry-Chef-Cluster, die Nosh-Verwechslungen) - viele Versuche, kaum Überlebende mit nennenswerter Nutzerbasis.
10. **Store-Bewertungen sind systematisch positiver als unabhängige Bewertungsplattformen** - Too Good To Go liegt im Store bei rund 4,9★, auf Trustpilot nur bei 3,6★. Store-Ratings allein sind kein verlässliches Zufriedenheitsmass.

## Übertragbar auf yummytracker

### 1. Haltbarkeit vorschlagen statt einfordern
**Empfehlung:** Ein Ablaufdatum immer mit einem plausiblen, vorausgefüllten Vorschlag anbieten, der mit einem Tap bestätigt wird - nie ein leeres Pflichtfeld und nie ein Default auf das heutige Datum.
**Begründung:** NoWastes Default auf «heute» ist der meistgenannte Einzelfrust in dessen Rezensionen; Kitches gegenteiliger Fehler (gar kein echtes Datum) kostete ebenso Vertrauen. Die im Konzept bereits vorgesehene Fallback-Kette (Abschnitt 4.3) trifft damit genau die Mitte zwischen beiden gescheiterten Extremen.
**Gegenargument:** Ein falscher, unhinterfragter Vorschlag kann ebenso Vertrauen kosten wie gar kein Datum - die Korrektur-Rückfrage muss beim ersten Fehlversuch schon leichtgängig sein, sonst wiederholt sich Kitches Fehler nur in anderer Form.

### 2. Aktive Rückfrage vor Ablauf beibehalten
**Empfehlung:** An der bereits getroffenen Konzeptentscheidung (4.2) festhalten: kurz vor Ablauf aktiv fragen statt nur anzuzeigen.
**Begründung:** Keine der zwanzig untersuchten Apps tut das; Grocy-Nutzer wünschen es sich seit 2019 unbeantwortet. Das ist eine real belegte, seit Jahren offene Marktlücke.
**Gegenargument:** Eine tägliche Frage kann selbst zur Last werden, wenn sie zu oft kommt oder auf einer geschätzten statt abgelesenen Haltbarkeit beruht - Frequenz und Formulierung müssen dosiert bleiben, sonst droht dieselbe Ermüdung wie bei NoWastes kaputten Push-Benachrichtigungen.

### 3. Mehrbenutzer-Synchronisation beim Erfassen hart testen
**Empfehlung:** Nicht nur die Einkaufsliste (die laut Konzept 7.7 bereits als Echtzeit-Fall behandelt wird), sondern auch den Vorrat selbst unter echten Zwei-Personen-Bedingungen testen.
**Begründung:** Pantry Check, NoWaste und Tandoor zeigen unabhängig voneinander, dass genau diese Stelle am häufigsten bricht - und yummytracker braucht laut eigenem Erfolgskriterium mindestens zwei aktive Mitglieder.
**Gegenargument:** Vollständige Konfliktfreiheit bei gleichzeitiger Offline-Bearbeitung ist aufwändig; das Konzept begrenzt Offline-Fähigkeit bereits bewusst auf die Einkaufsliste (7.7). Dieser Verzicht bleibt richtig, darf aber nicht stillschweigend auch für den Online-Fall beim Vorrat gelten.

### 4. Kategorien und Produktliste nie als Zwang
**Empfehlung:** Jede Kategorisierung bleibt Vorschlag, nie Voraussetzung; Freitext ist immer ein gültiger Erfassungsweg.
**Begründung:** «I REALLY want to set my own categories» ist über Jahre der meistgenannte Punkt bei Pantry Check und KitchenPal; MyFridgeFood verlor Nutzer sofort, wenn simple Alltagsprodukte in der festen Liste fehlten.
**Gegenargument:** Freitext ohne jede Struktur erschwert Auswertung und die Haltbarkeits-Fallback-Kette, die auf Kategorien aufbaut (4.3) - die im Konzept bereits gewählte Lösung (Freitext erlaubt, Kategorie optional nachträglich zuordenbar) bleibt ein Kompromiss, der gepflegt werden muss.

### 5. E-Mail statt Push beibehalten
**Empfehlung:** Bei der Konzeptentscheidung (4.4) bleiben - tägliche Mail statt Push im MVP.
**Begründung:** NoWaste-Nutzer beklagen über Jahre, dass Push-Erinnerungen nicht ankommen oder Einstellungen nicht gespeichert werden («Without notifications, this app is worthless to me»). E-Mail-Zustellung ist technisch robuster und besser prüfbar.
**Gegenargument:** E-Mail wird leichter übersehen oder landet im Spam, wenn sie denn zuverlässig ankäme - der Vorteil gilt nur, solange die eigene Zustellung (Absenderreputation, Betreffzeile) tatsächlich sauber funktioniert.

### 6. Ersteinrichtung ohne Konfigurationsschritt vor dem ersten Artikel
**Empfehlung:** Der geplante Startkatalog (Abschnitt 14) muss den ersten Artikel ohne vorherige Einheiten-/Lagerort-/Kategorie-Konfiguration ermöglichen.
**Begründung:** Grocys «man tippt sich erst mal einen Wolf» und die Pflicht, vor dem ersten Artikel Master Data anzulegen, ist die meistgenannte Einstiegshürde bei den Self-Hosted-Tools - unvereinbar mit dem 10-Sekunden-Ziel.
**Gegenargument:** Ein zu grosser, starrer vorausgefüllter Katalog kann selbst zur Last werden, wenn er nicht zum eigenen Haushalt passt (MyFridgeFood-Fehler). Der Katalog muss als Vorschlag/Fallback wirken, nicht als Zwangsstruktur - das entspricht der ohnehin geplanten Fallback-Kette.

### 7. Dringlichkeit mit einem einzigen klaren Signal zeigen
**Empfehlung:** Ein einfaches, sofort lesbares visuelles Muster (wie Kitches Gelb/Rot-Uhr oder NoWastes Ring) statt mehrerer konkurrierender Signale (Farbbalken plus Badge plus separater Tab, wie bei Pantry Check).
**Begründung:** Kitches simple Uhr-Symbolik wird in den Quellen positiv hervorgehoben; Pantry Checks Kombination aus Kategorien-Startansicht, Farbbalken und separatem «Expiring»-Tab verteilt die Aufmerksamkeit, statt sie zu fokussieren.
**Gegenargument:** Ein einzelnes Signal kann bei grossen Beständen an Ausdruckskraft verlieren (z. B. wenn zu viele Artikel gleichzeitig «dringend» sind) - die geplante Sortierung nach Dringlichkeit statt Alphabet (3.3) fängt das ab, sollte aber mit wachsendem Bestand beobachtet werden.

### 8. Keine nachträgliche Bezahlschranke oder Limitierung
**Empfehlung:** Kein Limit einbauen, das erst nach bereits investierter Ersterfassungszeit sichtbar wird - als Leitplanke auch über die Semesterarbeit hinaus festhalten.
**Begründung:** KitchenPal-Nutzer, die ihren gesamten Bestand erfasst hatten, bevor die Paywall erschien, empfanden das explizit als «predatory»; ähnliche Wut löste NoWastes Wechsel von Einmalkauf zu Abo aus.
**Gegenargument:** Für die Semesterarbeit ohne Geschäftsmodell aktuell nicht relevant - trotzdem wichtig für Abschnitt 13 (Ausblick), falls yummytracker je über den eigenen Haushalt hinauswachsen sollte.

## Was wir bewusst NICHT übernehmen sollten

- **Pauschale Erinnerungen statt echter Ablaufdaten** (Kitches Fehler): spart Erfassungszeit, aber sobald eine Warnung spürbar falsch liegt, ist das Vertrauen weg. yummytracker braucht echte, pro Artikel nachvollziehbare Daten - genau deshalb existiert die Fallback-Kette und die «Datum stimmt nicht»-Rückfrage.
- **Ein «Alles-in-einem»-Versprechen ohne stabilen Kern** (der Cozzo-/Nosh-/Pantry-Chef-Cluster, aber auch die dünn belegte «nosh - Reduce food waste»-App mit «inventory + expiry + shopping + recipe + waste» in einer Zeile): Breite ohne verlässlichen Kern-Workflow erzeugt bestenfalls eine mittelmässige, kaum genutzte App.
- **Eine geschlossene Produktliste als einziger Erfassungsweg** (MyFridgeFood): jedes fehlende Alltagsprodukt ist ein sofortiger Vertrauensbruch, gerade weil die App sonst nichts anderes anzubieten hat.
- **Rezeptvorschläge als Kernversprechen, bevor der Bestands-Kern trägt** (Prepear, Jow, Samsung Food, der Pantry-Chef-Cluster): Das bestätigt die im Konzept bereits getroffene Reihenfolge - Verwerte-Vorschlag ist Stufe 7, nicht Stufe 1.
- **Eine reine Nachschlage-Funktion ohne Bezug zum eigenen, aktuellen Bestand als eigenständiges Feature** (USDA FoodKeeper): solche Tools werden erfahrungsgemäss von niemandem gepflegt, auch nicht vom Betreiber selbst. Haltbarkeitsdaten gehören in den Erfassungsfluss, nicht in ein separates Nachschlagewerk.
- **Eine zweitrangig behandelte zweite Zugriffsart** (NoWaste: iOS 4,1★ gegenüber Android 2,75★; Jow: iOS 4,8★ gegenüber Android 3,4★): Wer eine Plattform vernachlässigt, beschädigt das Versprechen gemeinsamer Nutzung genau dort, wo Haushalte gemischt ausgestattet sind. Für yummytracker als reine Web-App stellt sich das Problem strukturell nicht - ein zusätzlicher Grund, weshalb Web-first hier nicht nur pragmatisch, sondern auch strategisch richtig ist.

## Quellen

Allgemeine Suchmaschinen und Reddit waren durchgehend blockiert (siehe Hinweis zu Beginn dieses Dokuments); alle folgenden Angaben stammen aus tatsächlich abgerufenen Quellen vom 30.09.2026, sofern nicht anders vermerkt.

**NoWaste:** itunes.apple.com Search/Lookup-API (Storefronts US/GB/CH/DE) und Kundenrezensions-RSS-Feed (id=926211004); play.google.com/store/apps/details?id=com.khcreations.nowaste; apkcombo.com (Installationszahlen); nowasteapp.com.

**Kitche:** kitche.co (Tutorial-/Produkt-/Impact-Seiten); itunes.apple.com Lookup id=1521215203 (Delisting bestätigt, null Treffer); play.google.com …com.rstit.kitche (HTTP 404, Delisting bestätigt); apkcombo.com (letzte Version/Bewertung vor Delisting); Tech.eu, 17.02.2025 (Übernahme durch Remy); The Grocer, 05.03.2025, 09.04.2025, 23.01.2023, 03.05.2024; find-and-update.company-information.service.gov.uk (Companies House, Firmenstatus); linkedin.com/company/kitche.

**Fridgely:** itunes.apple.com Search/Lookup (mehrere IDs); play.google.com Suche und Entwicklerseiten; news.google.com/rss (keine Treffer); producthunt.com (keine Treffer); fridgely.app (HTTP 404).

**Pantry Check:** apps.apple.com/id966702368; itunes.apple.com Kundenrezensions-RSS-Feed (mostRecent/mostHelpful); pantrycheck.com; App-Store-Screenshots (visuell ausgewertet); play.google.com Suche.

**KitchenPal:** apps.apple.com/id1084982489; itunes.apple.com Kundenrezensions-RSS-Feed; kitchenpalapp.com; play.google.com Suche (Paket fr.icuisto.icuisto); App-Store-Screenshots.

**Pantry Chef:** itunes.apple.com Search/Lookup (mehrere unabhängige App-IDs); play.google.com Suche (com.rm.pantry_chef); alternativeto.net (keine Nutzerkommentare/404).

**Cozzo:** itunes.apple.com Search (US/DE, kein Treffer); play.google.com Suche (kein Treffer); cozzoapp.com (DNS-Fehler).

**Nosh:** itunes.apple.com Search (7 unabhängige Apps identifiziert); play.google.com Suche; nosh.app (parkierte Fremd-Domain).

**MyFridgeFood:** itunes.apple.com Lookup (bundleId com.myfridgefood.app) und Kundenrezensions-RSS-Feed (28 Rezensionen 2021-2026); myfridgefood.com; play.google.com Suche.

**Prepear:** itunes.apple.com Lookup (com.prepear.ios, inkl. Release Notes) und Kundenrezensions-RSS-Feed (50 Rezensionen 2021-2026); prepear.com; play.google.com Suche; en.wikipedia.org (Prüfung Pinterest-Kontroverse: kein Treffer/404, daher unverifiziert).

**Grocy:** github.com/grocy/grocy und api.github.com/repos/grocy/grocy/releases; grocy.info inkl. Live-Demo (demo.grocy.info); Issues #156 (Notifications, seit 2019), #2882, #2851; f-droid.org und play.google.com (Community-App); hub.docker.com (Pull-Zahlen); nerd-o-mania.de (deutschsprachiger Erfahrungsbericht); community.home-assistant.io (Forumsthread, Nutzerzitate); Hacker-News-Diskussion via Algolia-API.

**Tandoor Recipes:** github.com/TandoorRecipes/recipes und Release-Historie (v2.6.0-Changelog «Households and Pantry»); docs.tandoor.dev; app.tandoor.dev (Live-Demo); Issues #4701, #4708, #4689, #86; hub.docker.com; github.com/sponsors/vabene1111.

**KitchenOwl:** github.com/TomBursch/kitchenowl (README, Releases); kitchenowl.org; f-droid.org; apps.apple.com/id1557453670; Issues #10 (seit 2022), #517 («Not planned»), #1032, #1040; hub.docker.com; github.com/sponsors/TomBursch.

**Samsung Food:** itunes.apple.com Search/Lookup; apps.apple.com/id1133637674; play.google.com Suche. *(samsungfood.com und die Whisk-Firmengeschichte auf Wikipedia waren nicht abrufbar/auffindbar - als Lücke vermerkt.)*

**Jow:** jow.fr; itunes.apple.com Search (Storefronts FR/CH); play.google.com Suche; trustpilot.com/review/jow.fr.

**OLIO:** en.wikipedia.org/wiki/Olio_(app); itunes.apple.com Search (Storefront GB); play.google.com Suche; trustpilot.com/review/olioex.com.

**Too Good To Go:** en.wikipedia.org/wiki/Too_Good_To_Go; itunes.apple.com Search (Storefronts CH/US/FR/DE); play.google.com Suche; trustpilot.com/review/toogoodtogo.com.

**USDA FoodKeeper:** itunes.apple.com Search und Kundenrezensions-RSS-Feed; play.google.com Suche; en.wikipedia.org (indirekter Beleg für foodsafety.gov als zitierte Quelle). *(foodsafety.gov und fsis.usda.gov blockten mit HTTP 403 - institutionelle Herkunft der Haltbarkeitsdaten damit nicht auf Primärquelle verifizierbar.)*

**Zu gut für die Tonne!:** zugutfuerdietonne.de; itunes.apple.com Search (Storefront DE) und Kundenrezensions-RSS-Feed; play.google.com Suche.

**Beste Reste:** de.wikipedia.org (Suche, kein Artikel); itunes.apple.com und play.google.com Suche (kein Treffer).

**Zusätzlich für den Übertragbarkeits-Teil herangezogen:** `docs/superpowers/specs/2026-09-23-lebensmitteltracker-design.md` (bestehendes yummytracker-Konzept, für Terminologie und bereits getroffene Entscheidungen).
