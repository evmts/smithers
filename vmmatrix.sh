#!/bin/bash
# usage: vmmatrix.sh <run pattern> <count>
O=$(mktemp -d)
bash packages/backend/scripts/with-test-postgres.sh go -C packages/backend test ./internal/services -run "$1" -count="${2:-1}" -v -timeout 50m > $O/m.log 2>&1; e=$?
echo "== MATRIX exit=$e pass=$(grep -cE '^\s*--- PASS' $O/m.log) fail=$(grep -cE '^\s*--- FAIL' $O/m.log)"
grep -E '^\s*--- FAIL|lock_matrix_integration_test.go:[0-9]+: (start|release|admission)|Error:|expected|actual|Messages:|panic' $O/m.log | grep -vE 'took=[0-9]+ms err=<nil>' | head -${3:-200}
grep -cE '40P01|deadlock detected' $O/m.log | sed 's/^/DEADLOCK_MENTIONS=/'
grep -cE '55P03|lock timeout' $O/m.log | sed 's/^/LOCKTIMEOUT_MENTIONS=/'
