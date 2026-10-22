---
title: CLI configuration races and retained workspace leases
status: in-progress
area: sdk
owner: mini/fix-packages-smithers-src-063607
updated: 2026-10-21
links: [../../../../packages/smithers/src/Agents.ts, ../../../../packages/smithers/src/Bug.ts, ../../../../packages/smithers/src/ClaudeMirror.ts, ../../../../packages/smithers/src/CloudSandbox.ts]
---

Five supplied findings reproduced with failing tests and fixed:

- Competing stale-lock recoverers: real processes and FIFO barriers admitted
  two writers before the fix. An exclusive recovery guard now spans stale
  observation, removal and acquisition. A crashed guard fails closed and the
  refusal names it for manual repair.
- Configuration mismatch: the original complete temporary file survived a
  refused update. A finalizer now removes it on every exit from staging.
- Binary report inspection: ArrayBuffer, typed-array and DataView byteLength
  getters ran before descriptor refusal. Inspection now calls intrinsic getters
  with native brand checks, without reading the caller's accessor.
- Subscription removal: a stale snapshot restored another session's removed
  entry. Writes now replace only their own hashed entry. TTL buckets bound
  refresh history and preserve removals across rollover; legacy snapshots stay
  readable. Concurrent operations on the same entry retain last-rename-wins.
- Sticky leases: both acquisition and attachment stopped at one renewal even
  after virtual time advanced. The existing scoped renewal now covers retained
  work and stops when its scope closes.

Unresolved:

- The noncooperating-writer overwrite is reproduced and retained as an expected
  failure. A portable rename cannot compare-and-swap the destination. Refusing
  existing-file replacement would change normal registration behavior; that
  choice was presented to Will and no answer was received. Existing behavior
  remains. A second read would only narrow the race.
- Lifecycle polling, retries and renewal remain outside durable steps. This
  architectural violation is visible in source, but no isolated failing
  crash/replay regression was established. It is not claimed fixed. Moving it
  requires lifecycle flow orchestration and a host/runtime contract, rather
  than disguising Effect loops as durable work.

Validation:

- Node 26.5.0; frozen offline pnpm installation succeeded.
- Original races and accessor cases failed for their reported reasons.
- Focused source/file suites pass; CloudSandbox suite: 80 passed, 1 skipped.
- The existing bug-report CLI preview hit its 30-second child-process timeout
  both before and after these changes. The focused green run excludes it.
- Package importRules, TypeScript test checking and changed-source ESLint pass.
- Target index regenerated and its drift check passed.
- Playwright/e2e: not run (mini clone).
- Astra review caught unbounded subscription history in the initial patch;
  a failing storage-bound regression and per-entry buckets resolved it. Final
  Astra review found no further issues. Fable tooling is unavailable.

Catalog entries: Effect filesystem/process services and `@smthrs/flow` durable
retry/timer services. No new runtime or third-party library was added. Existing
CLI synchronous public APIs remain synchronous. No push or main/bookmark move.
