#!/bin/bash
# Runs each test.txt line in its own bash, prints its exit code and the tail of its output.
i=0
while IFS= read -r line; do
  i=$((i+1)); [ -z "$line" ] && continue
  bash -c "$line" > /tmp/mr-$i.log 2>&1; rc=$?
  echo "LINE$i=$rc"; grep -E "^(ok|FAIL|---|panic)|passed|failed|Error" /tmp/mr-$i.log | grep -v "^--- PASS" | tail -12
done < "$1"
