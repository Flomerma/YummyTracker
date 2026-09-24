-- ---------------------------------------------------------------------
-- Nachweis: Zugriffsschutz Stufe 0
-- ---------------------------------------------------------------------
--
-- Das Konzept nennt als Erfolgskriterium einen "automatisierten Nachweis,
-- dass ein fremder Haushalt keine Daten sieht". Dieses Skript ist dieser
-- Nachweis. Es prueft nicht, ob die Richtlinien existieren, sondern ob sie
-- wirken - indem es sich nacheinander als verschiedene Personen ausgibt
-- und beobachtet, was dann moeglich ist und was nicht.
--
-- Ausfuehren:  supabase/testing/run.sh
--
-- Jede Pruefung meldet "OK". Die erste fehlgeschlagene Pruefung bricht das
-- Skript ab (ON_ERROR_STOP), damit kein Fehler untergeht.
-- ---------------------------------------------------------------------

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
\pset footer off
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Ruestzeug
-- ---------------------------------------------------------------------

create schema if not exists test;

create or replace function test.ok(p_cond boolean, p_msg text)
returns void
language plpgsql
as $$
begin
  if p_cond then
    raise notice 'OK      %', p_msg;
  else
    raise exception 'FEHLGESCHLAGEN: %', p_msg;
  end if;
end
$$;

-- Erwartet, dass eine Anweisung scheitert. Gelingt sie, ist das der Fehler.
create or replace function test.denied(p_sql text, p_msg text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FEHLGESCHLAGEN: % - die Anweisung war erlaubt, haette aber scheitern muessen', p_msg;
exception
  when others then
    -- Die Anwendung meldet Ablehnungen selbst mit "raise exception" (P0001),
    -- also demselben Code wie eine fehlgeschlagene Pruefung hier. Unterschieden
    -- wird deshalb am Meldungstext, nicht am Fehlercode.
    if sqlerrm like 'FEHLGESCHLAGEN%' then
      raise;
    end if;
    raise notice 'OK      % (abgewiesen: %)', p_msg, left(sqlerrm, 60);
end
$$;

create table if not exists test.state (k text primary key, v text);
grant usage on schema test to public;
grant all on test.state to public;
grant execute on all functions in schema test to public;

truncate test.state;

-- Testpersonen ---------------------------------------------------------
-- A und B fuehren je einen eigenen Haushalt, C steht zunaechst draussen.

delete from auth.users where email in ('a@test.ch', 'b@test.ch', 'c@test.ch');
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.ch'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.ch'),
  ('33333333-3333-3333-3333-333333333333', 'c@test.ch');

\echo ''
\echo '=== Nachweis Zugriffsschutz Stufe 0 ==='
\echo ''

-- ---------------------------------------------------------------------
-- 1  Anlegen macht den Ersteller zum Eigentuemer
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into test.state (k, v)
select 'ha', (public.create_household('Haushalt A', 'Anna')).id::text;

select test.ok(
  (select count(*) from public.household_members
    where household_id = (select v::uuid from test.state where k = 'ha')
      and user_id = '11111111-1111-1111-1111-111111111111'
      and role = 'owner') = 1,
  'Wer einen Haushalt anlegt, wird automatisch Eigentuemer');

select test.ok(
  (select count(*) from public.households) = 1,
  'A sieht genau einen Haushalt: den eigenen');
commit;

-- ---------------------------------------------------------------------
-- 2  Ein zweiter Haushalt entsteht voellig getrennt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into test.state (k, v)
select 'hb', (public.create_household('Haushalt B', 'Beat')).id::text;

select test.ok(
  (select count(*) from public.households) = 1,
  'B sieht ebenfalls nur den eigenen Haushalt');
commit;

-- ---------------------------------------------------------------------
-- 3  Kern des Nachweises: A sieht nichts von B
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.ok(
  (select count(*) from public.households
    where id = (select v::uuid from test.state where k = 'hb')) = 0,
  'A sieht den Haushalt von B nicht - auch nicht bei gezielter Abfrage nach der ID');

select test.ok(
  (select count(*) from public.household_members
    where household_id = (select v::uuid from test.state where k = 'hb')) = 0,
  'A sieht die Mitglieder von B nicht');

select test.ok(
  (select count(*) from public.household_invites
    where household_id = (select v::uuid from test.state where k = 'hb')) = 0,
  'A sieht die Einladungen von B nicht');
commit;

-- ---------------------------------------------------------------------
-- 4  Wer zu keinem Haushalt gehoert, sieht gar nichts
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select test.ok(
  (select count(*) from public.households) = 0
  and (select count(*) from public.household_members) = 0,
  'C gehoert zu keinem Haushalt und sieht nichts');
commit;

-- ---------------------------------------------------------------------
-- 5  Unangemeldet ist alles verschlossen
-- ---------------------------------------------------------------------

begin;
set local role anon;
select test.denied(
  'select count(*) from public.households',
  'anon darf Haushalte nicht einmal lesen');
commit;

-- ---------------------------------------------------------------------
-- 6  Einladung nur fuer den eigenen Haushalt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into test.state (k, v)
select 'token', invite_token
from public.create_household_invite(
  (select v::uuid from test.state where k = 'ha'));

select test.ok(
  (select length(v) from test.state where k = 'token') >= 20,
  'A erhaelt einen Einladungsschluessel im Klartext - einmalig bei der Erzeugung');

select test.denied(
  format('select public.create_household_invite(%L::uuid)',
         (select v from test.state where k = 'hb')),
  'A kann keine Einladung fuer den Haushalt von B erzeugen');
commit;

-- ---------------------------------------------------------------------
-- 7  Der Klartext-Schluessel darf nirgends gespeichert sein
-- ---------------------------------------------------------------------

begin;
select test.ok(
  (select count(*) from public.household_invites
    where token_hash = (select v from test.state where k = 'token')) = 0,
  'Der Klartext-Schluessel steht nicht in der Datenbank');

select test.ok(
  (select bool_and(token_hash ~ '^[0-9a-f]{64}$') from public.household_invites),
  'Gespeichert ist ausschliesslich ein SHA-256-Hash');
commit;

-- ---------------------------------------------------------------------
-- 8  Beitritt per Schluessel
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select public.join_household_with_invite(
  (select v from test.state where k = 'token'), 'Chris');

select test.ok(
  (select count(*) from public.households
    where id = (select v::uuid from test.state where k = 'ha')) = 1,
  'Nach dem Beitritt sieht C den Haushalt von A');

select test.ok(
  (select role from public.household_members
    where household_id = (select v::uuid from test.state where k = 'ha')
      and user_id = '33333333-3333-3333-3333-333333333333') = 'member',
  'C tritt als einfaches Mitglied bei, nicht als Eigentuemer');

select test.ok(
  (select count(*) from public.households
    where id = (select v::uuid from test.state where k = 'hb')) = 0,
  'Der Beitritt oeffnet C keine anderen Haushalte');
commit;

-- ---------------------------------------------------------------------
-- 9  Ein Schluessel gilt genau einmal
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select test.denied(
  format('select public.join_household_with_invite(%L)',
         (select v from test.state where k = 'token')),
  'Derselbe Schluessel laesst sich kein zweites Mal einloesen');
commit;

-- ---------------------------------------------------------------------
-- 10  Ein Mitglied kann sich nicht selbst befoerdern
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select test.denied(
  'update public.household_members set role = ''owner'' where user_id = auth.uid()',
  'C kann sich nicht selbst zum Eigentuemer machen');

update public.household_members
   set display_name = 'Christian'
 where user_id = auth.uid();

select test.ok(
  (select display_name from public.household_members where user_id = auth.uid()) = 'Christian',
  'C darf dagegen den eigenen Anzeigenamen aendern');
commit;

-- ---------------------------------------------------------------------
-- 11  Nur der Eigentuemer entfernt Mitglieder und loescht den Haushalt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

delete from public.household_members
 where user_id = '11111111-1111-1111-1111-111111111111';

select test.ok(
  (select count(*) from public.household_members
    where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'C kann A nicht aus dem Haushalt entfernen');

delete from public.households
 where id = (select v::uuid from test.state where k = 'ha');

select test.ok(
  (select count(*) from public.households) = 1,
  'C kann den Haushalt nicht loeschen');
commit;

-- ---------------------------------------------------------------------
-- 12  Der letzte Eigentuemer bleibt geschuetzt
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select test.denied(
  'delete from public.household_members where user_id = auth.uid()',
  'A kann sich nicht als letzter Eigentuemer entfernen');
commit;

-- ---------------------------------------------------------------------
-- 13  Der Eigentuemer kann Mitglieder entfernen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

delete from public.household_members
 where user_id = '33333333-3333-3333-3333-333333333333';

select test.ok(
  (select count(*) from public.household_members
    where household_id = (select v::uuid from test.state where k = 'ha')) = 1,
  'A kann C wieder entfernen');
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select test.ok(
  (select count(*) from public.households) = 0,
  'C sieht danach wieder nichts');
commit;

-- ---------------------------------------------------------------------
-- 14  Abgelaufene Einladungen werden abgewiesen
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into test.state (k, v)
select 'token2', invite_token
from public.create_household_invite(
  (select v::uuid from test.state where k = 'ha'),
  interval '1 hour');
commit;

-- Die Uhr laesst sich nicht vorstellen, also wird die Einladung direkt in
-- die Vergangenheit gelegt - als postgres, weil authenticated kein
-- Schreibrecht auf der Tabelle hat. Beide Zeitstempel muessen wandern:
-- eine Bedingung verlangt, dass das Ablaufdatum nach dem Erstelldatum liegt.
update public.household_invites
   set created_at = now() - interval '2 hours',
       expires_at = now() - interval '1 minute'
 where used_at is null;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select test.denied(
  format('select public.join_household_with_invite(%L)',
         (select v from test.state where k = 'token2')),
  'Eine abgelaufene Einladung wird abgewiesen');
commit;

-- ---------------------------------------------------------------------
-- 15  Der Eigentuemer kann den Haushalt loeschen (Kaskade vs. Trigger)
-- ---------------------------------------------------------------------

begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

delete from public.households
 where id = (select v::uuid from test.state where k = 'ha');

select test.ok(
  (select count(*) from public.households) = 0,
  'A kann den eigenen Haushalt loeschen - der Eigentuemer-Schutz blockiert die Kaskade nicht');
commit;

select test.ok(
  (select count(*) from public.household_members
    where household_id = (select v::uuid from test.state where k = 'ha')) = 0,
  'Die Mitgliedschaften wurden mitgeloescht');

\echo ''
\echo '=== Alle Pruefungen bestanden ==='
\echo ''
