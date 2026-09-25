-- =====================================================================
-- Stufe 1 / 3 von 4 : Vorrat
-- =====================================================================
-- Konzept Abschnitt 5.3. Die drei dort begruendeten Entscheidungen
-- stehen hier nicht nur als Spalten, sondern als Rechte und Trigger:
--
--   1. NICHTS WIRD GELOESCHT. Erledigte Artikel bekommen status und
--      resolved_at und bleiben stehen - sonst gaebe es keine Auswertung
--      (Stufe 4, der Wirkungsnachweis der Arbeit). Durchgesetzt wird das
--      nicht ueber eine Richtlinie, sondern indem DELETE gar nicht erst
--      vergeben wird. Was nicht vergeben ist, kann auch bei fehlerhafter
--      Richtlinie nicht passieren.
--
--   2. display_name IST EIN SCHNAPPSCHUSS. Deshalb not null und vom
--      Produkt unabhaengig: benennt jemand spaeter den Katalogeintrag um,
--      bleibt die Historie so, wie sie damals war. product_id steht
--      daneben und faellt beim Loeschen des Produkts auf NULL, ohne den
--      Artikel zu beschaedigen.
--
--   3. expiry_source WIRD MITGEFUEHRT, damit die Oberflaeche
--      unterscheiden kann, ob ein Datum abgelesen oder geschaetzt wurde.
--      Geschaetzte Daten duerfen weicher gewarnt werden (Konzept 14).
--
-- Dazu der WG-Haken aus Konzept 4.5: owner_id existiert von Anfang an,
-- bleibt in Stufe 1 aber leer. Das leere Feld kostet nichts und erspart
-- spaeter den Umbau. Es ist bewusst NICHT beschreibbar (kein Spaltenrecht),
-- solange es keine Oberflaeche dafuer gibt - sonst entstuenden Daten, die
-- niemand sieht und die niemand pflegt.
--
-- Datumsspalten: expires_at und opened_at sind date, nicht timestamptz.
-- Sie sind Kalendertatsachen ("haltbar bis 5. Maerz"), keine Zeitpunkte.
-- lib/domain rechnet durchgaengig mit 'YYYY-MM-DD'-Zeichenketten und
-- begruendet das in types.ts; date ist die Entsprechung dazu. Echte
-- Zeitpunkte (added_at, resolved_at) bleiben timestamptz.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. inventory_items
-- ---------------------------------------------------------------------

create table public.inventory_items (
  id             uuid        primary key default gen_random_uuid(),
  household_id   uuid        not null
                             references public.households (id) on delete cascade,
  product_id     uuid        references public.products (id) on delete set null,
  display_name   text        not null,
  quantity       numeric(12, 3) not null default 1,
  unit           text        not null default 'piece',
  storage        text,
  expires_at     date,
  expiry_source  text        not null default 'none',
  opened_at      date,
  price_chf      numeric(10, 2),
  -- WG-Haken (Konzept 4.5). Leer im MVP.
  owner_id       uuid        references auth.users (id) on delete set null,
  note           text,
  status         text        not null default 'active',
  resolved_at    timestamptz,
  resolved_by    uuid        references auth.users (id) on delete set null,
  added_at       timestamptz not null default now(),
  added_by       uuid        default auth.uid()
                             references auth.users (id) on delete set null,
  intake_line_id uuid        references public.intake_lines (id) on delete set null,
  updated_at     timestamptz not null default now(),

  constraint inventory_items_display_name_length
    check (char_length(btrim(display_name)) between 1 and 160),

  constraint inventory_items_quantity_positive
    check (quantity > 0),

  constraint inventory_items_unit_check
    check (unit in ('piece', 'g', 'ml')),

  constraint inventory_items_storage_check
    check (storage is null or storage in ('pantry', 'fridge', 'freezer')),

  constraint inventory_items_expiry_source_check
    check (expiry_source in ('label', 'learned', 'catalog', 'category',
                             'ai', 'manual', 'none')),

  -- computeExpiry() liefert genau dann 'none', wenn kein Datum bestimmt
  -- werden konnte, und nie 'none' zusammen mit einem Datum. Die
  -- Aequivalenz haelt beides zusammen; ohne sie waere eine Zeile
  -- moeglich, die bucketUrgency() als "unbekannt" einstuft, obwohl ein
  -- Datum dasteht.
  constraint inventory_items_expiry_source_matches_date
    check ((expires_at is null) = (expiry_source = 'none')),

  constraint inventory_items_status_check
    check (status in ('active', 'consumed', 'discarded')),

  -- Erledigt heisst: Status ungleich 'active' UND ein Zeitpunkt dazu.
  -- Den Zeitpunkt setzt der Trigger unten, nicht der Client.
  constraint inventory_items_resolved_state
    check ((status = 'active') = (resolved_at is null)),

  constraint inventory_items_resolved_by_requires_resolved_at
    check (resolved_by is null or resolved_at is not null),

  constraint inventory_items_price_check
    check (price_chf is null or price_chf >= 0),

  constraint inventory_items_note_length
    check (note is null or char_length(note) <= 500)
);

comment on table public.inventory_items is
  'Der Vorrat. Nichts wird geloescht - erledigte Artikel bleiben mit status und resolved_at stehen.';
comment on column public.inventory_items.display_name is
  'Schnappschuss des Namens beim Erfassen. Eine spaetere Umbenennung im Katalog verfaelscht die Historie nicht.';
comment on column public.inventory_items.expiry_source is
  'Herkunft des Ablaufdatums. Nicht-label-Daten sind Schaetzungen und werden weicher gewarnt.';
comment on column public.inventory_items.owner_id is
  'WG-Haken aus Konzept 4.5. Bleibt in Stufe 1 leer und ist aus dem Browser nicht beschreibbar.';
comment on column public.inventory_items.intake_line_id is
  'Herkunft: die Eingangszeile, aus der dieser Artikel entstanden ist.';


-- ---------------------------------------------------------------------
-- 2. Indizes
-- ---------------------------------------------------------------------
-- Die Vorratsansicht ist der Startbildschirm und sortiert nach
-- Dringlichkeit statt alphabetisch (Konzept 3.3). Ihre Abfrage lautet
-- immer:
--
--   where household_id = $1 and status = 'active' order by expires_at
--
-- Gefiltert wird ausnahmslos nach household_id - RLS haengt daran, und
-- ohne fuehrende Spalte waere jeder Index nutzlos. Der Teilindex auf
-- status = 'active' haelt den Index klein: erledigte Artikel bleiben
-- zwar stehen, werden aber nie in dieser Ansicht gelesen.
--
-- expires_at ohne Zusatz sortiert aufsteigend mit NULLS LAST. Genau so
-- soll die Ansicht sortieren: was kein Datum hat, draengt nicht.
create index inventory_items_active_urgency_idx
  on public.inventory_items (household_id, expires_at)
  where status = 'active';

-- detectDuplicate() prueft einen neuen Listeneintrag gegen den Vorrat:
-- "liegt dieses Produkt schon da?".
create index inventory_items_active_product_idx
  on public.inventory_items (household_id, product_id)
  where status = 'active' and product_id is not null;

-- Die Auswertung aus Stufe 4: weggeworfen und gegessen ueber Zeit.
create index inventory_items_resolved_idx
  on public.inventory_items (household_id, resolved_at)
  where status <> 'active';

-- Eine Eingangszeile wird zu hoechstens einem Bestandsartikel. Der
-- unique-Index ist nicht nur Ordnung, sondern die Absicherung von
-- confirm_intake_batch(): ein zweiter Aufruf kann keine Doubletten
-- erzeugen, selbst wenn die Statuspruefung dort einmal ins Leere liefe.
create unique index inventory_items_intake_line_key
  on public.inventory_items (intake_line_id)
  where intake_line_id is not null;


-- ---------------------------------------------------------------------
-- 3. Trigger
-- ---------------------------------------------------------------------

-- 3a. resolved_at / resolved_by fuehren
-- Der Client setzt nur den Status ("gegessen"), die Datenbank haengt
-- Zeitpunkt und Person an. So bleibt die Bedingung
-- inventory_items_resolved_state erfuellbar, ohne dem Client Schreibrecht
-- auf resolved_at zu geben - sonst liesse sich die Auswertung faelschen.
create or replace function private.inventory_items_track_resolution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    -- Ein Artikel kann zurueckgeholt werden ("doch noch da").
    new.resolved_at := null;
    new.resolved_by := null;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status then
    new.resolved_at := now();
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
  end if;

  return new;
end;
$$;

comment on function private.inventory_items_track_resolution() is
  'Setzt resolved_at und resolved_by aus dem Status. Der Client schreibt diese Spalten nie selbst.';

create trigger inventory_items_track_resolution
  before insert or update on public.inventory_items
  for each row execute function private.inventory_items_track_resolution();

-- 3b. Produkt muss global oder haushaltseigen sein.
-- Begruendung wie bei intake_lines: der Fremdschluessel prueft nur die
-- Existenz, nicht die Zugehoerigkeit.
create or replace function private.inventory_items_check_product_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.product_id is not null
     and not private.product_usable_by_household(new.product_id, new.household_id) then
    raise exception 'Das Produkt gehoert einem anderen Haushalt.'
      using errcode = '42501', detail = 'product_not_visible';
  end if;

  return new;
end;
$$;

create trigger inventory_items_check_product_scope
  before insert or update of product_id, household_id on public.inventory_items
  for each row execute function private.inventory_items_check_product_scope();

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Rechte auf Tabellenebene
-- ---------------------------------------------------------------------
-- Nicht vergeben und damit unmoeglich, unabhaengig von jeder Richtlinie:
--   * DELETE          - nichts wird geloescht (Entscheidung 1 oben)
--   * household_id    - ein Artikel wechselt nie den Haushalt
--   * added_at/added_by, intake_line_id - Herkunft ist unveraenderlich
--   * resolved_at/resolved_by - setzt der Trigger
--   * owner_id        - WG-Haken, in Stufe 1 ohne Oberflaeche
--
-- product_id ist beim Einfuegen erlaubt, beim Aendern nicht: die
-- Zuordnung entsteht beim Erfassen. Sie nachtraeglich zu verschieben
-- wuerde den Schnappschuss display_name von seinem Produkt entkoppeln,
-- ohne dass die Oberflaeche das zeigen koennte.

revoke all on table public.inventory_items from anon, authenticated;

grant select on table public.inventory_items to authenticated;

grant insert (household_id, product_id, display_name, quantity, unit,
              storage, expires_at, expiry_source, opened_at, price_chf, note)
  on table public.inventory_items to authenticated;

grant update (display_name, quantity, unit, storage, expires_at,
              expiry_source, opened_at, price_chf, note, status)
  on table public.inventory_items to authenticated;


-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------

alter table public.inventory_items enable row level security;

create policy inventory_items_select_member
  on public.inventory_items
  for select
  to authenticated
  using (household_id in (select private.current_household_ids()));

create policy inventory_items_insert_member
  on public.inventory_items
  for insert
  to authenticated
  with check (household_id in (select private.current_household_ids()));

-- Alle Mitglieder sind gleichberechtigt (Konzept 3.4): wer den Artikel
-- erfasst hat, spielt keine Rolle. Beide Seiten pruefen die
-- Zugehoerigkeit, damit ein UPDATE die Zeile nicht aus dem eigenen
-- Haushalt herausschreiben kann - auch wenn das Spaltenrecht auf
-- household_id das bereits verhindert.
create policy inventory_items_update_member
  on public.inventory_items
  for update
  to authenticated
  using      (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));

-- Keine DELETE-Richtlinie. Siehe Abschnitt 4.
