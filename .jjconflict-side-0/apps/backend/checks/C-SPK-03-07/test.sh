#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."
COL01_ROOT="$PWD"
for COL01_TOOL in go cargo rustup jj initdb pg_ctl pnpm node; do
  command -v "$COL01_TOOL" >/dev/null || { echo "SPIKE TEST BLOCKED: missing $COL01_TOOL" >&2; exit 1; }
done
if [[ ! -f apps/backend/checks/C-SPK-03-07/node_modules/@playwright/test/cli.js ]]; then
  pnpm --dir apps/backend/checks/C-SPK-03-07 install --offline --frozen-lockfile --ignore-scripts
fi
COL01_TEST_BUILD="$COL01_ROOT/.artifacts/spikes/col01-host-tests"
mkdir -p "$COL01_ROOT/.artifacts/col01-tmp"
export TMPDIR="$COL01_ROOT/.artifacts/col01-tmp"
export CARGO_TARGET_DIR="$COL01_TEST_BUILD/cargo"
cargo test --locked --manifest-path apps/backend/checks/C-SPK-03-07/guest/Cargo.toml
cargo build --locked --manifest-path apps/backend/checks/C-SPK-03-07/guest/Cargo.toml
export COL01_ECHO_BINARY="$CARGO_TARGET_DIR/debug/col01-echo"
export COL01_DOCHOST_BINARY="$CARGO_TARGET_DIR/debug/col01-dochost"
(cd apps/backend/checks/C-SPK-03-07 && go test -count=1 ./... && go vet ./...)
python3 -m unittest discover -s apps/backend/checks/C-SPK-03-07/jj-snapshot -v
python3 -m unittest discover -s apps/backend/checks/C-SPK-03-07 -p 'test_preflight.py' -v
node_modules/.bin/tsc --noEmit --strict --allowImportingTsExtensions --target ES2024 --module ESNext --moduleResolution Bundler --skipLibCheck --lib ES2024,DOM,DOM.Iterable apps/backend/checks/C-SPK-03-07/PACKAGE.ts apps/backend/checks/C-SPK-03-07/browser.ts apps/backend/checks/C-SPK-03-07/keystrokes.spec.ts apps/backend/checks/C-SPK-03-07/playwright.config.ts
cargo fmt --manifest-path apps/backend/checks/C-SPK-03-07/guest/Cargo.toml -- --check
bash -n apps/backend/checks/C-SPK-03-07/run.sh
node --check apps/backend/checks/C-SPK-03-07/result.mjs
node --test apps/backend/checks/C-SPK-03-07/result.test.mjs
