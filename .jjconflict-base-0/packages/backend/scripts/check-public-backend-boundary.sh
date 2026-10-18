#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../../.."
exec python3 -B packages/backend/scripts/check-go-boundaries.py "$@"
