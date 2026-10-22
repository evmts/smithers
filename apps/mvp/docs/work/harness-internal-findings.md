---
title: Rework harness mutation, compaction and completion regressions
status: done
area: sdk
owner: codex-fix-rework-3f81cf73-952207
updated: 2026-10-22
links: [../../../../packages/smithers/agent/harness/docs/api.md]
---

Rework of bounced commit `3f81cf738f06` on current `main@origin`.
Uses the library catalog's `@smthrs/harness` cell-loop implementation and
`@smthrs/agent` production composition; no new library or persisted schema.

Preserve declared mutations after failures, pending compaction marks when
message delivery is disabled, and actions evaluated inside console arguments.
Guard the worked example's completion against failed calls and absent hits.
Validate both whole package suites, including the CellFlows declaration trail.

The bounce reproduced: CellFlows passed on the parent, then failed because its
declaration-trail fixture records the complete model system prompt. Regenerating
that fixture changes only the two system-prompt strings containing the corrected
example. Every declaration, call, completion and native record stays identical;
the test retains its full trail comparison and explicit descriptor assertions.

The current base already has harness import rules and their generated target.
Extend the existing rule instead of reintroducing the patch's second block or
its obsolete index hunks. Target-index regeneration reports no remaining drift.

Validation on Node 26.5.0 after frozen offline installation:

- Regression cases on the original source: 11 failed, 111 passed; all four
  affected areas failed behaviorally before the fix.
- Parent CellFlows suite: 43 passed. Applying the bounced runtime changes
  reproduced its single fixture mismatch; fixture regeneration preserves
  every non-prompt value.
- Whole harness suite (`pnpm --dir packages/smithers/agent/harness exec vitest
  run --maxWorkers=4`): 2,512 passed, 3 skipped; 100% statements, branches,
  functions and lines, with unchanged thresholds. The initial default-worker
  run hit the existing QuickJS host-stack depth test; its isolated retry passed.
- Both package `importRules` targets passed. Both package test typechecks
  (`tsc -p tsconfig.test.json --noEmit`) passed.
- MVP `tsc --noEmit`: passed before and after, no diagnostics in either run.
- Package formatting and regenerated target-index checks passed.
- Astra review: no remaining findings. E2E not run, as requested.
- Whole agent suite (`pnpm --dir packages/smithers/agent exec vitest run
  --maxWorkers=4`), run on both the parent and the final rework: 2,225 passed,
  3 skipped in each. Both commands exit 1 solely because the existing 100%
  coverage gate fails identically: statements 99.83% (4,863/4,871), branches
  99.79% (3,479/3,486), functions 99.72% (1,447/1,451), lines 99.88%
  (4,328/4,333). No new test failure, uncovered site or coverage loss. No
  thresholds or production exclusions changed. The default-worker attempt
  encountered timing failures; the complete four-worker runs are the receipts.
- Fable review unavailable: neither a session tool nor a local CLI is present.
