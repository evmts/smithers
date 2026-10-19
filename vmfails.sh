#!/bin/bash
O=$(mktemp -d)
bash packages/backend/scripts/with-test-postgres.sh go -C packages/backend test ./internal/compose -count=1 -v -timeout 50m > $O/c.log 2>&1; e=$?
echo "== COMPOSE exit=$e pass=$(grep -cE '^\s*--- PASS' $O/c.log) fail=$(grep -cE '^\s*--- FAIL' $O/c.log) skip=$(grep -cE '^\s*--- SKIP' $O/c.log)"
grep -E '^\s*--- FAIL' $O/c.log | sed -E 's/ \([0-9.]+s\)$//; s/^[[:space:]]+//' | sort -u | sed 's/^/FAILED: /'
grep -E '^(FAIL|panic:|ok)[[:space:]]' $O/c.log | head
