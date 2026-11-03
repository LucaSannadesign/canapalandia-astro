#!/usr/bin/env bash
# Verifica la migrazione Advertising Manager su un cluster PostgreSQL usa-e-getta locale.
# Non si collega MAI a Supabase né a database remoti: crea un cluster in una cartella temporanea,
# applica migrazione + test SQL + rollback, poi lo distrugge.
# Requisiti: initdb, pg_ctl, psql (PostgreSQL >= 15 con contrib btree_gist).
set -euo pipefail

export LC_ALL=C LANG=C
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20261103120000_ads_manager.sql"
ROLLBACK="$ROOT/supabase/migrations/20261103120000_ads_manager.down.sql"
TESTS="$ROOT/tests/sql/ads_manager.test.sql"

for bin in initdb pg_ctl psql; do
  command -v "$bin" >/dev/null || { echo "SKIP: $bin non disponibile"; exit 0; }
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ads-pg.XXXXXX")"
PORT="${ADS_TEST_PG_PORT:-$((54000 + RANDOM % 900))}"
cleanup() {
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

initdb -D "$TMP/data" -U postgres -A trust >/dev/null
pg_ctl -D "$TMP/data" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$TMP/pg.log" -w start >/dev/null

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -t)

# Ruoli equivalenti a quelli di Supabase, per verificare i permessi
"${PSQL[@]}" -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;"
"${PSQL[@]}" -c "grant usage on schema public to anon, authenticated, service_role; alter default privileges in schema public grant all on tables to anon, authenticated, service_role;"

echo "→ migrazione"
"${PSQL[@]}" -f "$MIGRATION"
echo "→ migrazione (idempotenza, seconda esecuzione)"
"${PSQL[@]}" -f "$MIGRATION"
echo "→ test SQL"
"${PSQL[@]}" -f "$TESTS"
echo "→ rollback"
"${PSQL[@]}" -f "$ROLLBACK"
LEFT="$("${PSQL[@]}" -At -c "select count(*) from pg_tables where schemaname='public' and tablename like 'ads\_%'")"
[ "$LEFT" = "0" ] || { echo "FAIL: rollback incompleto ($LEFT tabelle ads_ residue)"; exit 1; }
echo "OK: migrazione, vincoli, permessi e rollback verificati su cluster locale usa-e-getta"
