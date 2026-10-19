#!/bin/bash
# The two core-pool timing tests x10 with private Postgres, then optionally the full services package.
set -o pipefail
full=$1
for b in /usr/lib/postgresql/*/bin; do export PATH="$b:$PATH"; done
pgdir=$(mktemp -d); PGP=$((49400 + RANDOM % 2000))
initdb -D "$pgdir/pg" -U smithers --auth=trust >/dev/null && pg_ctl -D "$pgdir/pg" -o "-h 127.0.0.1 -p $PGP -k $pgdir -c dynamic_shared_memory_type=mmap" -l "$pgdir/pg.log" start >/dev/null || exit 3
trap 'pg_ctl -D "$pgdir/pg" -m fast stop >/dev/null 2>&1; rm -rf "$pgdir"' EXIT
export SMITHERS_TEST_DATABASE_URL="postgres://smithers@127.0.0.1:$PGP/postgres?sslmode=disable" SMITHERS_REQUIRE_DATABASE_TESTS=1
cd packages/backend
log=$(mktemp)
go test ./internal/services -run '^TestClaimDeadlineWithPoolHeadroomIsNeverReportedAsPoolExhaustion$' -count=40 -v > "$log" 2>&1; rc=$?
echo "PASSES=$(grep -c '^--- PASS' "$log") FAILS=$(grep -c '^--- FAIL' "$log")"; grep -A6 '^--- FAIL' "$log" | grep -E "^--- FAIL|Error:|expected|actual|Messages" | head -20
echo "COUNT40=$rc"
if [ "$full" = full ]; then
  go test ./internal/services -count=1 -timeout 80m > "$log" 2>&1; rc=$?
  grep -E "^--- FAIL|^FAIL|^ok|panic: test timed out" "$log" | head -20
  grep -B2 -A12 '^--- FAIL' "$log" | grep -E "^--- FAIL|Error Trace|Error:|expected|actual|Messages" | head -30
  echo "FULL_SERVICES=$rc"
fi
