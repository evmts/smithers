#!/bin/bash
# Runs each line of $1 in its own bash with a private log dir; prints each exit code and the failing lines.
d=$(mktemp -d); i=0
while IFS= read -r line; do
  i=$((i+1)); [ -z "$line" ] && continue
  bash -c "$line" > "$d/$i.log" 2>&1; rc=$?
  echo "LINE$i=$rc"
  if [ $rc -ne 0 ]; then grep -E "^(FAIL|--- FAIL|panic:)|^\s+\S+_test\.go:[0-9]+:|Error Trace|Error:|\(fail\)|unformatted|vet:|cannot|undefined|failed" "$d/$i.log" | grep -v "^--- PASS" | head -30; tail -5 "$d/$i.log"; fi
done < "$1"
echo "LOGDIR=$d"
