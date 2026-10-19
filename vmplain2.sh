#!/bin/bash
while IFS= read -r line; do [ -n "$line" ] || continue; echo "+ $line"; bash -o pipefail -c "$line" 2>&1 | tail -40; echo "== exit=${PIPESTATUS[0]}"; done < "$1"
