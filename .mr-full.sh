#!/bin/bash
# Full ./internal/services at S in a cleaned slot (ignored files from earlier jobs removed, node_modules kept).
set -o pipefail
git clean -fdxq -e node_modules -e .mr-full.sh
echo "CLEAN=$? ignored_left=$(git status --ignored --short | grep -v node_modules | wc -l)"
for b in /usr/lib/postgresql/*/bin; do export PATH="$b:$PATH"; done
pgdir=$(mktemp -d); PGP=$((49400 + RANDOM % 2000))
initdb -D "$pgdir/pg" -U smithers --auth=trust >/dev/null && pg_ctl -D "$pgdir/pg" -o "-h 127.0.0.1 -p $PGP -k $pgdir -c dynamic_shared_memory_type=mmap" -l "$pgdir/pg.log" start >/dev/null || exit 3
trap 'pg_ctl -D "$pgdir/pg" -m fast stop >/dev/null 2>&1; rm -rf "$pgdir"' EXIT
export SMITHERS_TEST_DATABASE_URL="postgres://smithers@127.0.0.1:$PGP/postgres?sslmode=disable" SMITHERS_REQUIRE_DATABASE_TESTS=1
log=$(mktemp)
(cd packages/backend && go test ./internal/services -count=1 -timeout 80m) > "$log" 2>&1
rc=$?
grep -E "^--- FAIL|^FAIL|^ok|panic: test timed out" "$log" | head -20
echo "FULL_SERVICES=$rc"
