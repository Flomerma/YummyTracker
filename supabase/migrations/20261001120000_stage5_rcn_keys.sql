-- ---------------------------------------------------------------------
-- Waagenetiketten als Lernschluessel zulassen
-- ---------------------------------------------------------------------
--
-- Die vorige Migration verlangte in household_product_eans einen Code mit
-- mindestens acht Stellen. Das war zu eng — und zwar ausgerechnet fuer die
-- Haelfte, die am meisten verdirbt.
--
-- Ladeninterne Waagenetiketten (GS1-Praefix 20 bis 29) tragen den Preis
-- mit im Code:
--
--   2110103 | 00450 | 3
--   ^Artikel  ^Preis  ^Pruefziffer
--
-- Ein frisch gewogenes Stueck desselben Kaeses ergibt deshalb jedes Mal
-- einen anderen Vollcode. Der vordere Teil bleibt gleich und ist damit ein
-- brauchbarer Lernschluessel — nur eben sieben Stellen lang.
--
-- Ohne diese Lockerung waere gelernt worden, was ohnehin stabil ist
-- (verpackte Ware), und nicht gelernt, was es noetig haette (Frischware
-- von der Theke).
--
-- Die Untergrenze bleibt bei sieben und nicht bei eins: Kuerzere Werte
-- waeren keine Codes, sondern Tippfehler.
--
-- Siehe lib/domain/rcn.ts fuer die Zerlegung und fuer das, was daran eine
-- Annahme ist: GS1 reserviert den Bereich, ueberlaesst die innere Struktur
-- aber dem Haendler. Die Aufteilung 7+5 ist verbreitete Praxis, kein
-- Standard — deshalb wird ein Treffer ueber den Artikelschluessel nie
-- automatisch uebernommen, sondern nur vorgeschlagen.
-- ---------------------------------------------------------------------

alter table public.household_product_eans
  drop constraint if exists household_product_eans_format;

alter table public.household_product_eans
  add constraint household_product_eans_format
  check (ean ~ '^[0-9]{7,14}$');

comment on column public.household_product_eans.ean is
  'Der Lernschluessel: bei gewoehnlicher Ware der ganze Strichcode, bei '
  'einem Waagenetikett nur der Artikelteil (die ersten sieben Stellen), '
  'weil der Rest den Preis traegt und sich bei jedem Stueck aendert.';

notify pgrst, 'reload schema';
