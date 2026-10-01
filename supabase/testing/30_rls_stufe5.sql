-- ---------------------------------------------------------------------
-- Nachweis: Zugriffsschutz fuer gelernte Strichcode-Zuordnungen
-- ---------------------------------------------------------------------
--
-- Fortsetzung von 20_rls_stufe1.sql. Die dort angelegten Haushalte
-- "Vorrat A" und "Vorrat B" und das haushaltseigene Produkt von A werden
-- weiterverwendet; diese Datei laeuft nur danach.
--
-- Gelernte Zuordnungen sind heikler als sie aussehen: Sie sagen aus, was
-- ein Code in EINEM Haushalt bedeutet. Liefe das ueber Haushaltsgrenzen,
-- koennte eine fremde Zuordnung bestimmen, was beim eigenen Scan
-- herauskommt.
-- ---------------------------------------------------------------------

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
\pset footer off
set client_min_messages = notice;

\echo ''
\echo '=== Nachweis Zugriffsschutz: gelernte Strichcodes ==='
\echo ''

-- Ein globales Produkt, auf das beide Haushalte zeigen duerfen.
insert into test.state (k, v)
select 'prod_global', id::text from public.products
 where normalized_name = 'vollmilch' and household_id is null limit 1;

-- ---------------------------------------------------------------------
-- 1  Lernen und wiederfinden
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.household_product_eans (household_id, ean, product_id)
values ((select v::uuid from test.state where k = 'ha'),
        '7613035676497',
        (select v::uuid from test.state where k = 'prod_global'));

select test.ok(
  (select count(*) from public.household_product_eans
    where ean = '7613035676497') = 1,
  'A merkt sich, was ein Strichcode bedeutet, und findet ihn wieder');
commit;

-- ---------------------------------------------------------------------
-- 2  Der andere Haushalt sieht nichts davon
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.ok(
  (select count(*) from public.household_product_eans) = 0,
  'B sieht keine einzige Zuordnung von A');

select test.ok(
  (select count(*) from public.household_product_eans
    where ean = '7613035676497') = 0,
  'B sieht sie auch nicht bei gezielter Suche nach dem Code');
commit;

-- ---------------------------------------------------------------------
-- 3  Niemand lernt fuer einen fremden Haushalt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.denied(
  format('insert into public.household_product_eans
            (household_id, ean, product_id)
          values (%L::uuid, ''1234567890128'', %L::uuid)',
         (select v from test.state where k = 'ha'),
         (select v from test.state where k = 'prod_global')),
  'B kann A keine Zuordnung unterschieben');
commit;

-- ---------------------------------------------------------------------
-- 4  Und zeigt auch nicht auf ein fremdes Produkt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- prod_a ist das haushaltseigene Produkt von A ("Grossmutters Konfi").
-- Die Kennung steht hier BEWUSST als Literal: B sieht das Produkt nicht,
-- eine Unterabfrage lieferte also NULL und der Angriff waere gar nicht
-- formulierbar. Geprueft werden soll aber genau jemand, der die Kennung
-- kennt oder erraet — der Fremdschluessel allein haelt das nicht auf.
select test.denied(
  format('insert into public.household_product_eans
            (household_id, ean, product_id)
          values (%L::uuid, ''1234567890128'', %L::uuid)',
         (select v from test.state where k = 'hb'),
         (select v from test.state where k = 'prod_a')),
  'B kann keinen Code auf das haushaltseigene Produkt von A zeigen lassen');
commit;

-- ---------------------------------------------------------------------
-- 5  Unangemeldet geht gar nichts
-- ---------------------------------------------------------------------

begin;
set local role anon;
select test.denied(
  'select count(*) from public.household_product_eans',
  'anon kommt nicht an die gelernten Zuordnungen');
commit;

-- ---------------------------------------------------------------------
-- 6  Eine Zuordnung laesst sich nicht heimlich umbiegen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Kein UPDATE-Recht: Eine Richtlinie kann den alten Wert nicht sehen,
-- also gibt es die Anweisung gar nicht erst. Korrigiert wird durch
-- Loeschen und Neuanlegen.
select test.denied(
  'update public.household_product_eans set product_id = product_id',
  'Eine bestehende Zuordnung laesst sich nicht aendern, nur ersetzen');
commit;

-- ---------------------------------------------------------------------
-- 7  Die Form des Codes wird geprueft
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.denied(
  format('insert into public.household_product_eans
            (household_id, ean, product_id)
          values (%L::uuid, ''nicht ziffern'', %L::uuid)',
         (select v from test.state where k = 'ha'),
         (select v from test.state where k = 'prod_global')),
  'Ein Code, der keine Ziffernfolge ist, wird abgewiesen');

select test.denied(
  format('insert into public.household_product_eans
            (household_id, ean, product_id)
          values (%L::uuid, '' 7613035676497 '', %L::uuid)',
         (select v from test.state where k = 'ha'),
         (select v from test.state where k = 'prod_global')),
  'Auch ein Code mit Leerzeichen wird abgewiesen, nicht stillschweigend gespeichert');
commit;

-- ---------------------------------------------------------------------
-- 8  A kann die eigene Zuordnung zuruecknehmen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

delete from public.household_product_eans where ean = '7613035676497';

select test.ok(
  (select count(*) from public.household_product_eans) = 0,
  'A kann eine Zuordnung wieder entfernen');
commit;

-- ---------------------------------------------------------------------
-- 8b  Eigene Produkte anlegen — ohne Geheimschluessel
-- ---------------------------------------------------------------------
--
-- Seit Migration 20261001150000 darf ein Mitglied haushaltseigene
-- Produkte selbst anlegen. Der Weg ueber den Geheimschluessel war hier
-- kein Schutz, sondern nur eine Ausfallquelle: Solche Zeilen sind durch
-- die Richtlinien ohnehin fuer keinen anderen Haushalt sichtbar.
-- Entscheidend ist, dass der Weg ins GLOBALE versperrt bleibt.

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.products
  (name, normalized_name, category_id, default_unit, default_storage,
   source, household_id)
values ('Beats Spezialmischung', 'beats spezialmischung', null, 'g', 'pantry',
        'user', (select v::uuid from test.state where k = 'hb'));

select test.ok(
  (select count(*) from public.products
    where normalized_name = 'beats spezialmischung') = 1,
  'B kann ein eigenes Produkt anlegen, ohne Geheimschluessel auf dem Server');

select test.ok(
  (select verified from public.products
    where normalized_name = 'beats spezialmischung') = false,
  'Die Pruefmarkierung bleibt aus — eine Selbstbescheinigung waere wertlos');

-- Und sie laesst sich auch nicht setzen. Die Anwendung schrieb anfangs
-- verified: false mit — und scheiterte genau daran in Produktion, weil die
-- Spalte nicht freigegeben ist. Das ist richtig so; der Code wurde
-- angepasst (siehe lib/data/catalog-grants.test.ts).
select test.denied(
  format('insert into public.products
            (name, normalized_name, default_unit, source, household_id, verified)
          values (''Selbst geprueft'', ''selbst geprueft'', ''piece'', ''user'', %L::uuid, true)',
         (select v from test.state where k = 'hb')),
  'B kann ein eigenes Produkt nicht als geprueft markieren');

select test.denied(
  'insert into public.products
     (name, normalized_name, default_unit, source, household_id)
   values (''Weltweiter Unfug'', ''weltweiter unfug'', ''piece'', ''seed'', null)',
  'B kann weiterhin KEIN globales Produkt anlegen');

select test.denied(
  format('insert into public.products
            (name, normalized_name, default_unit, source, household_id)
          values (''Untergeschoben'', ''untergeschoben'', ''piece'', ''user'', %L::uuid)',
         (select v from test.state where k = 'ha')),
  'B kann kein Produkt in den Haushalt von A legen');

select test.denied(
  'update public.products set name = ''Umbenannt''
    where normalized_name = ''vollmilch''',
  'Der globale Katalog bleibt unveraenderlich');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select test.ok(
  (select count(*) from public.products
    where normalized_name = 'beats spezialmischung') = 0,
  'A sieht das eigene Produkt von B nicht');
commit;

-- ---------------------------------------------------------------------
-- 9  Mit dem Haushalt verschwinden auch seine Zuordnungen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.household_product_eans (household_id, ean, product_id)
values ((select v::uuid from test.state where k = 'ha'),
        '7613035676497',
        (select v::uuid from test.state where k = 'prod_global'));
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from public.households
 where id = (select v::uuid from test.state where k = 'ha');
commit;

select test.ok(
  (select count(*) from public.household_product_eans
    where household_id = (select v::uuid from test.state where k = 'ha')) = 0,
  'Beim Loeschen des Haushalts verschwinden die gelernten Codes mit');

select test.ok(
  (select count(*) from public.products
    where normalized_name = 'vollmilch' and household_id is null) = 1,
  'Der globale Katalog bleibt davon unberuehrt');

\echo ''
\echo '=== Gelernte Strichcodes: alle Pruefungen bestanden ==='
\echo ''
