---
title: Bound live-query notifications and type construction failures
status: done
area: effect-tanstack-db
owner: codex-mini
updated: 2026-10-22
links: [effect-tanstack-db-and-effect-electric.md]
---

Use the library catalog entry `@smthrs/effect-tanstack-db` for scoped live queries.

`LiveQuery.rows` keeps one pending notification: each pull reads the current
snapshot, so retaining more notifications only repeats that snapshot.
`LiveQuery.make` maps construction exceptions to `Collection.LoadFailed` with
their original cause. App store and test-host types carry that error. No device
schema changed.

Both regressions failed before the fix: 256 paused updates produced 256 copies
of the current snapshot, and a real TanStack query compilation error escaped
`Effect.flip` as a defect. The package's original suite plus regressions had
167 passes and those two failures; afterwards all 169 passed with 100% statement,
branch, function and line coverage (`pnpm exec vitest run`).

App A/B covers auth, TODOs, home stores/live queries and repository faults:
71 tests passed on the original implementation. Two clone timing failures in
the first post-change run passed isolated and serial reruns. The serial run
exposed a TODO test race: remote arrival precedes local draft cleanup, so its
second wait could match the original draft. It now waits for cleanup before
creating the second draft, preserving every existing assertion.

Package `pnpm run check`, changed-source eslint and dprint checks passed.
The app's `pnpm exec tsc --noEmit` passed before and after the change. Both
package and app `importRules` passed. Codex Astra reviewed the implementation,
error propagation and test race without actionable findings.

App integration validation is not consistently green. After the cleanup wait,
the TODO suite had 25 passes and two agent cases with zero model requests;
both passed isolated reruns. Repeating the original library implementation
with the same corrected test passed all 27. The final fixed-library run had
26 passes and one different agent case with zero model requests (that case
passed earlier fixed-library runs). The other four selected app files passed
all 44 tests in the serial run. These post-change failures remain a validation
limitation; no consistent product cause was established. E2e: not run (mini clone).
