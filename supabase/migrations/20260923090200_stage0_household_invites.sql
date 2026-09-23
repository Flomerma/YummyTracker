-- =====================================================================
-- Stufe 0 / 3 von 3 : Haushalt anlegen, einladen, beitreten
-- =====================================================================
-- Konzept 7.3: Beitritt ueber einen Einladungslink mit begrenzt gueltigem,
-- einmal verwendbarem Schluessel. Konzept 5.1: nur der Hash liegt in der
-- Datenbank.
--
-- Warum der Beitritt zwingend eine Datenbankfunktion sein muss:
-- Wer einem Haushalt beitreten will, ist per Definition noch kein
-- Mitglied. Die SELECT-Richtlinie auf household_invites verbirgt die
-- Einladungszeile also vor genau der Person, die sie einloesen will.
-- Eine Client-Abfrage "suche Einladung mit diesem Hash" liefert immer
-- null Zeilen. Nur eine SECURITY-DEFINER-Funktion kann suchen, pruefen,
-- eintragen und entwerten - und das in einer einzigen Transaktion.
--
-- Jeder Funktionsaufruf in Postgres laeuft in genau einer Transaktion.
-- Scheitert eine der Pruefungen, ist auch die Mitgliedschaft nicht
-- angelegt und die Einladung nicht entwertet. Ein expliziter
-- BEGIN/COMMIT-Block ist weder noetig noch in plpgsql erlaubt.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Hashfunktion
-- ---------------------------------------------------------------------
-- sha256(bytea) ist seit PostgreSQL 11 im Kern; pgcrypto wird nicht
-- gebraucht. Dieselbe Funktion wird beim Erzeugen und beim Einloesen
-- verwendet - so koennen die beiden nicht auseinanderlaufen.

create or replace function private.hash_invite_token(p_token text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
           pg_catalog.sha256(
             pg_catalog.convert_to(pg_catalog.btrim(p_token), 'UTF8')
           ),
           'hex'
         )
$$;

comment on function private.hash_invite_token(text) is
  'SHA-256 des Einladungsschluessels als Hex. Einzige Stelle, an der gehasht wird.';

revoke all on function private.hash_invite_token(text) from public;
grant execute on function private.hash_invite_token(text) to service_role;


-- ---------------------------------------------------------------------
-- 2. Haushalt anlegen
-- ---------------------------------------------------------------------
-- Bewusst SECURITY INVOKER (Standard): das INSERT laeuft durch die
-- Richtlinie households_insert_self, die Mitgliedschaft legt der Trigger
-- aus Migration 2 an. Die Funktion ist reine Bequemlichkeit fuer
-- lib/data, keine Rechteerweiterung.

create or replace function public.create_household(
  p_name         text,
  p_display_name text default null
)
returns public.households
language plpgsql
set search_path = ''
as $$
declare
  v_user_id   uuid := auth.uid();
  v_household public.households;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  insert into public.households (name, created_by)
  values (btrim(p_name), v_user_id)
  returning * into v_household;

  if btrim(coalesce(p_display_name, '')) <> '' then
    update public.household_members
       set display_name = btrim(p_display_name)
     where household_id = v_household.id
       and user_id      = v_user_id;
  end if;

  return v_household;
end;
$$;

comment on function public.create_household(text, text) is
  'Legt einen Haushalt an. Der Aufrufer wird per Trigger Mitglied mit role = owner.';

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. Einladung erzeugen
-- ---------------------------------------------------------------------
-- Der Klartext-Schluessel entsteht in der Datenbank und verlaesst sie
-- genau einmal: als Rueckgabewert dieses Aufrufs. Gespeichert wird nur
-- der Hash. Wer spaeter die Tabelle liest - auch mit dem allmaechtigen
-- Schluessel - kann daraus keinem Haushalt beitreten.
--
-- Zufall: zwei v4-UUIDs aus gen_random_uuid() liefern zusammen 32 Byte
-- aus pg_strong_random. Davon 24 Byte, base64url kodiert, ergeben einen
-- 32 Zeichen langen, linktauglichen Schluessel mit rund 190 Bit Entropie.

create or replace function public.create_household_invite(
  p_household_id uuid,
  p_valid_for    interval default interval '7 days'
)
returns table (
  invite_id         uuid,
  invite_token      text,
  invite_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_bytes   bytea;
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  if not private.is_household_member(p_household_id) then
    -- Gleiche Meldung wie bei nicht vorhandenem Haushalt: sonst liesse
    -- sich ueber die Fehlermeldung pruefen, ob eine Kennung existiert.
    raise exception 'Kein Zugriff auf diesen Haushalt.'
      using errcode = '42501', detail = 'not_a_member';
  end if;

  if p_valid_for < interval '5 minutes' or p_valid_for > interval '30 days' then
    raise exception 'Gueltigkeitsdauer muss zwischen 5 Minuten und 30 Tagen liegen.'
      using errcode = '22023', detail = 'invalid_validity';
  end if;

  -- 64 Hex-Zeichen aus zwei v4-UUIDs -> 32 Byte, davon 24 verwendet.
  v_bytes := pg_catalog.substr(
               pg_catalog.decode(
                 pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
                 || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
                 'hex'),
               1, 24);

  -- base64 -> base64url, damit der Schluessel ohne Kodierung in eine URL passt.
  v_token := pg_catalog.translate(
               pg_catalog.encode(v_bytes, 'base64'),
               '+/', '-_');

  v_expires := now() + p_valid_for;

  insert into public.household_invites (household_id, token_hash, created_by, expires_at)
  values (p_household_id, private.hash_invite_token(v_token), v_user_id, v_expires)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

comment on function public.create_household_invite(uuid, interval) is
  'Erzeugt eine Einladung und gibt den Klartext-Schluessel genau einmal zurueck. Gespeichert wird nur sein Hash.';

revoke all on function public.create_household_invite(uuid, interval) from public, anon;
grant execute on function public.create_household_invite(uuid, interval)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 4. Einladung zuruecknehmen
-- ---------------------------------------------------------------------
create or replace function public.revoke_household_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite  public.household_invites;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  select * into v_invite
  from public.household_invites i
  where i.id = p_invite_id;

  if not found then
    raise exception 'Einladung nicht gefunden.'
      using errcode = 'P0001', detail = 'invite_not_found';
  end if;

  if not (v_invite.created_by = v_user_id
          or private.is_household_owner(v_invite.household_id)) then
    raise exception 'Nur der Ersteller der Einladung oder der Eigentuemer darf sie zuruecknehmen.'
      using errcode = '42501', detail = 'not_allowed';
  end if;

  delete from public.household_invites where id = p_invite_id;
end;
$$;

revoke all on function public.revoke_household_invite(uuid) from public, anon;
grant execute on function public.revoke_household_invite(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 5. Beitreten
-- ---------------------------------------------------------------------
-- Ablauf in einer Transaktion:
--   Klartext hashen -> Einladung suchen und sperren -> pruefen
--   -> Mitglied eintragen -> Einladung entwerten.
--
-- "for update" sperrt die Einladungszeile bis zum Ende der Transaktion.
-- Loesen zwei Personen denselben Link gleichzeitig ein, wartet die
-- zweite; sie liest anschliessend die aktualisierte Zeile mit gesetztem
-- used_at und bekommt "bereits verwendet". Ohne diese Sperre koennten
-- beide durchkommen - der Schluessel waere nicht mehr einmalig.

create or replace function public.join_household_with_invite(
  p_token        text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hash    text;
  v_invite  public.household_invites;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'Einladungsschluessel fehlt.'
      using errcode = '22023', detail = 'invite_token_missing';
  end if;

  v_hash := private.hash_invite_token(p_token);

  select * into v_invite
  from public.household_invites i
  where i.token_hash = v_hash
  for update;

  if not found then
    raise exception 'Diese Einladung ist ungueltig.'
      using errcode = 'P0001', detail = 'invite_not_found';
  end if;

  if v_invite.used_at is not null then
    if v_invite.used_by = v_user_id then
      -- Derselbe Nutzer oeffnet den Link ein zweites Mal. Kein Fehler.
      return v_invite.household_id;
    end if;
    raise exception 'Diese Einladung wurde bereits verwendet.'
      using errcode = 'P0001', detail = 'invite_already_used';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'Diese Einladung ist abgelaufen.'
      using errcode = 'P0001', detail = 'invite_expired';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (
    v_invite.household_id,
    v_user_id,
    'member',
    nullif(btrim(coalesce(p_display_name, '')), '')
  )
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
     set used_at = now(),
         used_by = v_user_id
   where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

comment on function public.join_household_with_invite(text, text) is
  'Loest einen Einladungsschluessel ein: hashen, pruefen, Mitglied eintragen, Einladung entwerten - in einer Transaktion.';

revoke all on function public.join_household_with_invite(text, text) from public, anon;
grant execute on function public.join_household_with_invite(text, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 6. PostgREST-Schemacache aktualisieren
-- ---------------------------------------------------------------------
-- Auf Supabase Cloud erledigt das ein Ereignis-Trigger meist selbst.
-- Der Hinweis schadet nicht und spart im Zweifel eine Fehlersuche nach
-- "Could not find the function public.join_household_with_invite".
notify pgrst, 'reload schema';
