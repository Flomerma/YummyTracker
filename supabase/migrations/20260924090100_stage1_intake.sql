-- =====================================================================
-- Stufe 1 / 2 von 4 : Eingang
-- =====================================================================
-- Konzept Abschnitt 5.4 und 4.1: Tippen, Barcode, Bon-Foto und die
-- abgehakte Einkaufsliste erzeugen ALLE denselben Entwurf mit Zeilen.
-- Erst das Bestaetigen macht daraus Bestand (Migration 4).
--
-- Diese Migration steht vor dem Vorrat, weil inventory_items.intake_line_id
-- auf intake_lines zeigt.
--
-- raw_payload und raw_text bewahren die Rohausgabe der Erkennung auf.
-- Das ist kein Beiwerk: es ist die Grundlage, um in Stufe 6 messen zu
-- koennen, wie gut die Bon-Erkennung arbeitet. Beide Spalten werden
-- deshalb auch dann nicht geloescht, wenn ein Entwurf verworfen wird.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. intake_batches
-- ---------------------------------------------------------------------

create table public.intake_batches (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null
                           references public.households (id) on delete cascade,
  source       text        not null default 'manual',
  status       text        not null default 'draft',
  -- Pfad in der Supabase-Dateiablage, nicht der Bon selbst.
  receipt_path text,
  -- Rohausgabe der Erkennung, unveraendert. jsonb statt json: gleicher
  -- Platzbedarf beim Lesen, und spaetere Auswertungen koennen Felder
  -- gezielt herausgreifen, ohne den Text neu zu parsen.
  raw_payload  jsonb,
  created_by   uuid        default auth.uid()
                           references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now(),

  constraint intake_batches_source_check
    check (source in ('manual', 'barcode', 'receipt', 'shopping_list')),

  constraint intake_batches_status_check
    check (status in ('draft', 'confirmed', 'discarded')),

  -- Aequivalenz statt zweier Einzelbedingungen: ein bestaetigter Stapel
  -- hat immer einen Zeitpunkt, ein unbestaetigter nie einen.
  constraint intake_batches_confirmed_state
    check ((status = 'confirmed') = (confirmed_at is not null))
);

comment on table public.intake_batches is
  'Ein Eingangs-Entwurf. Konzept 4.1: alle Erfassungswege muenden hier und werden gemeinsam bestaetigt.';
comment on column public.intake_batches.raw_payload is
  'Unveraenderte Rohausgabe der Erkennung. Messgrundlage fuer die Qualitaet der Bon-Erkennung.';
comment on column public.intake_batches.status is
  'draft = in Arbeit, confirmed = zu Bestand geworden, discarded = verworfen (bleibt als Messdatum stehen).';

-- Der Bildschirm "Erfassen" zeigt die offenen Entwuerfe eines Haushalts,
-- neueste zuerst.
create index intake_batches_open_idx
  on public.intake_batches (household_id, created_at desc)
  where status = 'draft';

create index intake_batches_household_created_idx
  on public.intake_batches (household_id, created_at desc);

create trigger intake_batches_set_updated_at
  before update on public.intake_batches
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. intake_lines
-- ---------------------------------------------------------------------
-- Kein eigenes household_id: die Zugehoerigkeit haengt am Stapel, und
-- zwei Quellen fuer dieselbe Wahrheit koennen auseinanderlaufen. Die
-- Richtlinien loesen das ueber eine Hilfsfunktion (Abschnitt 4).

create table public.intake_lines (
  id                   uuid    primary key default gen_random_uuid(),
  batch_id             uuid    not null
                               references public.intake_batches (id) on delete cascade,
  position             integer,
  -- Was der Erfassungsweg geliefert hat: Bonzeile, getippter Text,
  -- Name aus der Einkaufsliste. Bleibt auch nach dem Zuordnen stehen.
  raw_text             text,
  product_id           uuid    references public.products (id) on delete set null,
  match_confidence     numeric(4, 3),
  quantity             numeric(12, 3) not null default 1,
  unit                 text    not null default 'piece',
  price_chf            numeric(10, 2),
  storage              text,
  suggested_expires_at date,
  expiry_source        text    not null default 'none',
  -- Der Pruef-Schritt haekelt Zeilen ab. Nur angenommene Zeilen werden
  -- beim Bestaetigen zu Bestand; abgelehnte bleiben als Messdatum stehen.
  accepted             boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint intake_lines_batch_position_key unique (batch_id, position),

  constraint intake_lines_position_check
    check (position is null or position >= 0),

  -- Eine Zeile muss benennbar sein, sonst laesst sich beim Bestaetigen
  -- kein display_name bilden. Die Bedingung haengt bewusst NUR an
  -- raw_text und nicht zusaetzlich an product_id: waere sie als
  -- "product_id oder raw_text" formuliert, koennte das Loeschen eines
  -- Produkts sie verletzen - der Fremdschluessel setzt product_id dann
  -- auf NULL, und eine Zeile ohne Rohtext stuende plotzlich ohne Namen
  -- da. Das Loeschen eines Haushalts (Kaskade auf dessen Produkte)
  -- wuerde daran scheitern. Stattdessen fuellt der Trigger unten
  -- raw_text notfalls aus dem Produktnamen.
  constraint intake_lines_has_a_subject
    check (btrim(coalesce(raw_text, '')) <> ''),

  constraint intake_lines_raw_text_length
    check (raw_text is null or char_length(raw_text) <= 400),

  constraint intake_lines_match_confidence_range
    check (match_confidence is null or match_confidence between 0 and 1),

  constraint intake_lines_quantity_positive
    check (quantity > 0),

  constraint intake_lines_unit_check
    check (unit in ('piece', 'g', 'ml')),

  constraint intake_lines_price_check
    check (price_chf is null or price_chf >= 0),

  constraint intake_lines_storage_check
    check (storage is null or storage in ('pantry', 'fridge', 'freezer')),

  constraint intake_lines_expiry_source_check
    check (expiry_source in ('label', 'learned', 'catalog', 'category',
                             'ai', 'manual', 'none')),

  -- computeExpiry() liefert genau dann 'none', wenn kein Datum bestimmt
  -- werden konnte. Die Aequivalenz haelt Datum und Herkunft zusammen.
  constraint intake_lines_expiry_source_matches_date
    check ((suggested_expires_at is null) = (expiry_source = 'none'))
);

comment on table public.intake_lines is
  'Zeilen eines Eingangs-Entwurfs. Vorschlagswerte, die im Pruef-Schritt geaendert werden koennen.';
comment on column public.intake_lines.raw_text is
  'Rohausgabe je Zeile. Zusammen mit raw_payload die Messgrundlage der Bon-Erkennung.';
comment on column public.intake_lines.match_confidence is
  'Sicherheitsmass von matchProduct(), 0 bis 1. NULL = nicht automatisch zugeordnet.';
comment on column public.intake_lines.accepted is
  'Nur angenommene Zeilen werden beim Bestaetigen zu Bestandsartikeln.';

-- Der unique-Index auf (batch_id, position) bedient zugleich das Laden
-- eines Entwurfs in Reihenfolge. Ein weiterer Index auf batch_id waere
-- doppelt.
create index intake_lines_product_id_idx
  on public.intake_lines (product_id)
  where product_id is not null;


-- ---------------------------------------------------------------------
-- 3. Trigger auf intake_lines
-- ---------------------------------------------------------------------

-- 3a. Position fortlaufend vergeben, wenn keine angegeben ist.
-- Der Client soll nicht erst die hoechste Position abfragen muessen, nur
-- um eine Zeile anzuhaengen. NOT NULL waere hier falsch: die Spalte wird
-- erst vom Trigger gefuellt.
create or replace function private.intake_lines_assign_position()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(l.position), 0) + 1
      into new.position
      from public.intake_lines l
     where l.batch_id = new.batch_id;
  end if;
  return new;
end;
$$;

create trigger intake_lines_assign_position
  before insert on public.intake_lines
  for each row execute function private.intake_lines_assign_position();

-- 3b. Produktbezug pruefen und den Rohtext notfalls fuellen.
--
-- Zwei Aufgaben, ein Trigger, weil beide dasselbe Produkt lesen:
--
--   * Das Produkt muss global oder haushaltseigen sein. Der
--     Fremdschluessel prueft nur die Existenz. Ohne diese Pruefung
--     koennte eine erratene Produktkennung eines fremden Haushalts in
--     den eigenen Eingang - und beim Bestaetigen in den eigenen Bestand -
--     wandern (Ebene 1 aus Konzept 7.4).
--
--   * Ist kein Rohtext angegeben (Barcode-Scan, Uebernahme aus der
--     Einkaufsliste), tritt der Produktname an seine Stelle. Damit
--     traegt jede Zeile dauerhaft ihren eigenen Namen, unabhaengig
--     davon, was spaeter mit dem Katalogeintrag geschieht.
--
-- SECURITY DEFINER, damit die Pruefung "existiert, gehoert aber jemand
-- anderem" moeglich ist - die SELECT-Richtlinie auf products verbirgt
-- fremde Zeilen sonst schon vorher.
create or replace function private.intake_lines_resolve_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_name         text;
begin
  if new.product_id is null then
    return new;
  end if;

  select b.household_id into v_household_id
    from public.intake_batches b
   where b.id = new.batch_id;

  if not private.product_usable_by_household(new.product_id, v_household_id) then
    raise exception 'Das Produkt gehoert einem anderen Haushalt.'
      using errcode = '42501', detail = 'product_not_visible';
  end if;

  if btrim(coalesce(new.raw_text, '')) = '' then
    select p.name into v_name
      from public.products p
     where p.id = new.product_id;
    new.raw_text := v_name;
  end if;

  return new;
end;
$$;

create trigger intake_lines_resolve_product
  before insert or update on public.intake_lines
  for each row execute function private.intake_lines_resolve_product();

create trigger intake_lines_set_updated_at
  before update on public.intake_lines
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Hilfsfunktionen fuer die Richtlinien
-- ---------------------------------------------------------------------
-- Gleiche Machart wie private.current_household_ids() aus Stufe 0:
-- mengenwertig, stable, security definer, search_path leer. In den
-- Richtlinien dann "batch_id in (select private.xyz())" - die Funktion
-- haengt nicht von Zeilendaten ab und wird einmal pro Anweisung
-- ausgewertet statt einmal pro Zeile.

-- Alle Stapel der eigenen Haushalte, unabhaengig vom Status.
create or replace function private.current_intake_batch_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select b.id
  from public.intake_batches b
  where b.household_id in (select private.current_household_ids())
$$;

-- Nur die Entwuerfe. Ein bestaetigter oder verworfener Stapel ist
-- Geschichte: seine Zeilen sind die Herkunftsangabe der daraus
-- entstandenen Bestandsartikel und duerfen sich nicht mehr aendern.
create or replace function private.editable_intake_batch_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select b.id
  from public.intake_batches b
  where b.status = 'draft'
    and b.household_id in (select private.current_household_ids())
$$;

comment on function private.editable_intake_batch_ids() is
  'Entwuerfe der eigenen Haushalte. Nur deren Zeilen sind aenderbar.';

revoke all on function private.current_intake_batch_ids()  from public;
revoke all on function private.editable_intake_batch_ids() from public;

grant execute on function private.current_intake_batch_ids()
  to authenticated, service_role;
grant execute on function private.editable_intake_batch_ids()
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. Rechte auf Tabellenebene
-- ---------------------------------------------------------------------

revoke all on table public.intake_batches from anon, authenticated;
revoke all on table public.intake_lines   from anon, authenticated;

-- intake_batches: lesen und anlegen. KEIN UPDATE auf status und
-- confirmed_at - der Uebergang nach 'confirmed' darf nur zusammen mit
-- den entstehenden Bestandsartikeln geschehen und laeuft deshalb
-- ausschliesslich ueber confirm_intake_batch() (Migration 4). Waere
-- update(status) vergeben, koennte ein Client einen Stapel als
-- bestaetigt markieren, ohne dass ein einziger Artikel entsteht.
--
-- KEIN DELETE: raw_payload ist Messgrundlage. Wegwerfen heisst
-- discard_intake_batch(), nicht loeschen.
grant select on table public.intake_batches to authenticated;
grant insert (household_id, source, receipt_path, raw_payload)
  on table public.intake_batches to authenticated;
grant update (source, receipt_path, raw_payload)
  on table public.intake_batches to authenticated;

-- intake_lines: der Pruef-Schritt bearbeitet die Zeilen frei, solange
-- der Stapel ein Entwurf ist. DELETE ist hier anders als beim Stapel
-- vergeben: eine versehentlich getippte Zeile soll spurlos verschwinden
-- koennen. Die Rohausgabe der Erkennung bleibt in raw_payload am Stapel
-- erhalten, die Messgrundlage geht also nicht verloren.
grant select, delete on table public.intake_lines to authenticated;
grant insert (batch_id, position, raw_text, product_id, match_confidence,
              quantity, unit, price_chf, storage, suggested_expires_at,
              expiry_source, accepted)
  on table public.intake_lines to authenticated;
grant update (position, raw_text, product_id, match_confidence,
              quantity, unit, price_chf, storage, suggested_expires_at,
              expiry_source, accepted)
  on table public.intake_lines to authenticated;


-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------

alter table public.intake_batches enable row level security;
alter table public.intake_lines   enable row level security;

-- --- intake_batches ----------------------------------------------------

create policy intake_batches_select_member
  on public.intake_batches
  for select
  to authenticated
  using (household_id in (select private.current_household_ids()));

create policy intake_batches_insert_member
  on public.intake_batches
  for insert
  to authenticated
  with check (household_id in (select private.current_household_ids()));

-- Nur Entwuerfe sind aenderbar, und der Stapel darf den Haushalt nicht
-- wechseln (beide Seiten der Bedingung pruefen die Zugehoerigkeit).
create policy intake_batches_update_draft
  on public.intake_batches
  for update
  to authenticated
  using      (status = 'draft'
              and household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));

-- --- intake_lines ------------------------------------------------------

create policy intake_lines_select_member
  on public.intake_lines
  for select
  to authenticated
  using (batch_id in (select private.current_intake_batch_ids()));

create policy intake_lines_insert_draft
  on public.intake_lines
  for insert
  to authenticated
  with check (batch_id in (select private.editable_intake_batch_ids()));

create policy intake_lines_update_draft
  on public.intake_lines
  for update
  to authenticated
  using      (batch_id in (select private.editable_intake_batch_ids()))
  with check (batch_id in (select private.editable_intake_batch_ids()));

create policy intake_lines_delete_draft
  on public.intake_lines
  for delete
  to authenticated
  using (batch_id in (select private.editable_intake_batch_ids()));
