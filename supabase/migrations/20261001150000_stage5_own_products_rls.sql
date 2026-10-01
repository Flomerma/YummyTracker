-- ---------------------------------------------------------------------
-- Haushaltseigene Produkte ohne Geheimschluessel anlegen
-- ---------------------------------------------------------------------
--
-- ANLASS: ein Fehler aus dem ersten echten Einsatz. "Uebernehmen und
-- merken" nach einem Scan lud endlos und erfasste nichts. Der Pfad war
--
--   resolveUnknownScan -> addOwnProduct -> createHouseholdProduct
--                      -> createSupabaseAdminClient()
--
-- und der letzte Schritt WIRFT, wenn SUPABASE_SECRET_KEY nicht gesetzt
-- ist. Auf Vercel war er das nicht — ausdruecklich, weil ihn bis dahin
-- nichts brauchte.
--
-- ---------------------------------------------------------------------
-- WARUM DER UMWEG UEBER DEN GEHEIMSCHLUESSEL FALSCH WAR
-- ---------------------------------------------------------------------
-- Die urspruengliche Begruendung fuer "Katalog nur lesbar" steht in
-- Migration 20260924090000: Der Katalog waechst ueber alle Haushalte
-- hinweg, ein Tippfehler verteilt sich sonst auf alle.
--
-- Dieses Argument gilt fuer GLOBALE Zeilen. Fuer haushaltseigene gilt es
-- nicht: Sie tragen household_id und sind durch die
-- Zeilen-Sicherheitsregeln fuer jeden anderen Haushalt unsichtbar. Ein
-- Tippfehler darin verteilt sich nirgendwohin.
--
-- Der Geheimschluessel war hier also kein Schutz, sondern nur eine
-- zusaetzliche Ausfallquelle — und zwar die gefaehrlichste Art davon: Er
-- umgeht ALLE Zeilen-Sicherheitsregeln. Jeder Weg, den man ihm abnimmt,
-- macht die Anwendung sicherer, nicht unsicherer.
--
-- Nach dieser Migration braucht das Benennen eines Scans kein einziges
-- Geheimnis auf dem Server mehr.
--
-- ---------------------------------------------------------------------
-- WAS BEWUSST NICHT ERLAUBT WIRD
-- ---------------------------------------------------------------------
--   * Globale Produkte anlegen. household_id waere dann NULL und steht
--     nie in current_household_ids() — die Richtlinie weist es ab.
--   * In einen fremden Haushalt schreiben. Dieselbe Richtlinie.
--   * source frei waehlen. Nur 'user' ist erlaubt; der vorhandene CHECK
--     products_scope_matches_source erzwingt ausserdem, dass genau dann
--     eine household_id gesetzt ist.
--   * verified setzen. Die Spalte steht nicht in der Rechteliste und
--     bleibt beim Vorgabewert false — eine Selbstbescheinigung waere
--     wertlos.
--   * AENDERN und LOESCHEN. Kein heutiger Ablauf braucht es, und Rechte
--     zu vergeben, die niemand nutzt, ist das Gegenteil von sparsam.
--     Kommt, wenn ein Weg dafuer entsteht.
-- ---------------------------------------------------------------------

-- created_by fehlt in der Liste mit Absicht: Es kommt aus auth.uid() als
-- Vorgabewert und soll nicht faelschbar sein. normalized_name steht drin,
-- weil die Anwendung ihn mit normalizeName berechnet — die Datenbank kann
-- das nicht, sie prueft nur die grobe Form.
grant insert (
  name,
  normalized_name,
  category_id,
  brand,
  ean,
  default_unit,
  default_storage,
  household_id,
  source
) on public.products to authenticated;

create policy products_insert_own
  on public.products
  for insert
  to authenticated
  with check (
    household_id in (select private.current_household_ids())
    and source = 'user'
  );

comment on policy products_insert_own on public.products is
  'Eigene Produkte anlegen. Global bleibt der Katalog unveraenderlich: '
  'dort verteilt sich ein Fehler auf alle Haushalte, hier auf keinen.';

notify pgrst, 'reload schema';
