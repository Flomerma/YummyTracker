-- ---------------------------------------------------------------------
-- Gelernte Strichcode-Zuordnungen je Haushalt
-- ---------------------------------------------------------------------
--
-- Der eigentliche Wert eines Scanners liegt nicht im Nachschlagen, sondern
-- im Lernen. Ein EAN ist eine EXAKTE Kennung — anders als ein Produktname
-- kann er eindeutig treffen. Einmal von Hand zugeordnet, trifft derselbe
-- Scan beim naechsten Einkauf sofort, ohne Netzzugriff und ohne
-- Fremdanbieter.
--
-- ---------------------------------------------------------------------
-- WARUM EINE EIGENE TABELLE
-- ---------------------------------------------------------------------
-- products.ean gibt es bereits. Es waeren also zwei naheliegende Wege
-- denkbar gewesen, und beide sind falsch:
--
--   a) Den gelernten EAN auf das GLOBALE Produkt schreiben.
--      Damit wuerde die Zuordnung EINES Haushalts zur weltweiten
--      Behauptung. Konzept 5.2 schliesst genau das aus: Es gibt keine
--      automatische Befoerderung ins Globale, weil sie Tippfehler und
--      Fehlzuordnungen ueber alle Haushalte verteilt. Und der Unique-Index
--      products_global_ean_key wuerde beim zweiten Haushalt mit anderer
--      Meinung ohnehin abweisen.
--
--   b) Eine haushaltseigene KOPIE des Produkts mit dem EAN anlegen.
--      Die Kopie verliert alles, was am Original haengt — insbesondere die
--      globalen Haltbarkeitsregeln. Aus "Vollmilch, 6 Tage" wuerde
--      "Vollmilch (Kopie), kein Wert bekannt". Der Katalog zerfiele
--      ausserdem in so viele Fassungen wie es Haushalte gibt.
--
-- Diese Tabelle bildet stattdessen nur die ZUORDNUNG ab: In diesem
-- Haushalt bedeutet dieser Code jenes Produkt. Das Produkt bleibt, was es
-- ist — global oder haushaltseigen —, behaelt seine Regeln, und die
-- Zuordnung bleibt dort, wo sie entstanden ist.
--
-- products.ean bleibt daneben bestehen und ist weiterhin die bessere
-- Quelle, wenn sie etwas liefert: Sie ist global gepflegt. Die Suche
-- fragt deshalb zuerst hier und dann dort — die eigene Zuordnung sticht
-- die allgemeine, weil sie die juengere und gezieltere Aussage ist.
-- ---------------------------------------------------------------------

create table public.household_product_eans (
  household_id uuid        not null references public.households (id) on delete cascade,
  ean          text        not null,
  product_id   uuid        not null references public.products (id)   on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid                 default auth.uid()
                           references auth.users (id) on delete set null,

  primary key (household_id, ean),

  -- Dieselbe Form wie products.ean. Ohne die Pruefung landet hier frueher
  -- oder spaeter ein Rohwert mit Leerzeichen oder ein verlesener Code.
  constraint household_product_eans_format
    check (ean ~ '^[0-9]{8,14}$')
);

comment on table public.household_product_eans is
  'Was ein Strichcode in DIESEM Haushalt bedeutet. Gelernt beim Scannen, '
  'nicht zentral vergeben.';

-- Nachschlagen beim Scannen laeuft ueber den Primaerschluessel. Der Index
-- hier dient dem umgekehrten Weg: Welche Codes zeigen auf dieses Produkt?
-- Gebraucht, wenn ein Produkt geloescht oder zusammengefuehrt wird.
create index household_product_eans_product_id_idx
  on public.household_product_eans (product_id);

-- ---------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------
-- Erst alles entziehen: Supabase vergibt per ALTER DEFAULT PRIVILEGES
-- automatisch ALL auf neue Tabellen in public an anon und authenticated.
-- Wer das vergisst, hat eine oeffentlich beschreibbare Tabelle, ganz
-- gleich welche Richtlinien darueber stehen.

revoke all on public.household_product_eans from anon, authenticated;

-- household_id steht bewusst in der INSERT-Liste: Die Richtlinie prueft
-- ihn, und ohne Schreibrecht liesse sich gar keine Zeile anlegen.
-- created_at und created_by fehlen absichtlich — sie kommen aus den
-- Vorgabewerten und sollen nicht faelschbar sein.
grant select, delete on public.household_product_eans to authenticated;
grant insert (household_id, ean, product_id) on public.household_product_eans to authenticated;

-- Kein UPDATE. Eine falsche Zuordnung wird geloescht und neu angelegt;
-- das ist derselbe Aufwand und erspart eine Richtlinie, die den alten
-- Wert nicht sehen kann.

alter table public.household_product_eans enable row level security;

-- ---------------------------------------------------------------------
-- Richtlinien
-- ---------------------------------------------------------------------

create policy household_product_eans_select_member
  on public.household_product_eans
  for select
  to authenticated
  using (household_id in (select private.current_household_ids()));

-- Beim Anlegen werden ZWEI Dinge geprueft:
--   1. Gehoert der Aufrufer zu diesem Haushalt?
--   2. Darf dieser Haushalt dieses Produkt ueberhaupt verwenden?
-- Die zweite Pruefung ist nicht theoretisch: Ohne sie koennte jemand mit
-- einer erratenen Produktkennung einen Code auf ein haushaltseigenes
-- Produkt eines FREMDEN Haushalts zeigen lassen. Der Fremdschluessel
-- allein verhindert das nicht — er prueft nur, dass die Zeile existiert.
create policy household_product_eans_insert_member
  on public.household_product_eans
  for insert
  to authenticated
  with check (
    household_id in (select private.current_household_ids())
    and private.product_usable_by_household(product_id, household_id)
  );

create policy household_product_eans_delete_member
  on public.household_product_eans
  for delete
  to authenticated
  using (household_id in (select private.current_household_ids()));

-- PostgREST haelt das Schema zwischengespeichert. Ohne diesen Hinweis
-- meldet der erste Zugriff auf die neue Tabelle PGRST205.
notify pgrst, 'reload schema';
