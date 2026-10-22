---
title: Repair completion claim calibration
status: done
area: harness
owner: Codex mini/harness-calibration
updated: 2026-10-22
links: [../../../../packages/smithers/agent/harness/test/CompletionClaimCalibration.test.ts]
---

Trace the failing calibration assertion through jj history, fix its cause without changing thresholds, and run the complete harness suite. Library catalog entry: `@smthrs/harness`; no new library or runtime.

Main `71ed412d` passes in a colocated clone, but the original calibration file
fails nine cases in a real non-colocated jj workspace. The first case, "grades
the retained corpus and records who judged what", throws from `git status`
before reaching `expect(code).toBe(0)`. `jj log` and `jj diff` on the brake,
transport, calibration runner and report trace the unconditional Git commands
to `bf149607182254b8beedf58f2a02eba8ffebdbf2`, which introduced calibration.
This is a test-runner portability defect, not a recent product regression or
a stale classifier expectation. The later overclaims change `d73cc89b`
updated both its question and retained calibration report.

The runner now reads jj provenance through jj, comparing the source tree to
one recorded parent (the latest parent, including merge working copies), and
keeps Git-only checkout support. Commands run from the source repository.
Real repository regressions cover clean, edited, unrelated and new files,
CI revision overrides, both colocation modes, Git-only checkout and merges.
Classifier questions, corpus, live report and calibration thresholds are unchanged.

Validation on Node 26.5.0:

- Original non-colocated calibration: nine failures from missing Git metadata.
- Merge regression: failed on a multi-parent `@-`, then passed using one parent consistently.
- `pnpm --filter @smthrs/harness exec vitest run test/CompletionClaimCalibration.test.ts --coverage.include=test/calibration/sourceIdentity.ts --maxWorkers=2`: 20 passed; new helper 100% statements, branches, functions and lines.
- Full non-colocated workspace, `node node_modules/vitest/vitest.mjs run --maxWorkers=2` from the harness package: 2,481 passed, three skipped, 100% on every configured coverage measure. Dependencies were linked from this clone; no test was excluded.
- Colocated full run before the merge regression: 2,480 passed, three skipped, 100% coverage. An earlier non-colocated run failed the existing `ReplRealm` host-stack probe once; both subsequent complete runs passed it unchanged.
- Scoped dprint and typecheck of the changed calibration test and its imports: passed. Full `tsc -p tsconfig.test.json --noEmit` fails on existing `HarnessErrorCause.test.ts:86` JSON narrowing errors. ESLint does not configure these test files.
- Astra review: merge finding fixed and regression retained; final review has no findings. Fable is unavailable in this session.
- Live gateway and browser e2e were not run; the retained live calibration remains unchanged. No public API changed.
