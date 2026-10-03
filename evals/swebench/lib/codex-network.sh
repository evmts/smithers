#!/bin/bash
# Historical lane names remain readable; stock execution always uses the sandbox.
set -euo pipefail
CALLER="${1:-codex-network.sh}"
NETWORK="${SWB_CODEX_NETWORK:-sealed}"
case "$NETWORK" in
  sealed|off) ;;
  *) echo "$CALLER: stock Codex requires workspace-write with spawned network disabled; SWB_CODEX_NETWORK=on is unsupported." >&2; exit 2 ;;
esac
printf '%s\n' "$NETWORK"
