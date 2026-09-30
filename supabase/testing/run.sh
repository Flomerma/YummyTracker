#!/usr/bin/env bash
#
# Baut eine Wegwerf-Datenbank auf, spielt die Attrappe und alle Migrationen
# ein und fuehrt anschliessend den Nachweis fuer den Zugriffsschutz aus.
#
# Voraussetzung: lokales PostgreSQL (>= 14), erreichbar als Benutzer postgres.
#   sudo apt-get install -y postgresql postgresql-contrib
#   sudo service postgresql start
#
# Aufruf:  supabase/testing/run.sh
#
# Das Skript ist bewusst zerstoerend: Die Datenbank wird bei jedem Lauf neu
# angelegt. Damit gibt es keine Zwischenstaende, die einen Fehler verdecken.

set -euo pipefail

DB="${YT_TEST_DB:-yt_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q)

echo "Datenbank ${DB} neu aufbauen ..."
sudo -u postgres dropdb --if-exists "$DB"
sudo -u postgres createdb "$DB"

echo "Attrappe einspielen ..."
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/testing/00_supabase_shim.sql"

echo "Migrationen einspielen ..."
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s\n' "$(basename "$f")"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

echo "Nachweis ausfuehren ..."
# Reihenfolge zaehlt: 10_ legt die Helfer test.ok/test.denied und die
# Testpersonen an, auf denen die spaeteren Dateien aufbauen.
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/testing/10_rls_stufe0.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/testing/20_rls_stufe1.sql"
