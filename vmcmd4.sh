#!/bin/bash
# usage: vmcmd3.sh <file of test lines>
# Combined lane B tree: vet, compile every test package, run every queued test line, then the full services package.
O=$(mktemp -d)
vet=$(go -C packages/backend vet ./... 2>&1 | grep -v 'workspace_runtime_artifacts.go' | grep -v '^#')
if [ -n "$vet" ]; then echo VET_FAIL; echo "$vet" | head -40; else echo VET_OK; fi
go -C packages/backend test -run '^$' -count=1 ./... > $O/compile.log 2>&1; c=$?; echo "COMPILE_EXIT=$c"; [ $c = 0 ] || grep -vE '^(ok|\?)\s' $O/compile.log | head -40
n=0
while IFS= read -r line; do
  [ -n "$line" ] || continue; n=$((n+1))
  bash -o pipefail -c "$line" > $O/line$n.log 2>&1; e=$?
  echo "== LINE $n exit=$e pass=$(grep -cE '^\s*--- PASS' $O/line$n.log) fail=$(grep -cE '^\s*--- FAIL' $O/line$n.log) skip=$(grep -cE '^\s*--- SKIP' $O/line$n.log) :: ${line:0:110}"
  grep -E '^\s*--- (PASS|FAIL|SKIP)' $O/line$n.log | grep -E 'TestAReleaseNever|TestAJoinWaits|TestAReleaseThatFails|TestRetiringABox|TestAgentBoxReleasesProgress|TestARunWhoseCredential|TestAReleaseOnARuntimeThatCannot|TestAHostedCodingHosts|TestQuiesceAgentBox|TestHosted|TestRuntimeStore' | head -20
  [ $e = 0 ] || grep -nE -B2 -A25 '^\s*--- FAIL|^panic:|^FAIL|not ok|_test.go:[0-9]+: ' $O/line$n.log | grep -vE 'level=(INFO|DEBUG)' | head -120
done < "$1"
[ "${2:-}" = nofull ] && exit 0
[ "${2:-}" = nofull ] && exit 0
W='bash packages/backend/scripts/with-test-postgres.sh go -C packages/backend test'
$W ./internal/services -count=1 -v -timeout 50m > $O/services.log 2>&1; e=$?
echo "== SERVICES_ALL exit=$e pass=$(grep -cE '^\s*--- PASS' $O/services.log) fail=$(grep -cE '^\s*--- FAIL' $O/services.log) skip=$(grep -cE '^\s*--- SKIP' $O/services.log)"
[ $e = 0 ] || grep -nE -B2 -A25 '^\s*--- FAIL|^panic:' $O/services.log | head -150
