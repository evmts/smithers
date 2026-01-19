# Components-core review - action items only (non-duplicate)

## P1: stop-condition message fallback is wrong
- Risk: `Orchestration` always returns "Stop condition met" even when a more specific fallback exists.
- Action: compute message from the condition when `message` is undefined.
- Steps:
  1) In `src/components/Orchestration.tsx`, replace `message = message || ...` with `const message = condition.message ?? ...`.
  2) Add test to cover both explicit message and fallback message paths.

## P1: Smithers structured result mismatch
- Risk: UI expects `SmithersResult` fields that are never stored, so metadata renders empty or wrong.
- Action: store the full `smithersResult` (or render only stored fields).
- Steps:
  1) In `src/components/Smithers.tsx`, write `smithersResult` into `result_structured`.
  2) Or update render to only read `script`/`scriptPath` if that is the chosen schema.
  3) Add test for structured result round-trip.

## P2: tail-log throttle timeout cleanup on all exit paths
- Risk: pending timeout can fire after unmount or error, causing late work or noise.
- Action: clear throttle timer in all completion/error branches.
- Steps:
  1) In `src/components/Claude.tsx`, ensure timer is cleared in `catch`/`finally`.
  2) Add test: force error path and assert no trailing timer updates.

## P2: make "no tasks started" grace period configurable
- Risk: fixed 500ms heuristic can prematurely complete under slow startup or large renders.
- Action: expose a prop or DB state key for the grace period and tie it to a clear lifecycle signal.
- Steps:
  1) Add `idleGraceMs` (or similar) to `SmithersProviderProps` with default.
  2) Use it to compute the stable-count threshold and update comments accordingly.
  3) Add a test with a longer grace period to prevent premature completion.

## Debugging Plan

### Summary
All 4 issues verified as **RELEVANT** - code patterns match review concerns.

### P1: Stop-condition message fallback
**Files:** `src/components/SmithersProvider.tsx` (lines 442-465)
**Root cause:** Line 444 sets `message = condition.message ?? 'Stop condition met'`, then lines 449/454/459/465 do `message = message || ...` which never triggers since message is truthy.
**Fix:** Change to:
```ts
const defaultMessage = (() => {
  switch (condition.type) {
    case 'total_tokens': return `Token limit ${condition.value} exceeded`
    case 'total_agents': return `Agent limit ${condition.value} exceeded`
    case 'total_time': return `Time limit ${condition.value}ms exceeded`
    case 'report_severity': return `Critical report(s) found`
    default: return 'Stop condition met'
  }
})()
const message = condition.message ?? defaultMessage
```
**Test:** Add test in `src/components/SmithersProvider.test.tsx` covering both explicit and fallback message paths.

### P1: Smithers structured result mismatch
**Files:** `src/components/Smithers.tsx` (line 234)
**Root cause:** Only `{ script, scriptPath }` stored, but `SmithersResult` has `output`, `tokensUsed`, `durationMs`, `stopReason`.
**Fix:** Line 234, change to:
```ts
smithersResult,  // Store full result object
```
**Test:** Add test verifying `result_structured` round-trip in `src/components/Smithers.test.tsx`.

### P2: Tail-log throttle timeout cleanup
**Files:** `src/components/Claude.tsx` (lines 327-363)
**Root cause:** `pendingTailLogUpdateRef` cleared only on success (lines 284-287), not in catch/finally.
**Fix:** Add to `finally` block (after line 358):
```ts
if (pendingTailLogUpdateRef.current) {
  clearTimeout(pendingTailLogUpdateRef.current)
  pendingTailLogUpdateRef.current = null
}
```
**Test:** Mock error path, assert no pending timers after completion.

### P2: Grace period configurable
**Files:** `src/components/SmithersProvider.tsx` (lines 549-550)
**Root cause:** Hardcoded `stableCount > 50` with 50ms interval = 500ms grace.
**Fix:**
1. Add to `SmithersProviderProps`: `idleGraceMs?: number` (default 500)
2. Compute threshold: `const graceThreshold = Math.ceil((props.idleGraceMs ?? 500) / 50)`
3. Replace `stableCount > 50` with `stableCount > graceThreshold`
**Test:** Add test with `idleGraceMs={1000}` verifying no premature completion.

### Grep patterns
```sh
grep -n "condition.message" src/components/SmithersProvider.tsx
grep -n "result_structured" src/components/Smithers.tsx
grep -n "pendingTailLogUpdateRef" src/components/Claude.tsx
grep -n "stableCount > 50" src/components/SmithersProvider.tsx
```

### Test commands
```sh
bun test src/components/SmithersProvider.test.tsx
bun test src/components/Smithers.test.tsx
bun test src/components/Claude.test.tsx
```
