-- ---------------------------------------------------------------------
-- Nachweis: Zugriffsschutz Stufe 1
-- ---------------------------------------------------------------------
--
-- Fortsetzung von 10_rls_stufe0.sql fuer die Tabellen aus Stufe 1:
-- categories, products, shelf_life_rules, intake_batches, intake_lines
-- und inventory_items.
--
-- Dieselbe Machart: test.ok() fuer das, was gelten muss, test.denied()
-- fuer das, was scheitern muss. Jede Pruefung ein Satz, der beschreibt,
-- was belegt wird — nicht, welche Anweisung ausgefuehrt wurde.
--
-- Die Helfer und die Testpersonen stammen aus 10_rls_stufe0.sql; diese
-- Datei laeuft nur danach.
-- ---------------------------------------------------------------------

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
\pset footer off
set client_min_messages = notice;

\echo ''
\echo '=== Nachweis Zugriffsschutz Stufe 1 ==='
\echo ''

truncate test.state;

-- Zwei frische Haushalte. Die aus Stufe 0 sind am Ende jenes Skripts
-- geloescht worden.

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into test.state (k, v)
select 'ha', (public.create_household('Vorrat A', 'Anna')).id::text;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into test.state (k, v)
select 'hb', (public.create_household('Vorrat B', 'Beat')).id::text;
commit;

-- ---------------------------------------------------------------------
-- 1  Der Startkatalog ist da und fuer jeden Angemeldeten lesbar
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.ok(
  (select count(*) from public.categories) = 27,
  'Der Startkatalog bringt 27 Kategorien mit');

select test.ok(
  (select count(*) from public.products where household_id is null) = 254,
  'Der Startkatalog bringt 254 globale Produkte mit');

select test.ok(
  (select count(*) from public.shelf_life_rules) = 300,
  'Der Startkatalog bringt 300 Haltbarkeitsregeln mit');

select test.ok(
  (select days_unopened from public.shelf_life_rules r
     join public.products p on p.id = r.product_id
    where p.normalized_name = 'vollmilch' and r.storage = 'fridge') between 1 and 14,
  'Vollmilch hat einen plausiblen Haltbarkeitswert im Kuehlschrank');
commit;

-- ---------------------------------------------------------------------
-- 2  Der Katalog ist aus dem Browser nicht veraenderbar
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.denied(
  'insert into public.products (name, normalized_name, default_unit, source)
     values (''Schmuggelware'', ''schmuggelware'', ''piece'', ''seed'')',
  'Ein Angemeldeter kann kein globales Produkt anlegen');

select test.denied(
  'update public.products set name = ''Umbenannt'' where normalized_name = ''vollmilch''',
  'Ein Angemeldeter kann den globalen Katalog nicht umbenennen');

select test.denied(
  'delete from public.categories',
  'Ein Angemeldeter kann keine Kategorie loeschen');

select test.denied(
  'insert into public.shelf_life_rules (scope, category_id, storage, days_unopened, source)
     select ''category'', id, ''fridge'', 1, ''seed'' from public.categories limit 1',
  'Ein Angemeldeter kann keine Haltbarkeitsregel erfinden');
commit;

-- ---------------------------------------------------------------------
-- 3  Unangemeldet ist auch der Katalog verschlossen
-- ---------------------------------------------------------------------

begin;
set local role anon;
select test.denied('select count(*) from public.products',
  'anon kommt nicht an den Produktkatalog');
select test.denied('select count(*) from public.inventory_items',
  'anon kommt nicht an den Vorrat');
select test.denied('select count(*) from public.intake_batches',
  'anon kommt nicht an die Eingaenge');
commit;

-- ---------------------------------------------------------------------
-- 4  Vorrat anlegen — und der andere Haushalt sieht nichts davon
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- INSERT ... RETURNING laesst sich nicht als Unterabfrage schreiben;
-- datenaendernde Anweisungen brauchen dafuer eine CTE.
with neu as (
  insert into public.inventory_items
    (household_id, product_id, display_name, quantity, unit, storage,
     expires_at, expiry_source)
  select (select v::uuid from test.state where k = 'ha'),
         p.id, p.name, 1, 'ml', 'fridge',
         current_date + 5, 'catalog'
    from public.products p
   where p.normalized_name = 'vollmilch'
  returning id
)
insert into test.state (k, v) select 'item_a', id::text from neu;

select test.ok(
  (select count(*) from public.inventory_items) = 1,
  'A sieht den eigenen Bestandsartikel');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.ok(
  (select count(*) from public.inventory_items) = 0,
  'B sieht keinen einzigen Bestandsartikel von A');

select test.ok(
  (select count(*) from public.inventory_items
    where id = (select v::uuid from test.state where k = 'item_a')) = 0,
  'B sieht ihn auch nicht bei gezielter Abfrage nach der Kennung');

-- ACHTUNG, LEHRREICHER PUNKT: Hier waere test.denied() falsch.
-- Zeilen-Sicherheitsregeln machen fremde Zeilen UNSICHTBAR, sie werfen
-- keinen Fehler. Ein UPDATE, das keine sichtbare Zeile trifft, aendert
-- null Zeilen und gilt als erfolgreich. Ein Test, der hier eine Ausnahme
-- erwartet, prueft die falsche Wirkung und gibt falsche Sicherheit.
-- Belegt wird deshalb, was zaehlt: dass sich die Daten nicht aendern.
update public.inventory_items
   set quantity = 99
 where id = (select v::uuid from test.state where k = 'item_a');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select test.ok(
  (select quantity from public.inventory_items
    where id = (select v::uuid from test.state where k = 'item_a')) = 1,
  'Der Schreibversuch von B hat den Artikel von A nicht veraendert');
commit;

-- ---------------------------------------------------------------------
-- 5  Niemand schreibt in einen fremden Haushalt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.denied(
  format('insert into public.inventory_items
            (household_id, display_name, quantity, unit, expiry_source)
          values (%L::uuid, ''Untergeschoben'', 1, ''piece'', ''none'')',
         (select v from test.state where k = 'ha')),
  'B kann keinen Artikel in den Haushalt von A legen');
commit;

-- ---------------------------------------------------------------------
-- 6  Bestandsartikel lassen sich nicht loeschen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.denied(
  'delete from public.inventory_items',
  'Auch der eigene Artikel laesst sich nicht loeschen — sonst gaebe es keine Auswertung');
commit;

-- ---------------------------------------------------------------------
-- 7  Der Statuswechsel traegt Zeitpunkt und Person selbst ein
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

update public.inventory_items
   set status = 'discarded'
 where id = (select v::uuid from test.state where k = 'item_a');

select test.ok(
  (select resolved_at is not null and resolved_by = auth.uid()
     from public.inventory_items
    where id = (select v::uuid from test.state where k = 'item_a')),
  'Weggeworfen setzt Zeitpunkt und Person automatisch — der Client kann das nicht faelschen');

update public.inventory_items
   set status = 'active'
 where id = (select v::uuid from test.state where k = 'item_a');

select test.ok(
  (select resolved_at is null and resolved_by is null
     from public.inventory_items
    where id = (select v::uuid from test.state where k = 'item_a')),
  'Zurueckholen nimmt beides wieder weg');
commit;

-- ---------------------------------------------------------------------
-- 8  Eingang: Entwurf anlegen, fuellen, uebernehmen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

with neu as (
  insert into public.intake_batches (household_id, source)
  values ((select v::uuid from test.state where k = 'ha'), 'manual')
  returning id
)
insert into test.state (k, v) select 'batch_a', id::text from neu;

insert into public.intake_lines
  (batch_id, raw_text, product_id, quantity, unit, storage,
   suggested_expires_at, expiry_source, accepted)
select (select v::uuid from test.state where k = 'batch_a'),
       p.name, p.id, 2, 'piece', 'fridge', current_date + 10, 'catalog', true
  from public.products p
 where p.normalized_name = 'vollmilch';

select test.ok(
  (select count(*) from public.intake_lines) = 1,
  'A kann eine Zeile in den eigenen Entwurf legen');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.ok(
  (select count(*) from public.intake_batches) = 0
  and (select count(*) from public.intake_lines) = 0,
  'B sieht weder Entwurf noch Zeilen von A');

select test.denied(
  format('select public.confirm_intake_batch(%L::uuid)',
         (select v from test.state where k = 'batch_a')),
  'B kann den Entwurf von A nicht uebernehmen');
commit;

-- ---------------------------------------------------------------------
-- 9  Uebernehmen ist wiederholbar, ohne zu verdoppeln
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select public.confirm_intake_batch(
  (select v::uuid from test.state where k = 'batch_a'));
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.ok(
  (select count(*) from public.inventory_items) = 2,
  'Aus der Entwurfszeile ist ein Bestandsartikel geworden');

select test.ok(
  (select status from public.intake_batches
    where id = (select v::uuid from test.state where k = 'batch_a')) = 'confirmed',
  'Der Entwurf ist als uebernommen vermerkt');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.confirm_intake_batch(
  (select v::uuid from test.state where k = 'batch_a'));
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select test.ok(
  (select count(*) from public.inventory_items) = 2,
  'Ein zweites Uebernehmen verdoppelt nichts — ein Doppelklick ist harmlos');
commit;

-- ---------------------------------------------------------------------
-- 10  Haushaltseigene Produkte bleiben beim eigenen Haushalt
-- ---------------------------------------------------------------------

-- Anlegen geht nur mit erhoehten Rechten (der Katalog ist fuer
-- authenticated nur lesbar), deshalb hier als postgres — genau so, wie es
-- die Anwendung ueber lib/supabase/admin.ts tut.
with neu as (
  insert into public.products
    (name, normalized_name, default_unit, source, household_id)
  values ('Grossmutters Konfi', 'grossmutters konfi', 'g', 'user',
          (select v::uuid from test.state where k = 'ha'))
  returning id
)
insert into test.state (k, v) select 'prod_a', id::text from neu;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select test.ok(
  (select count(*) from public.products
    where normalized_name = 'grossmutters konfi') = 1,
  'A sieht das eigene Produkt');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select test.ok(
  (select count(*) from public.products
    where normalized_name = 'grossmutters konfi') = 0,
  'B sieht das haushaltseigene Produkt von A nicht');
commit;

-- ---------------------------------------------------------------------
-- 11  Ein fremdes Produkt kommt nicht in den eigenen Bestand
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- Die Kennung wird hier BEWUSST als Literal eingesetzt statt ueber eine
-- Unterabfrage geholt: B sieht das Produkt von A nicht, eine Unterabfrage
-- lieferte also NULL und der Angriff waere gar nicht formulierbar. Genau
-- das soll hier aber geprueft werden — jemand, der die Kennung kennt oder
-- errraet. Der Fremdschluessel allein genuegt dafuer nicht, er prueft nur
-- die Existenz; es braucht den Trigger.
select test.denied(
  format('insert into public.inventory_items
            (household_id, product_id, display_name, quantity, unit, expiry_source)
          values (%L::uuid, %L::uuid, ''Geraten'', 1, ''g'', ''none'')',
         (select v from test.state where k = 'hb'),
         (select v from test.state where k = 'prod_a')),
  'B kann das Produkt von A nicht in den eigenen Bestand schreiben, auch wenn es die Kennung kennt');
commit;

-- ---------------------------------------------------------------------
-- 12  Gelernte Regeln sind haushaltseigen
-- ---------------------------------------------------------------------

insert into public.shelf_life_rules
  (scope, product_id, storage, days_unopened, household_id, source, sample_count)
select 'product', p.id, 'fridge', 3,
       (select v::uuid from test.state where k = 'ha'), 'learned', 2
  from public.products p where p.normalized_name = 'vollmilch';

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select test.ok(
  (select count(*) from public.shelf_life_rules where source = 'learned') = 1,
  'A sieht die eigene gelernte Regel');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select test.ok(
  (select count(*) from public.shelf_life_rules where source = 'learned') = 0,
  'B sieht die gelernte Regel von A nicht — Gewohnheiten bleiben im Haushalt');
commit;

\echo ''
\echo '=== Stufe 1: alle Pruefungen bestanden ==='
\echo ''
