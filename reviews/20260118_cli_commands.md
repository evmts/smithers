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

## Debugging Plan

### Files to Investigate
- `src/commands/run.ts` - shell:true, process.exit()
- `src/commands/monitor.ts` - shell:true, async stdout handler, process.exit()
- `src/commands/init.ts` - process.exit()
- `src/commands/db/state-view.ts` - unsafe JSON.stringify
- `src/commands/db/current-view.ts` - unconditional ellipsis
- `src/commands/db/recovery-view.ts` - started_at! assertion
- `src/commands/db/stats-view.ts` - assumes tables exist

### Grep Patterns
```bash
grep -n "shell: true" src/commands/*.ts
grep -n "process.exit" src/commands/**/*.ts
grep -n "async.*on\('data'" src/commands/*.ts
grep -n "started_at!" src/commands/**/*.ts
grep -n "substring.*\.\.\." src/commands/**/*.ts
```

### Test Commands
```bash
# Reproduce reordering - run monitor with chatty agent
bunx smithers-orchestrator monitor

# Reproduce stats crash - run on fresh DB missing tables
rm .smithers/db.sqlite && bunx smithers-orchestrator db stats
```

### Proposed Fix Approach

1. **Remove `shell: true`** in run.ts:58 and monitor.ts:65 - already passing array args
2. **Serialize async output** in monitor.ts - queue events and process sequentially:
   ```ts
   const queue: Promise<void>[] = []
   child.stdout?.on('data', (data) => {
     queue.push((async () => { /* existing logic */ })())
   })
   ```
3. **Safe stringify helper**:
   ```ts
   const safeStringify = (v: unknown) => JSON.stringify(v) ?? String(v)
   ```
4. **Conditional ellipsis** in current-view.ts:61:
   ```ts
   `Prompt: ${agent.prompt.length > 100 ? agent.prompt.substring(0,100) + '...' : agent.prompt}`
   ```
5. **Guard started_at** in recovery-view.ts:36:
   ```ts
   `Started: ${incomplete.started_at ? new Date(incomplete.started_at).toLocaleString() : '(unknown)'}`
   ```
6. **Wrap table counts in try/catch** in stats-view.ts or check table existence first
7. **Replace process.exit()** with thrown errors caught at CLI entry point
