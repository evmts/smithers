---
title: Rework harness ledger, cell and compaction fix
status: blocked
area: harness
owner: codex-602078
updated: 2026-10-22
links: []
---

Rework bounced commit 467ba8d3c113 on main@origin. Library catalog entries:
`@smthrs/harness` for cell extraction, settlement evidence and compaction;
`@smthrs/agent` for standard host bindings. Keep opaque failures by default,
and explicitly declare public classifications at the bindings that own them.

Validate the complete harness and agent suites, both importRules targets,
and the consuming apps/mvp typecheck. No Playwright, push or main movement.

Implemented the original ledger evidence, property-path, cell separator,
failure metadata and compaction fixes. The base already has an ImportRules
block and target: extend it, omit the duplicate declaration and index hunk.
Retain the newer QuickJS TestClock imports when adapting the test hunk.

The bounce was caused by opaque-by-default failure classifications. Shell
and test bindings now explicitly allow the standard library's closed code
set. Custom bindings declare their public names; CellFlows tests both the
default omission and explicit disclosure through the real engine and trace.

Validation receipts (Node 26.5.0):

- `pnpm install --frozen-lockfile --offline`: passed.
- Baseline CellFlows: 43 passed. Original source patch: exactly two failures,
  41 passed. Reworked `vitest run test/CellFlows.test.ts test/StandardFlows.test.ts
  --coverage.enabled=false --maxWorkers=2`: 102 passed, one skipped, including
  all 44 CellFlows tests.
- Eight harness regression files before source fixes: 31 failed, 518 passed.
- Harness `vitest run --exclude '**/CompletionClaimCalibration.test.ts'
  --maxWorkers=2`: 2,506 passed, three skipped; coverage writes failed ENOSPC.
  This was not a clean coverage run.
- Full harness `vitest run --maxWorkers=2 --coverage.enabled=false`: 2,525
  passed, three skipped, one failure: calibration's Git-only provenance case.
  The OS sandbox denied Git execution, honoring this request's prohibition.
- Full agent suite attempted with coverage disabled and the same Git denial.
  ENOSPC broke filesystem, persistence and module-loading tests; the run
  stalled and was interrupted. A temporary config reused the native helper
  already built by normal setup after compiler intermediates were cleared.
  No tests were excluded; the temporary config was removed. A clean complete
  agent-suite result remains unproved.
- Both `smithers-build test '//packages/smithers/agent/harness:importRules'`
  and `smithers-build test '//packages/smithers/agent:importRules'`: passed.
- Both packages' source `tsc --noEmit` and changed-source ESLint: passed.
  The consuming apps/mvp `pnpm exec tsc --noEmit`: passed before and after.
  Changed TypeScript formatting: passed.
- Astra review: no actionable findings. Fable unavailable (no tool/executable).

Validation remains blocked by disk exhaustion and the prohibition on the
suites' Git subprocesses. No committed test configuration, coverage threshold,
or test exclusion was changed to accommodate those limits.
