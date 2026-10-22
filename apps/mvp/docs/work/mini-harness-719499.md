---
title: Rework harness recovery and turn evidence after lander bounce
status: done
area: harness
owner: Codex fix-rework-232ed3b0-730135
updated: 2026-10-22
links: []
---

Rework bounced commit `232ed3b05cf5` on `main@origin` (`ed39207e`). The supplied
patch dry-run and application both succeeded; no target paths had disappeared.
Library catalog entries: `@smthrs/harness` for the cell loop, `@smthrs/agent`
for host composition, and `@smthrs/flow` for keyed durable activities.

Retain blank-compaction rejection, full-input digests for truncated check labels,
and component timing on failures and interruptions. Unknown call attempts fail
closed unless the host supplies `recoverCall`, which must enter its keyed durable
activity. Native fresh calls and recovery use the same Action, preserving existing
keys, recorded settlements, ownership fencing, and recovery consent. A native
settled timeout replays after a lost harness settlement write without repeating
external work. A known park may authorize another attempt; parking admission of an
orphan cannot remove its recovery requirement. Native durable suspensions remain
resumable. No persisted call identities or trace facts change.

Validation on Node 26.5.0:

- `pnpm install --frozen-lockfile --offline`: passed without network fallback.
- `pnpm --filter @smthrs/agent exec vitest run --coverage.enabled=false test/StepTraceCalls.test.ts --reporter=verbose`: both SIGKILL cases passed, including byte-identical existing facts and partial-call recovery.
- `pnpm --filter @smthrs/agent exec vitest run --coverage.enabled=false test/RunawayGuard.test.ts -t 'parks a cell past' --reporter=verbose`: passed; Continue re-evaluates the cell.
- `pnpm --filter @smthrs/agent exec vitest run --coverage.enabled=false test/CellLoop.test.ts`: 21 passed, including native suspension and lost-timeout-settlement recovery.
- `pnpm --filter @smthrs/harness exec vitest run --maxWorkers=2`: 2517 passed, 3 skipped; 68 files passed, 2 skipped. All four coverage measures are 100%.
- `pnpm --filter @smthrs/agent exec vitest run --maxWorkers=4 --reporter=verbose`: 2227 passed, 3 skipped; 163 files passed, 2 skipped. The 100% coverage gate failed on untouched files (99.83% statements, 99.79% branches, 99.72% functions, 99.88% lines); changed `FlowEngineLike.ts` has 100% coverage. The identical command on `main@origin` sources/tests passed 2225 tests (3 skipped) and failed only the same coverage gate, with identical percentages and uncovered locations. Both full agent commands exited 1 solely for these pre-existing coverage gaps; no behavioral test failed and no threshold was changed. The verified rework sources/tests were restored byte-for-byte after this comparison.
- `pnpm exec smithers-build test '//packages/smithers/agent:importRules' '//packages/smithers/agent/harness:importRules'`: passed, no violations.
- Harness and agent `tsc -b tsconfig.json` and `tsc -p tsconfig.test.json --noEmit`: all passed.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after the production changes; no app code changed.
- Changed production ESLint and changed TypeScript dprint checks: passed.
- No Playwright/e2e or whole-repository tests ran.

Astra found an admission-park recovery downgrade; fixed with permission-park and
interruption regressions. Astra re-reviewed the correction with no remaining
actionable findings. Fable is unavailable in this session. No push, bookmark
movement, or deployment; the requested new bookmark will name the final commit.
