# CLI Commands Review (db/init/run/monitor)

**Date:** 2026-01-18
**Subject:** CLI correctness, ordering, and resilience gaps

---

## Summary (changes needed)

- DB view output has correctness edge cases (falsy `old_value`, `JSON.stringify` returning `undefined`, `started_at!` assumptions).
- `monitor` can reorder output due to async work inside `stdout.on('data')`; errors inside the stream pipeline can crash monitoring.
- `run`/`monitor` use `shell: true` unnecessarily; increases injection/quoting risk.
- Command functions call `process.exit()`, which blocks testability and reuse.
- `current` view always adds ellipsis; `recovery` and `stats` assume fields/tables exist.

## Action Item

- Ship a focused CLI patch set that fixes the output correctness/ordering issues (nullish checks for old values, safe stringify, guarded duration, conditional ellipsis, sequential stdout handling).

## Implementation Context

### Files and Hotspots
- `src/commands/run.ts`: uses `spawn(..., { shell: true })` and calls `process.exit()` on error/exit.
- `src/commands/monitor.ts`: async `stdout.on('data')` handler can interleave/ reorder `formatEvent()` output; also uses `shell: true`.
- `src/commands/init.ts`: uses `process.exit()` for early exits, making it hard to test.
- `src/commands/db/state-view.ts`: `JSON.stringify(value)` can return `undefined`, then `.split()` throws.
- `src/commands/db/current-view.ts`: `Prompt: ${substring}...` always appends `...` even for short prompts.
- `src/commands/db/recovery-view.ts`: `new Date(incomplete.started_at!)` assumes `started_at` is always set.
- `src/commands/db/stats-view.ts`: `SELECT COUNT(*) FROM <table>` assumes table exists; missing tables throw.

### Suggested Fix Pattern
1) Replace `shell: true` with direct argument arrays and `shell: false` (default) in `run`/`monitor`.
2) Use a safe stringify helper:
   - `const safe = JSON.stringify(value) ?? String(value)` to avoid `undefined`.
3) Guard `started_at` with a nullish check and print `'(unknown)'` when missing.
4) Only append ellipsis when truncating: `prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt`.
5) Serialize `monitor` output by buffering event formatting in a queue or `for await` loop.
6) Replace `process.exit()` with `throw` + top-level CLI handler (improves tests and reuse).
