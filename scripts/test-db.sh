#!/usr/bin/env bash
# Crea una base desechable en un Postgres local, aplica el shim de Supabase,
# las migraciones y la semilla, y corre las pruebas de supabase/tests.
#
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DB="asistente_test_$$"
export PGUSER="${PGUSER:-postgres}"

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

createdb "$DB"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do
  echo "migración: $f"
  run -f "$f"
done
run -f supabase/seed.sql

status=0
for f in supabase/tests/*.sql; do
  [[ "$(basename "$f")" == shim_supabase.sql ]] && continue
  echo "prueba: $f"
  run -o /dev/null -f "$f" || status=1
done

exit $status
