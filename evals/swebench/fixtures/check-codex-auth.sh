#!/bin/bash
set -euo pipefail
S="$(cd "$(dirname "$0")/.." && pwd)"
exec python3 "$S/fixtures/check-codex-auth.py"
