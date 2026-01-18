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
