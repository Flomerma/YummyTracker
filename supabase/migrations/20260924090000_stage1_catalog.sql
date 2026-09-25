-- =====================================================================
-- Stufe 1 / 1 von 4 : Gemeinsamer Katalog
-- =====================================================================
-- Konzept Abschnitt 5.2 (categories, products, shelf_life_rules) und 7.4
-- ("Der Katalog ist global lesbar, aber nur serverseitig schreibbar").
--
-- Reihenfolge der vier Stufe-1-Migrationen:
--   1 Katalog    <- hier
--   2 Eingang    (intake_batches, intake_lines)
--   3 Vorrat     (inventory_items; zeigt per Fremdschluessel auf intake_lines)
--   4 Bestaetigen (confirm_intake_batch)
-- Der Eingang steht vor dem Vorrat, obwohl das Konzept ihn danach
-- beschreibt: inventory_items.intake_line_id braucht intake_lines bereits.
--
-- Machart wie in Stufe 0:
--   * Kommentare deutsch, Bezeichner englisch
--   * Aufzaehlungen als text + CHECK, nicht als Postgres-Enum. Ein weiterer
--     Wert ist damit eine Migration von einer Zeile, ohne ALTER TYPE.
--   * erst "revoke all", dann gezielt vergeben; Spaltenrechte wo noetig
--   * keine "create extension": gen_random_uuid() liegt seit PG 13 im Kern
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. categories
-- ---------------------------------------------------------------------
-- Rein global. Eine Kategorie gehoert keinem Haushalt: sie ist das
-- Auffangnetz der Haltbarkeits-Kette aus Konzept 4.3 und muss deshalb
-- fuer alle dieselbe Bedeutung haben.

create table public.categories (
  id         uuid        primary key default gen_random_uuid(),
  slug       text        not null,
  name       text        not null,
  -- Reihenfolge in der Auswahlliste. Luecken sind erwuenscht, damit sich
  -- eine Kategorie spaeter dazwischenschieben laesst, ohne alle anderen
  -- neu zu nummerieren.
  sort_order integer     not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_slug_key unique (slug),

  -- Der Slug ist der stabile Bezeichner, an dem der Startkatalog und
  -- spaetere Nachlieferungen haengen. Deshalb ein enges Format.
  constraint categories_slug_format
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),

  constraint categories_name_length
    check (char_length(btrim(name)) between 1 and 80)
);

comment on table public.categories is
  'Produktkategorien. Global, ohne Haushaltsbezug - letzte Stufe der Haltbarkeits-Kette.';
comment on column public.categories.sort_order is
  'Sortierung in Auswahllisten. Kleiner zuerst.';

create index categories_sort_order_idx
  on public.categories (sort_order, name);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 2. products
-- ---------------------------------------------------------------------
-- household_id ist nullable: leer = global, gesetzt = gehoert diesem
-- Haushalt. Konzept 5.2 legt dazu eine Regel fest, die hier als
-- Bedingung steht statt nur als Absicht:
--
--   "Eintraege aus dem Startkatalog, aus der Produktdatenbank und aus
--    KI-Schaetzungen sind global. Von Nutzern selbst angelegte Produkte
--    bleiben dauerhaft beim eigenen Haushalt."
--
-- Daraus folgt eine Aequivalenz: source = 'user'  <->  household_id
-- gesetzt. Sie steht als CHECK in der Tabelle und gilt damit auch fuer
-- den allmaechtigen Schluessel. Eine automatische Befoerderung ins
-- Globale ist so nicht nur nicht gebaut, sondern ausgeschlossen: wer
-- befoerdern will, muss beide Spalten zugleich aendern und damit
-- bewusst behaupten, der Eintrag stamme nicht mehr vom Nutzer.

create table public.products (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  -- Ergebnis von normalizeName() aus lib/domain. Die Datenbank rechnet
  -- das NICHT nach: die Funktion ist die stille Schluesselfunktion des
  -- Projekts (Konzept 6) und darf genau eine Implementierung haben.
  normalized_name text        not null,
  category_id     uuid        references public.categories (id) on delete set null,
  brand           text,
  ean             text,
  default_unit    text        not null default 'piece',
  default_storage text,
  image_url       text,
  source          text        not null default 'user',
  verified        boolean     not null default false,
  household_id    uuid        references public.households (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        default auth.uid()
                              references auth.users (id) on delete set null,

  constraint products_name_length
    check (char_length(btrim(name)) between 1 and 160),

  -- Grobpruefung, kein Ersatz fuer normalizeName(): kleingeschrieben,
  -- ohne Rand- und Doppelleerzeichen. Faengt den haeufigsten Fehler ab,
  -- naemlich den Rohnamen versehentlich in beide Spalten zu schreiben.
  constraint products_normalized_name_shape
    check (normalized_name = lower(btrim(normalized_name))
           and char_length(normalized_name) between 1 and 160
           and normalized_name !~ '\s\s'),

  constraint products_default_unit_check
    check (default_unit in ('piece', 'g', 'ml')),

  constraint products_default_storage_check
    check (default_storage is null
           or default_storage in ('pantry', 'fridge', 'freezer')),

  constraint products_source_check
    check (source in ('seed', 'off', 'ai', 'user')),

  -- EAN-8 bis GTIN-14, nur Ziffern. Haelt Freitext aus der Scan-Strecke
  -- (Stufe 5) aus der Spalte heraus, ueber die spaeter gesucht wird.
  constraint products_ean_format
    check (ean is null or ean ~ '^[0-9]{8,14}$'),

  constraint products_brand_length
    check (brand is null or char_length(btrim(brand)) between 1 and 80),

  -- Konzept 5.2: keine automatische Befoerderung ins Globale.
  constraint products_scope_matches_source
    check ((source = 'user') = (household_id is not null))
);

comment on table public.products is
  'Produktkatalog. household_id leer = global, gesetzt = nur fuer diesen Haushalt.';
comment on column public.products.normalized_name is
  'Ergebnis von normalizeName() aus lib/domain. Vergleichsschluessel gegen Dubletten.';
comment on column public.products.source is
  'Herkunft: seed = Startkatalog, off = Produktdatenbank, ai = KI-Schaetzung, user = selbst angelegt.';
comment on column public.products.household_id is
  'Leer = global. Gesetzt = gehoert diesem Haushalt und wird nie befoerdert (Konzept 5.2).';
comment on constraint products_scope_matches_source on public.products is
  'Konzept 5.2: nur source = user ist haushaltseigen, alles andere ist global.';

-- Dubletten unter den globalen Eintraegen sind ein Fehler: der Katalog
-- soll ueber alle Haushalte hinweg genau eine Zeile je Ware fuehren.
create unique index products_global_normalized_name_key
  on public.products (normalized_name)
  where household_id is null;

-- Innerhalb eines Haushalts ebenso. Ein haushaltseigener Eintrag darf
-- dagegen denselben Namen tragen wie ein globaler - der Haushalt hat
-- dann bewusst eine eigene Variante angelegt.
create unique index products_household_normalized_name_key
  on public.products (household_id, normalized_name)
  where household_id is not null;

-- Treibende Abfrage von matchProduct(): Kandidaten zu einem Namen ueber
-- global UND eigenen Haushalt hinweg. Die beiden Unique-Indizes decken
-- je nur eine Haelfte ab, dieser deckt beide in einem Scan.
create index products_normalized_name_idx
  on public.products (normalized_name);

-- Ein Barcode zeigt global auf genau ein Produkt (Stufe 5).
create unique index products_global_ean_key
  on public.products (ean)
  where household_id is null and ean is not null;

create index products_ean_idx
  on public.products (ean)
  where ean is not null;

-- "Alle eigenen Produkte dieses Haushalts" in der Katalogpflege.
create index products_household_id_idx
  on public.products (household_id)
  where household_id is not null;

create index products_category_id_idx
  on public.products (category_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 3. shelf_life_rules
-- ---------------------------------------------------------------------
-- Die Fallback-Kette aus Konzept 4.3 als Daten:
--
--   Haushalt + Produkt -> Produkt global -> Kategorie -> KI-Schaetzung
--
-- Die Aufloesung selbst passiert NICHT hier, sondern in
-- lib/domain/resolve-shelf-life.ts. Die Datenbank liefert nur die
-- Kandidatenzeilen; das Ranking ist Fachlogik und gehoert damit in die
-- Schicht, die ohne laufende Datenbank testbar ist (Konzept 7.1).
--
-- Die Spalten entsprechen eins zu eins dem Typ ShelfLifeRule in
-- lib/domain/types.ts:
--   id, scope, product_id, category_id, storage, days_unopened,
--   days_opened, household_id, source, sample_count, updated_at.
-- storage NULL bedeutet dort "gilt fuer jeden Lagerort" - deshalb ist
-- die Spalte hier bewusst nullable und nicht mit einem Ersatzwert
-- belegt.

create table public.shelf_life_rules (
  id            uuid        primary key default gen_random_uuid(),
  scope         text        not null,
  product_id    uuid        references public.products (id) on delete cascade,
  category_id   uuid        references public.categories (id) on delete cascade,
  storage       text,
  days_unopened integer,
  days_opened   integer,
  household_id  uuid        references public.households (id) on delete cascade,
  source        text        not null default 'seed',
  sample_count  integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint shelf_life_rules_scope_check
    check (scope in ('product', 'category')),

  constraint shelf_life_rules_source_check
    check (source in ('seed', 'ai', 'learned')),

  constraint shelf_life_rules_storage_check
    check (storage is null or storage in ('pantry', 'fridge', 'freezer')),

  -- Genau ein Bezug, passend zum scope. Ohne diese Bedingung koennte
  -- eine Zeile beides oder nichts setzen, und resolveShelfLife() wuerde
  -- sie stillschweigend uebergehen.
  constraint shelf_life_rules_subject_matches_scope
    check ((scope = 'product'  and product_id  is not null and category_id is null)
        or (scope = 'category' and category_id is not null and product_id  is null)),

  -- isUsableDays() in lib/domain akzeptiert nur ganze Tage ab 0. Die
  -- Obergrenze faengt Ausreisser einer KI-Schaetzung ab.
  constraint shelf_life_rules_days_unopened_range
    check (days_unopened is null or days_unopened between 0 and 3650),
  constraint shelf_life_rules_days_opened_range
    check (days_opened   is null or days_opened   between 0 and 3650),

  -- Eine Zeile ohne beide Werte traegt keine Information.
  constraint shelf_life_rules_has_a_value
    check (days_unopened is not null or days_opened is not null),

  constraint shelf_life_rules_sample_count_check
    check (sample_count >= 0),

  -- Gelernt wird ausschliesslich haushaltseigen (Konzept 5.2/5.3:
  -- "Eine bestehende globale Zeile wird dabei nie veraendert").
  constraint shelf_life_rules_learned_is_household
    check (source <> 'learned' or household_id is not null)
);

comment on table public.shelf_life_rules is
  'Haltbarkeiten als Daten. Die Kette aus Konzept 4.3 wird in lib/domain aufgeloest, nicht in SQL.';
comment on column public.shelf_life_rules.storage is
  'NULL = gilt fuer jeden Lagerort. Eine Zeile mit Lagerort schlaegt eine ohne.';
comment on column public.shelf_life_rules.sample_count is
  'Zahl der Beobachtungen hinter einer gelernten Regel (Konzept 5.2).';

-- Je Bezug, Lagerort und Eigentuemer hoechstens eine Zeile. Sonst
-- entstuenden zwei gleich genaue Regeln, und resolveShelfLife() muesste
-- den Gleichstand ueber sample_count und updated_at brechen - moeglich,
-- aber nichts, worauf sich die Anwendung stuetzen sollte.
--
-- Warum coalesce statt eines einfachen unique(...): in einem Unique-Index
-- gelten zwei NULL als verschieden. "Produkt X, jeder Lagerort, global"
-- liesse sich damit beliebig oft anlegen. NULLS NOT DISTINCT gibt es
-- erst ab PostgreSQL 15; die lokale Pruefkette laeuft auf 14. Die
-- Ersatzwerte sind sicher: 'any' ist kein gueltiger Lagerort (CHECK
-- oben), und gen_random_uuid() liefert nie die Null-UUID.
create unique index shelf_life_rules_product_key
  on public.shelf_life_rules (
    product_id,
    coalesce(storage, 'any'),
    coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where scope = 'product';

create unique index shelf_life_rules_category_key
  on public.shelf_life_rules (
    category_id,
    coalesce(storage, 'any'),
    coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where scope = 'category';

-- Die beiden Unique-Indizes beginnen mit product_id bzw. category_id und
-- bedienen damit zugleich die Kandidatenabfrage von resolveShelfLife
-- ("alle Regeln zu diesem Produkt / dieser Kategorie"). Ein zusaetzlicher
-- Index darauf waere doppelt und bleibt deshalb weg.
--
-- Was sie nicht bedienen, ist die Lernstrecke aus Stufe 2: "hat dieser
-- Haushalt schon eigene Regeln?".
create index shelf_life_rules_household_id_idx
  on public.shelf_life_rules (household_id)
  where household_id is not null;

create trigger shelf_life_rules_set_updated_at
  before update on public.shelf_life_rules
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. Hilfsfunktion: darf ein Haushalt dieses Produkt verwenden?
-- ---------------------------------------------------------------------
-- Gebraucht von den Triggern auf intake_lines und inventory_items
-- (Migrationen 2 und 3). Ein Fremdschluessel prueft nur, DASS das
-- Produkt existiert - nicht, dass es zu diesem Haushalt gehoert. Ohne
-- diese Pruefung koennte eine erratene Produktkennung eines fremden
-- Haushalts in den eigenen Bestand wandern.
--
-- SECURITY DEFINER, weil die Trigger auch dann greifen muessen, wenn die
-- SELECT-Richtlinie auf products die fremde Zeile ohnehin verbirgt: die
-- Funktion soll "existiert, gehoert aber jemand anderem" von "existiert
-- nicht" unterscheiden koennen.

create or replace function private.product_usable_by_household(
  p_product_id   uuid,
  p_household_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_product_id is null
      or exists (
           select 1
           from public.products p
           where p.id = p_product_id
             and (p.household_id is null or p.household_id = p_household_id)
         )
$$;

comment on function private.product_usable_by_household(uuid, uuid) is
  'Wahr, wenn das Produkt global ist oder diesem Haushalt gehoert. NULL gilt als erlaubt.';

revoke all on function private.product_usable_by_household(uuid, uuid) from public;
grant execute on function private.product_usable_by_household(uuid, uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. Rechte auf Tabellenebene
-- ---------------------------------------------------------------------
-- Der Katalog ist aus dem Browser NUR LESBAR (Konzept 7.4). Geschrieben
-- wird er ausschliesslich serverseitig: Startkatalog per Seed,
-- Produktdatenbank in Stufe 5, KI-Schaetzung in Stufe 1/2 - alles ueber
-- service_role, das die Vorgaberechte behaelt.
--
-- Das ist kein Misstrauen gegen die Oberflaeche, sondern die Absicherung
-- der Katalogqualitaet: haette der Client INSERT, koennte ein Fehler in
-- der Erfassungsmaske Tippfehler ueber alle Haushalte verteilen - genau
-- das Risiko, das Konzept 5.2 mit dem Verzicht auf die automatische
-- Befoerderung vermeidet.

revoke all on table public.categories        from anon, authenticated;
revoke all on table public.products          from anon, authenticated;
revoke all on table public.shelf_life_rules  from anon, authenticated;

grant select on table public.categories       to authenticated;
grant select on table public.products         to authenticated;
grant select on table public.shelf_life_rules to authenticated;


-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
-- Auch die rein globale Tabelle categories bekommt RLS. Ohne sie waere
-- sie die einzige Tabelle in public ohne Richtlinie - ein Sonderfall,
-- den man bei jeder spaeteren Pruefung neu erklaeren muesste.

alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.shelf_life_rules enable row level security;

create policy categories_select_authenticated
  on public.categories
  for select
  to authenticated
  using (true);

-- Global lesbar plus die eigenen haushaltseigenen Zeilen. Produkte
-- anderer Haushalte sind unsichtbar - sonst waere ueber den Katalog
-- ablesbar, was ein fremder Haushalt einkauft.
create policy products_select_global_or_member
  on public.products
  for select
  to authenticated
  using (
    household_id is null
    or household_id in (select private.current_household_ids())
  );

create policy shelf_life_rules_select_global_or_member
  on public.shelf_life_rules
  for select
  to authenticated
  using (
    household_id is null
    or household_id in (select private.current_household_ids())
  );

-- Keine INSERT-, UPDATE- oder DELETE-Richtlinien: ohne Tabellenrecht
-- waeren sie wirkungslos, und ihr Fehlen macht die Absicht aus
-- Abschnitt 5 auch beim Lesen der Richtlinien sichtbar.
