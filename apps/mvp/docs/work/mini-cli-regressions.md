---
title: CLI connection, token, and argument regressions
status: done
area: sdk
owner: codex mini/fix-packages-smithers-src-cli-066999
updated: 2026-10-21
links: []
---

Eight findings reproduced and fixed: quiet token output, premature token-file
publication, MCP filesystem overrides, history preparation outside Effect,
opaque root-like argument values, literal resume routing, inherited aliases,
and MCP SIGINT cancellation. The initial two regression files failed all 13
cases against the original code. The history case created `.flows` despite a
pre-aborted invocation; the real MCP process ignored SIGINT after its handshake.

Gateway publication now follows successful layer and socket acquisition through
`Serve.Ready`. Additional real socket cases cover an occupied port and successful
HTTP readiness. Existing Control services use the `@smthrs/control` catalog entry
in `docs/libraries.md`; no new library was selected.

Not reproduced as behavioral bugs: the events adapter's status polling and the
duplicated exit settlement. Polling observes durable completion even without a
later journal event; no incorrect outcome was demonstrated. Both settlement
paths already translated failures identically. The confirmed Effect and startup
fixes now use the shared settlement boundary.

Validation on Node 26.5.0 after frozen offline pnpm installation:

- `vitest run` for CliRegressions, CliCancellationRegression, Argv,
  UnifiedArguments, UnifiedEntry, ControlBridge, and Serve: 173 passed in seven
  files, with coverage disabled for this focused run.
- `tsc -p tsconfig.test.json --noEmit`, changed-source ESLint, and changed-file
  dprint checks passed.
- `smithers-build test '//packages/smithers:importRules'` reports `unknown_label`:
  this package declares no such target. The ImportRules runner passed the
  fixed-wait prohibition over the new regressions (one rule, 603 source files).
- Native gateway checks initially failed because this clone lacked the native
  helper. Built it here with `cargo build --locked --offline -p smithers-ffi
  --bin smithers-jj-export`; the final affected suite passed with the real helper.
- Playwright: not run (mini clone). Whole-repository and whole-package coverage
  suites were not run.
- Codex Astra review found no concrete bugs. No Fable review capability was
  available in this session.

One local commit and the requested mini bookmark; no push or main movement.
