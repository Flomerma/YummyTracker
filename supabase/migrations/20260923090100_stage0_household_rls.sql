-- =====================================================================
-- Stufe 0 / 2 von 3 : Zeilen-Sicherheitsregeln (RLS)
-- =====================================================================
-- DAS ZENTRALE PROBLEM UND SEINE LOESUNG
-- ---------------------------------------------------------------------
-- Die naheliegende Richtlinie auf household_members lautet:
--
--   create policy ... on public.household_members for select using (
--     exists (select 1 from public.household_members m
--             where m.household_id = household_members.household_id
--               and m.user_id = auth.uid()));
--
-- Sie ist falsch. Um zu pruefen, ob eine Zeile von household_members
-- sichtbar ist, liest Postgres household_members - und wendet darauf
-- wieder dieselbe Richtlinie an. Ergebnis:
--
--   ERROR: 42P17: infinite recursion detected in policy for relation
--                 "household_members"
--
-- Loesung: die Mitgliedschaftsabfrage in eine SECURITY-DEFINER-Funktion
-- auslagern. Sie laeuft mit den Rechten ihres Eigentuemers. Auf Supabase
-- ist das die Rolle postgres, und die besitzt BYPASSRLS - innerhalb der
-- Funktion wird RLS also gar nicht erst ausgewertet. Die Kette bricht.
--
-- Drei Bedingungen muessen dafuer erfuellt sein:
--   1. Eigentuemer der Funktion hat BYPASSRLS  (postgres; unten geprueft)
--   2. Die Tabelle steht NICHT auf "force row level security"
--   3. Die Funktion filtert selbst auf auth.uid() - sonst waere sie ein
--      Datenleck, weil sie RLS umgeht.
--
-- Die Funktionen liegen im Schema private, damit sie nicht ueber die
-- Data-API als RPC aufrufbar sind.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Vorbedingung pruefen
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = current_user and rolbypassrls
  ) then
    raise warning
      'Migration laeuft als Rolle "%", die kein BYPASSRLS besitzt. Die Hilfsfunktionen umgehen RLS dann nicht und die Richtlinien auf household_members rekursieren (SQLSTATE 42P17). Migration als postgres ausfuehren.',
      current_user;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1. Hilfsfunktionen
-- ---------------------------------------------------------------------
-- Alle: security definer + set search_path = '' + stable.
--   security definer -> bricht die Rekursion (siehe oben)
--   set search_path = '' -> verhindert, dass ein Aufrufer ueber ein
--       eigenes Schema eine Funktion oder Tabelle unterschiebt. Das ist
--       bei SECURITY DEFINER Pflicht, nicht Stil.
--   stable -> erlaubt Postgres, den Aufruf in (select ...) einmal pro
--       Anweisung statt einmal pro Zeile auszuwerten (initPlan).

-- Alle Haushalte, in denen der Aufrufer Mitglied ist.
create or replace function private.current_household_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid())
$$;

comment on function private.current_household_ids() is
  'Haushalte des Aufrufers. SECURITY DEFINER, um die RLS-Rekursion auf household_members zu brechen.';

-- Alle Haushalte, in denen der Aufrufer die Rolle owner hat.
create or replace function private.owned_household_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select m.household_id
  from public.household_members m
  where m.user_id = (select auth.uid())
    and m.role = 'owner'
$$;

-- Punktabfrage, wenn nur ein Haushalt zu pruefen ist (Funktionen in
-- Migration 3). In Richtlinien bewusst nicht verwendet: eine Funktion
-- mit Zeilenbezug laesst sich nicht in (select ...) zwischenspeichern.
create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
  )
$$;

create or replace function private.is_household_owner(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
$$;

create or replace function private.household_owner_count(p_household_id uuid)
returns integer
language sql
security definer
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.household_members m
  where m.household_id = p_household_id
    and m.role = 'owner'
$$;

-- Postgres vergibt EXECUTE auf neue Funktionen standardmaessig an PUBLIC.
-- Explizit entziehen und nur gezielt vergeben.
revoke all on function private.current_household_ids()        from public;
revoke all on function private.owned_household_ids()          from public;
revoke all on function private.is_household_member(uuid)      from public;
revoke all on function private.is_household_owner(uuid)       from public;
revoke all on function private.household_owner_count(uuid)    from public;

grant execute on function private.current_household_ids()     to authenticated, service_role;
grant execute on function private.owned_household_ids()       to authenticated, service_role;
grant execute on function private.is_household_member(uuid)   to authenticated, service_role;
grant execute on function private.is_household_owner(uuid)    to authenticated, service_role;
grant execute on function private.household_owner_count(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Trigger: Ersteller wird automatisch Eigentuemer
-- ---------------------------------------------------------------------
-- Als Trigger und nicht als Teil einer RPC-Funktion, damit die Regel
-- auch dann greift, wenn eine Zeile ueber service_role, den SQL-Editor
-- oder eine spaetere Seed-Datei entsteht. Es gibt keinen Weg, einen
-- Haushalt ohne Eigentuemer anzulegen.
--
-- SECURITY DEFINER ist hier zwingend: der Trigger schreibt in
-- household_members, und der Aufrufer besitzt darauf weder INSERT-Recht
-- noch eine INSERT-Richtlinie. Ohne definer scheitert jedes Anlegen mit
--   "permission denied for table household_members".

create or replace function private.households_add_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then
    -- Serverseitig ohne Benutzerkontext angelegt (z. B. Seed).
    return new;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (household_id, user_id) do nothing;

  return new;
end;
$$;

create trigger households_add_creator_as_owner
  after insert on public.households
  for each row execute function private.households_add_creator_as_owner();


-- ---------------------------------------------------------------------
-- 3. Trigger: der letzte Eigentuemer bleibt
-- ---------------------------------------------------------------------
-- Als Trigger statt nur als Richtlinie, weil RLS fuer service_role nicht
-- gilt. Diese Regel soll auch dann halten, wenn die Dienst-Schicht mit
-- dem allmaechtigen Schluessel arbeitet.
--
-- Die beiden Existenzpruefungen sind der Grund, warum das Loeschen eines
-- Haushalts (oder eines Benutzerkontos) nicht an dieser Regel scheitert:
-- in beiden Faellen loescht die Fremdschluessel-Kaskade die Mitglieder,
-- und die Elternzeile ist zu diesem Zeitpunkt bereits weg.

create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return old;
  end if;

  -- Kaskade aus "delete from households" -> durchlassen.
  if not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;

  -- Kaskade aus dem Loeschen des Benutzerkontos -> durchlassen.
  if not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;

  if private.household_owner_count(old.household_id) <= 1 then
    raise exception 'Der letzte Eigentuemer eines Haushalts kann nicht entfernt werden.'
      using errcode = 'P0001', detail = 'last_owner_protected';
  end if;

  return old;
end;
$$;

create trigger household_members_prevent_last_owner_removal
  before delete on public.household_members
  for each row execute function private.prevent_last_owner_removal();


-- =====================================================================
-- 4. Richtlinien
-- =====================================================================
-- Durchgaengig "to authenticated": anon hat ohnehin keine Tabellenrechte
-- mehr, aber die Angabe spart die Auswertung und macht die Absicht klar.
--
-- Durchgaengig "spalte in (select private.xyz())" statt
-- "exists (select ... from household_members ...)":
--   * bricht die Rekursion
--   * die mengenwertige Funktion haengt nicht von Zeilendaten ab und
--     wird deshalb einmal pro Anweisung ausgewertet, nicht pro Zeile.
-- ---------------------------------------------------------------------


-- --- households --------------------------------------------------------

-- created_by steht zusaetzlich in der USING-Bedingung, und zwar nicht aus
-- Bequemlichkeit: bei "insert into households ... returning *" prueft
-- Postgres die RETURNING-Zeile gegen die SELECT-Richtlinie. Der AFTER-
-- INSERT-Trigger, der die Mitgliedschaft anlegt, feuert erst am Ende der
-- Anweisung. Ohne diesen Zweig scheitert jedes Anlegen mit
--   "new row violates row-level security policy for table households".
-- Ein Leck ist es nicht: der Ersteller ist owner, und nur owner duerfen
-- Mitglieder entfernen - er kann also nie aus dem Haushalt fallen.
create policy households_select_member
  on public.households
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or id in (select private.current_household_ids())
  );

create policy households_insert_self
  on public.households
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

-- Umbenennen darf jedes Mitglied (Konzept 3.4: alle gleichberechtigt).
-- Das Spaltenrecht aus Migration 1 begrenzt das UPDATE ohnehin auf name.
create policy households_update_member
  on public.households
  for update
  to authenticated
  using      (id in (select private.current_household_ids()))
  with check (id in (select private.current_household_ids()));

create policy households_delete_owner
  on public.households
  for delete
  to authenticated
  using (id in (select private.owned_household_ids()));


-- --- household_members -------------------------------------------------

create policy household_members_select_member
  on public.household_members
  for select
  to authenticated
  using (household_id in (select private.current_household_ids()));

-- Keine INSERT-Richtlinie, und in Migration 1 auch kein INSERT-Recht:
-- Mitgliedschaften entstehen nur ueber den Trigger oben und ueber
-- join_household_with_invite() in Migration 3. Damit kann sich niemand
-- durch Erraten einer Haushaltskennung selbst eintragen.

-- Nur der eigene Anzeigename. Die Rolle ist bereits durch das
-- Spaltenrecht "grant update (display_name)" geschuetzt.
create policy household_members_update_own_display_name
  on public.household_members
  for update
  to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Entfernen darf ausschliesslich ein Eigentuemer des betroffenen
-- Haushalts. Die Sonderregel "nicht der letzte Eigentuemer" steht
-- bewusst NICHT hier, sondern im Trigger: eine Richtlinie wuerde die
-- Zeile nur stillschweigend herausfiltern (0 rows deleted, keine
-- Fehlermeldung), der Trigger liefert dagegen eine Meldung, die die
-- Oberflaeche anzeigen kann.
create policy household_members_delete_owner
  on public.household_members
  for delete
  to authenticated
  using (household_id in (select private.owned_household_ids()));


-- --- household_invites -------------------------------------------------

-- Nur Lesen, und nur fuer Mitglieder. Dass dabei token_hash sichtbar
-- wird, ist unkritisch: aus dem SHA-256 eines 192-Bit-Zufallswerts
-- laesst sich der Klartext nicht zurueckrechnen.
-- Schreibende Zugriffe haben weder Recht noch Richtlinie und laufen
-- ausschliesslich ueber die Funktionen in Migration 3.
create policy household_invites_select_member
  on public.household_invites
  for select
  to authenticated
  using (household_id in (select private.current_household_ids()));
