# CLI tests miss entrypoint behavior
Priority: HIGH

## Evidence
- `test/cli.test.ts` constructs a stub `Command` rather than executing `bin/cli.ts`.
- Entry-point logic in `bin/cli.ts` includes error handling and validation paths not covered by tests.

## Problem
- Current tests do not verify actual CLI wiring, argument parsing, exit codes, or error output.

## Impact
- Regressions in CLI behavior (tui error handling, hook-trigger validation, db path resolution) can ship undetected.

## Recommendation
- Add `bun:test` suites that execute `bin/cli.ts` via `Bun.spawn` and assert:
  - `hook-trigger` rejects invalid type/JSON with non-zero exit.
  - `tui` handles non-TTY and prints actionable error.
  - `run`/`monitor` commands accept default args and help output.
- Alternatively factor a CLI builder function and unit-test command definitions + action wiring.

## References
- `bin/cli.ts`
- `test/cli.test.ts`
