---
title: Control cancellation and caller boundaries
status: done
area: sdk
owner: Codex mini/fix-packages-smithers-control-src-049033
updated: 2026-10-22
links: [../../../../packages/smithers/control/README.md]
---

Reproduce and fix six reported control regressions: cancellation chronology,
channel launch identity and signal ownership, agent RPC signal authority,
authenticated watch transport, and observing executor settlement.

Library catalog entry: `@smthrs/control` (start, approve, steer, cancel or watch runs).

Cancellation attribution now respects the timing of cancellation evidence and
preserves normal engine-column-before-journal ordering. Channel starts retain
the channel principal; channel signals use Control's existing reader boundary.
The RPC client refuses agent-attributed signals before they can inherit its
credential. Credentialed watch defaults to HTTP, with an explicit transport
choice. Observing executors leave parked settlement to a driving host while
continuing to accept cancellation.

Validation (Node 26.5.0; offline frozen install):

- Final regression files against the original production sources: 15 failed,
  53 passed. Failures reproduce all six findings; the fixed sources were
  restored before final verification.
- `pnpm --dir packages/smithers/control run test:matrix --maxWorkers=2`:
  SQLite 1,198 passed / 1 skipped; PostgreSQL 1,198 passed / 1 skipped.
  Merged statements, branches, functions and lines: 100%.
- `pnpm --dir packages/smithers/control exec tsc -p tsconfig.test.json --noEmit`:
  passed. Changed source lint and changed TypeScript formatting: passed.
- `pnpm exec smithers-build test '//packages/smithers/control:importRules'`:
  passed. The package previously had no such target; the new target checks
  host imports, Effect boundaries, and fixed waits/mocks in these regressions.
- `pnpm exec tsc --noEmit` in `apps/mvp`: passed before and after.
  No persisted device schemas changed.
- `pnpm run target-index` and
  `pnpm exec smithers-build lint '//:targetIndex'`: passed. The regenerated
  index also reconciles pre-existing declaration drift.
- Astra review found two integration gaps; both gained failing regressions,
  were fixed, and passed follow-up review.
- Playwright: not run (mini clone).
