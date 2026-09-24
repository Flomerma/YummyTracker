-- ---------------------------------------------------------------------
-- Supabase-Attrappe fuer lokale Pruefung der Migrationen
-- ---------------------------------------------------------------------
--
-- Dieses Skript ist KEIN Teil der Anwendung und wird NIE in die Cloud
-- gespielt. Es bildet lokal nur so viel von Supabase nach, wie die
-- Migrationen voraussetzen:
--
--   * die Rollen anon, authenticated, service_role
--   * das Schema auth mit auth.users und auth.uid()
--   * die Supabase-Vorgabe, dass neue Tabellen in public automatisch
--     ALL-Rechte an anon und authenticated bekommen
--
-- Der letzte Punkt ist wichtig: Die Migrationen widerrufen diese Rechte
-- ausdruecklich wieder. Ohne die Vorgabe wuerde der Test etwas pruefen,
-- das in der Cloud anders aussieht, und die Luecke erst dort auffallen.
--
-- Nachgebildet wird Supabase auf PostgreSQL 15/17; lokal laeuft 14.
-- Fuer die hier genutzten Sprachmittel ist das gleichwertig.
-- ---------------------------------------------------------------------

-- 1. Rollen ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

-- 2. Schema auth -------------------------------------------------------

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default pg_catalog.gen_random_uuid(),
  email text unique
);

-- auth.uid() liest in Supabase den Anspruch "sub" aus dem JWT. Lokal
-- setzen die Tests dieselbe Sitzungsvariable von Hand:
--   set local request.jwt.claim.sub = '<uuid>';
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- 3. Supabase-Vorgaberechte -------------------------------------------
-- Genau diese grosszuegige Vorgabe ist der Grund, weshalb die
-- Migrationen mit "revoke all" beginnen muessen.

grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
