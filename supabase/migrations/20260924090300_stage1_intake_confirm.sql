-- =====================================================================
-- Stufe 1 / 4 von 4 : Eingang bestaetigen und verwerfen
-- =====================================================================
-- Konzept 4.1: "Erst das Bestaetigen macht daraus Bestand."
--
-- Warum das eine Datenbankfunktion sein muss und kein Doppelschritt aus
-- der Anwendung:
--
--   Aus den angenommenen Zeilen entstehen Bestandsartikel UND der Stapel
--   geht auf 'confirmed'. Beides muss zusammen geschehen. Bricht die
--   Verbindung zwischen zwei Aufrufen ab, entsteht sonst einer von zwei
--   unhaltbaren Zustaenden: ein bestaetigter Stapel ohne Artikel (der
--   Einkauf ist verschwunden) oder Artikel mit einem Stapel, der noch
--   als Entwurf dasteht (der naechste Klick legt sie ein zweites Mal an).
--
--   Jeder Funktionsaufruf in Postgres laeuft in genau einer Transaktion.
--   Scheitert eine Pruefung, ist weder der Stapel bestaetigt noch ein
--   Artikel angelegt. Ein expliziter BEGIN/COMMIT-Block ist weder noetig
--   noch in plpgsql erlaubt.
--
-- Warum SECURITY DEFINER, obwohl der Aufrufer Mitglied ist:
--   inventory_items.intake_line_id ist bewusst kein Spaltenrecht des
--   Clients (Migration 3) - die Herkunft soll niemand von Hand setzen
--   koennen. Genauso ist intake_batches.status nicht beschreibbar.
--   Die Funktion braucht beides. Sie prueft die Zugehoerigkeit deshalb
--   selbst, bevor sie irgendetwas tut.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Eingang bestaetigen
-- ---------------------------------------------------------------------

create or replace function public.confirm_intake_batch(p_batch_id uuid)
returns setof public.inventory_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch   public.intake_batches;
  v_created integer;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  -- "for update" sperrt den Stapel bis zum Ende der Transaktion. Tippen
  -- zwei Mitglieder gleichzeitig auf "Bestaetigen", wartet der zweite
  -- Aufruf; er liest danach den bereits bestaetigten Stapel und liefert
  -- dieselben Artikel zurueck, statt sie ein zweites Mal anzulegen.
  select * into v_batch
  from public.intake_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'Eingang nicht gefunden.'
      using errcode = 'P0001', detail = 'intake_batch_not_found';
  end if;

  -- Gleiche Meldung wie bei nicht vorhandenem Stapel waere hier unnoetig:
  -- die Kennung stammt aus einer Liste, die der Aufrufer ohnehin sehen
  -- darf. Ein Unterschied in der Meldung verraet also nichts.
  if not private.is_household_member(v_batch.household_id) then
    raise exception 'Kein Zugriff auf diesen Eingang.'
      using errcode = '42501', detail = 'not_a_member';
  end if;

  -- Bereits bestaetigt: kein Fehler, sondern dasselbe Ergebnis wie beim
  -- ersten Aufruf. Ein doppelter Klick oder ein wiederholter Versand
  -- derselben Server-Aktion darf den Einkauf nicht verdoppeln.
  if v_batch.status = 'confirmed' then
    return query
      select i.*
      from public.inventory_items i
      join public.intake_lines l on l.id = i.intake_line_id
      where l.batch_id = p_batch_id
      order by l.position;
    return;
  end if;

  if v_batch.status <> 'draft' then
    raise exception 'Dieser Eingang wurde verworfen und kann nicht bestaetigt werden.'
      using errcode = 'P0001', detail = 'intake_batch_not_draft';
  end if;

  -- Zugehoerigkeit der Produkte. Der Trigger auf intake_lines prueft
  -- dasselbe schon beim Schreiben; hier steht es noch einmal, weil
  -- zwischen Erfassen und Bestaetigen ein Produkt den Besitzer gewechselt
  -- haben koennte und weil diese Funktion RLS umgeht.
  if exists (
    select 1
    from public.intake_lines l
    join public.products p on p.id = l.product_id
    where l.batch_id = p_batch_id
      and l.accepted
      and p.household_id is not null
      and p.household_id <> v_batch.household_id
  ) then
    raise exception 'Eine Zeile verweist auf ein Produkt eines anderen Haushalts.'
      using errcode = '42501', detail = 'product_not_visible';
  end if;

  -- Aus angenommenen Zeilen werden Bestandsartikel.
  --
  -- display_name ist ein Schnappschuss (Konzept 5.3): bevorzugt der
  -- aktuelle Katalogname, sonst der Rohtext der Zeile. Ab hier lebt der
  -- Name unabhaengig vom Katalog weiter.
  --
  -- storage faellt auf den Vorgabe-Lagerort des Produkts zurueck, wenn
  -- die Zeile keinen nennt - der Pruef-Schritt soll den Normalfall nicht
  -- abfragen muessen.
  insert into public.inventory_items (
    household_id, product_id, display_name, quantity, unit, storage,
    expires_at, expiry_source, price_chf, added_by, intake_line_id
  )
  select
    v_batch.household_id,
    l.product_id,
    coalesce(nullif(btrim(p.name), ''), btrim(l.raw_text)),
    l.quantity,
    l.unit,
    coalesce(l.storage, p.default_storage),
    l.suggested_expires_at,
    l.expiry_source,
    l.price_chf,
    v_user_id,
    l.id
  from public.intake_lines l
  left join public.products p on p.id = l.product_id
  where l.batch_id = p_batch_id
    and l.accepted
  order by l.position;

  get diagnostics v_created = row_count;

  if v_created = 0 then
    raise exception 'Der Eingang enthaelt keine angenommene Zeile.'
      using errcode = 'P0001', detail = 'no_accepted_lines';
  end if;

  update public.intake_batches
     set status       = 'confirmed',
         confirmed_at = now()
   where id = p_batch_id;

  return query
    select i.*
    from public.inventory_items i
    join public.intake_lines l on l.id = i.intake_line_id
    where l.batch_id = p_batch_id
    order by l.position;
end;
$$;

comment on function public.confirm_intake_batch(uuid) is
  'Macht aus den angenommenen Zeilen eines Entwurfs Bestandsartikel und setzt den Stapel auf confirmed. Eine Transaktion, wiederholbar ohne Doppeleintrag.';

revoke all on function public.confirm_intake_batch(uuid) from public, anon;
grant execute on function public.confirm_intake_batch(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 2. Eingang verwerfen
-- ---------------------------------------------------------------------
-- Gegenstueck zum Bestaetigen. Ohne diese Funktion haette ein Entwurf
-- keinen Ausgang: status ist aus dem Browser nicht beschreibbar
-- (Migration 2), und geloescht wird nichts - raw_payload und raw_text
-- bleiben als Messgrundlage fuer die Qualitaet der Bon-Erkennung stehen.

create or replace function public.discard_intake_batch(p_batch_id uuid)
returns public.intake_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_batch   public.intake_batches;
begin
  if v_user_id is null then
    raise exception 'Nicht angemeldet.'
      using errcode = '42501', detail = 'not_authenticated';
  end if;

  select * into v_batch
  from public.intake_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    raise exception 'Eingang nicht gefunden.'
      using errcode = 'P0001', detail = 'intake_batch_not_found';
  end if;

  if not private.is_household_member(v_batch.household_id) then
    raise exception 'Kein Zugriff auf diesen Eingang.'
      using errcode = '42501', detail = 'not_a_member';
  end if;

  if v_batch.status = 'confirmed' then
    raise exception 'Ein bestaetigter Eingang kann nicht mehr verworfen werden.'
      using errcode = 'P0001', detail = 'intake_batch_already_confirmed';
  end if;

  update public.intake_batches
     set status = 'discarded'
   where id = p_batch_id
  returning * into v_batch;

  return v_batch;
end;
$$;

comment on function public.discard_intake_batch(uuid) is
  'Verwirft einen Eingangs-Entwurf. Die Zeilen bleiben als Messgrundlage stehen.';

revoke all on function public.discard_intake_batch(uuid) from public, anon;
grant execute on function public.discard_intake_batch(uuid)
  to authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. PostgREST-Schemacache aktualisieren
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
