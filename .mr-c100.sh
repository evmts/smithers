#!/bin/bash
# ClaimDeadline x100 with a private Postgres; the full log path is printed first and the file is kept.
set -o pipefail
tag=$1
log=/tmp/c100-$tag-$(date +%s).log
echo "LOG=$log"
for b in /usr/lib/postgresql/*/bin; do export PATH="$b:$PATH"; done
pgdir=$(mktemp -d); PGP=$((49400 + RANDOM % 2000))
initdb -D "$pgdir/pg" -U smithers --auth=trust >/dev/null && pg_ctl -D "$pgdir/pg" -o "-h 127.0.0.1 -p $PGP -k $pgdir -c dynamic_shared_memory_type=mmap" -l "$pgdir/pg.log" start >/dev/null || { echo "C100=3"; exit 3; }
trap 'pg_ctl -D "$pgdir/pg" -m fast stop >/dev/null 2>&1; rm -rf "$pgdir"' EXIT
export SMITHERS_TEST_DATABASE_URL="postgres://smithers@127.0.0.1:$PGP/postgres?sslmode=disable" SMITHERS_REQUIRE_DATABASE_TESTS=1
cd packages/backend && go test ./internal/services -run '^TestClaimDeadlineWithPoolHeadroomIsNeverReportedAsPoolExhaustion$' -count=100 -timeout 40m -v > "$log" 2>&1
rc=$?
echo "PASSES=$(grep -c '^--- PASS' "$log") FAILS=$(grep -c '^--- FAIL' "$log") TIMEOUT=$(grep -c 'panic: test timed out' "$log")"
grep -A8 '^--- FAIL' "$log" | grep -E 'Error:|expected|actual|Messages' | head -12
echo "C100=$rc"
