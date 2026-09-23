-- =====================================================================
-- Stufe 0 / 1 von 3 : Kerntabellen des Haushalts
-- =====================================================================
-- Konzept Abschnitt 5.1 (households, household_members, household_invites)
--
-- Laufzeitvoraussetzungen (Supabase Cloud, PostgreSQL 15 oder 17):
--   * gen_random_uuid()  -> seit PG 13 im Kern (pg_catalog), kein pgcrypto
--   * sha256(bytea)      -> seit PG 11 im Kern (pg_catalog), kein pgcrypto
--   Deshalb enthaelt diese Migration bewusst kein "create extension".
--
-- Hinweis zu search_path = '' in allen Funktionen dieser Migrationsreihe:
--   pg_catalog liegt implizit immer zuvorderst im search_path und muss
--   nicht angegeben werden. Die pg_catalog-Praefixe weiter unten stehen
--   trotzdem dort, wo die Funktion sicherheitsrelevant ist (Hashing),
--   damit auch beim Lesen klar ist, dass nichts ueberschrieben werden kann.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Internes Schema fuer Hilfsfunktionen
-- ---------------------------------------------------------------------
-- Alles, was RLS-Richtlinien aufrufen, aber kein Client sehen soll, lebt
-- hier. Das Schema darf NIEMALS unter Settings > API > Exposed schemas
-- eingetragen werden.

create schema if not exists private;

comment on schema private is
  'Interne Hilfsfunktionen fuer RLS und Trigger. Nicht ueber die Data-API freigeben.';

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Generischer updated_at-Trigger
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE-UPDATE-Trigger: setzt updated_at auf die Transaktionszeit.';


-- ---------------------------------------------------------------------
-- 3. households
-- ---------------------------------------------------------------------
create table public.households (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  -- created_by ist bewusst nullable: wird ein Benutzerkonto geloescht,
  -- soll der Haushalt der uebrigen Mitglieder erhalten bleiben.
  -- Die INSERT-Richtlinie erzwingt fuer angemeldete Nutzer trotzdem,
  -- dass hier die eigene Benutzerkennung steht.
  created_by  uuid        default auth.uid()
                          references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint households_name_length
    check (char_length(btrim(name)) between 1 and 80)
);

comment on table public.households is
  'Ein Haushalt. Alle Vorratsdaten haengen spaeter an dieser Kennung.';

create index households_created_by_idx
  on public.households (created_by);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 4. household_members
-- ---------------------------------------------------------------------
-- role ist eine Textspalte mit CHECK statt eines Postgres-Enums:
-- ein weiterer Wert ist damit eine Migration von einer Zeile, ohne
-- ALTER TYPE und ohne Sonderbehandlung in der Typgenerierung.

create table public.household_members (
  household_id uuid        not null
                           references public.households (id) on delete cascade,
  user_id      uuid        not null
                           references auth.users (id) on delete cascade,
  role         text        not null default 'member',
  display_name text,
  joined_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint household_members_pkey primary key (household_id, user_id),

  constraint household_members_role_check
    check (role in ('owner', 'member')),

  constraint household_members_display_name_length
    check (display_name is null
           or char_length(btrim(display_name)) between 1 and 60)
);

comment on table public.household_members is
  'Zuordnung Nutzer <-> Haushalt. Einzige Quelle der Wahrheit fuer Zugriffsrechte.';
comment on column public.household_members.role is
  'owner = hat den Haushalt angelegt, darf Mitglieder entfernen und den Haushalt loeschen.';

-- Treibende Abfrage der RLS-Hilfsfunktionen: "welche Haushalte gehoeren
-- zu dieser Benutzerkennung?". Ohne diesen Index laeuft jede Richtlinie
-- auf einen Seq Scan.
create index household_members_user_id_idx
  on public.household_members (user_id);

-- Fuer die Eigentuemer-Pruefung und die Zaehlung der Eigentuemer.
create index household_members_owner_idx
  on public.household_members (household_id)
  where role = 'owner';

create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function private.set_updated_at();


-- ---------------------------------------------------------------------
-- 5. household_invites
-- ---------------------------------------------------------------------
-- Gespeichert wird ausschliesslich der SHA-256-Hex-Hash des Schluessels.
-- Der Klartext existiert genau einmal: im Rueckgabewert von
-- create_household_invite() (Migration 3).

create table public.household_invites (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null
                           references public.households (id) on delete cascade,
  token_hash   text        not null,
  created_by   uuid        default auth.uid()
                           references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  used_at      timestamptz,
  used_by      uuid        references auth.users (id) on delete set null,

  constraint household_invites_token_hash_key unique (token_hash),

  -- Sperrt versehentlich im Klartext abgelegte Schluessel bereits auf
  -- Schema-Ebene: nur 64 Hex-Zeichen sind zulaessig.
  constraint household_invites_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),

  constraint household_invites_expiry_after_creation
    check (expires_at > created_at),

  -- Nur diese Richtung pruefen: "on delete set null" auf used_by darf
  -- eine bereits verbrauchte Einladung nicht nachtraeglich ungueltig
  -- machen (die Gegenrichtung wuerde beim Loeschen eines Kontos brechen).
  constraint household_invites_used_by_requires_used_at
    check (used_by is null or used_at is not null)
);

comment on table public.household_invites is
  'Einladungen. Nur der Hash des Schluessels wird gespeichert, nie der Klartext.';
comment on column public.household_invites.token_hash is
  'encode(sha256(convert_to(token, ''UTF8'')), ''hex'') - 64 Hex-Zeichen.';

create index household_invites_household_id_idx
  on public.household_invites (household_id);

-- Liste der offenen Einladungen im Bildschirm "Haushalt".
create index household_invites_open_idx
  on public.household_invites (household_id, expires_at)
  where used_at is null;


-- ---------------------------------------------------------------------
-- 6. Rechte auf Tabellenebene
-- ---------------------------------------------------------------------
-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf neue
-- Tabellen in public an anon, authenticated und service_role. RLS filtert
-- Zeilen, entzieht aber keine Rechte - deshalb wird hier zuerst entzogen
-- und danach gezielt vergeben. Was nicht vergeben ist, kann auch bei
-- fehlerhafter Richtlinie nicht passieren (Ebene 1 aus Konzept 7.4).

revoke all on table public.households         from anon, authenticated;
revoke all on table public.household_members  from anon, authenticated;
revoke all on table public.household_invites  from anon, authenticated;

-- households: anlegen, lesen, umbenennen, loeschen (Zeilen via RLS gefiltert).
grant select, insert, delete on table public.households to authenticated;
grant update (name)          on table public.households to authenticated;

-- household_members: lesen und entfernen; EINFUEGEN ist bewusst NICHT
-- vergeben. Mitgliedschaften entstehen ausschliesslich ueber den Trigger
-- beim Anlegen eines Haushalts und ueber join_household_with_invite().
-- Schreibbar ist nur der eigene Anzeigename - eine Rollen-Erhoehung auf
-- 'owner' per UPDATE ist damit schon durch das Spaltenrecht ausgeschlossen
-- und haengt nicht allein an einer Richtlinie.
grant select, delete         on table public.household_members to authenticated;
grant update (display_name)  on table public.household_members to authenticated;

-- household_invites: nur lesen. Anlegen, entwerten und zuruecknehmen
-- laufen ueber SECURITY-DEFINER-Funktionen, damit der Klartext-Schluessel
-- garantiert nie aus dem Client in die Tabelle gelangen kann.
grant select on table public.household_invites to authenticated;


-- ---------------------------------------------------------------------
-- 7. RLS einschalten
-- ---------------------------------------------------------------------
-- Bewusst hier und nicht erst in Migration 2: sollte die naechste
-- Migration scheitern, stehen die Tabellen ohne Richtlinien da und
-- verweigern damit jeden Zugriff. Das ist der sichere Fehlerzustand.
--
-- KEIN "force row level security": die Hilfsfunktionen in Migration 2
-- gehoeren der Rolle postgres und umgehen RLS ueber deren BYPASSRLS.
-- Siehe Kommentar dort.

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
