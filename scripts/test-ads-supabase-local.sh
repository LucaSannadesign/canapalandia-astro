#!/usr/bin/env bash
# Collaudo reale dell'Advertising Manager su uno stack Supabase LOCALE (Docker).
# Uso: scripts/test-ads-supabase-local.sh <workdir-supabase-locale>
#   dove <workdir> contiene una `supabase/` inizializzata con `supabase init` e avviata con `supabase start`.
# Non usa mai progetti remoti: legge URL e chiavi da `supabase status` e il test rifiuta host non locali.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="${1:?percorso della workdir Supabase locale}"
MIGRATION="$ROOT/supabase/migrations/20261103120000_ads_manager.sql"
ROLLBACK="$ROOT/supabase/migrations/20261103120000_ads_manager.down.sql"

STATUS="$(supabase status --workdir "$WORKDIR" -o env 2>/dev/null)"
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1; }
API_URL="$(val API_URL)"
DB_URL="$(val DB_URL)"
SERVICE_KEY="$(val SERVICE_ROLE_KEY)"
ANON_KEY="$(val ANON_KEY)"

case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "STOP: API_URL non locale ($API_URL)"; exit 1 ;; esac
case "$DB_URL" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "STOP: DB_URL non locale"; exit 1 ;; esac

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -q -X -t)

echo "→ migrazione su Supabase locale"
"${PSQL[@]}" -f "$MIGRATION"
"${PSQL[@]}" -c "notify pgrst, 'reload schema';"
sleep 2

echo "→ collaudo integrazione (repository Supabase reale + PostgREST)"
ADS_ITEST_SUPABASE_URL="$API_URL" ADS_ITEST_SERVICE_ROLE_KEY="$SERVICE_KEY" ADS_ITEST_ANON_KEY="$ANON_KEY" \
  node --experimental-strip-types --disable-warning=ExperimentalWarning \
  --import "$ROOT/tests/support/register-ts.mjs" --test "$ROOT/tests/supabase-local/ads-supabase.itest.ts"

echo "→ script di conservazione (dry-run, esecuzione locale, rifiuto remoto)"
DRY="$(SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" node "$ROOT/scripts/ads-retention.mjs")"
grep -q '"mode": "dry-run"' <<<"$DRY" || { echo "FAIL: dry-run"; exit 1; }
EXEC="$(SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" node "$ROOT/scripts/ads-retention.mjs" --execute)"
grep -q '"events_deleted"' <<<"$EXEC" || { echo "FAIL: execute locale"; exit 1; }
set +e
SUPABASE_URL="https://abcdefghijklmnop.supabase.co" SUPABASE_SERVICE_ROLE_KEY="non-usata" node "$ROOT/scripts/ads-retention.mjs" --execute >/dev/null 2>&1
REMOTE_EXIT=$?
set -e
[ "$REMOTE_EXIT" = "3" ] || { echo "FAIL: lo script non ha rifiutato l'host remoto (exit $REMOTE_EXIT)"; exit 1; }
echo "   dry-run OK, --execute locale OK, remoto senza --allow-remote rifiutato (exit 3)"

echo "→ rollback"
"${PSQL[@]}" -f "$ROLLBACK"
"${PSQL[@]}" -c "notify pgrst, 'reload schema';"
LEFT="$("${PSQL[@]}" -c "select count(*) from pg_tables where schemaname='public' and tablename like 'ads\_%'" | tr -d ' ')"
[ "$LEFT" = "0" ] || { echo "FAIL: rollback incompleto ($LEFT tabelle ads_ residue)"; exit 1; }
echo "OK: collaudo Supabase locale completato, rollback verificato"
