#!/bin/bash
while IFS= read -r line; do [ -n "$line" ] || continue; bash -o pipefail -c "$line"; echo "== exit=$?"; done < "$1"
