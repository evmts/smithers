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
