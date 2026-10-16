#!/bin/sh
# From the checkout: sh packages/backend/checks/C-SPK-05/run.sh --state "$STATE" --out /path/to/new/evidence
set -eu
cd "$(dirname "$0")/../../../.."
df -h "$HOME"
export GIT_CEILING_DIRECTORIES="$HOME"
export MSB_BACKEND=local
exec python3 -B packages/backend/checks/C-SPK-05/run.py "$@"
