---
title: Theme button system changes and dispatch defects
status: done
area: theme
owner: codex-fix-rework-7791be24-858326
updated: 2026-10-22
links: []
---

Rework bounced 7791be248135 on main's system-following deletion design from
7dfa2c8c7e44. Use the catalog's @smthrs/effect-tanstack-db local-state entry
and @smthrs/ui button. Keep deletion clearing paint and mirror; publish the
displayed mode to every view and contain toggle defects at the React boundary.

Unchanged production code failed all three store/action regressions, and the
real React test failed with the stale button label after a system change.
Deletion still clears paint and mirror with `undefined`; the displayed mode
is transient. The toggle's defect record excludes the injected sentinel.

Validation here (Node 26.5.0, frozen offline install): theme and React view
tests passed 17/17 with real durable dispatch on an isolated PostgreSQL 18
cluster inside this clone. Docker's compose services became unavailable
during the baseline run; its existing engine test failed with connection
refusal. The two telemetry contract tests pass. App `tsc --noEmit` and
`//apps/mvp:importRules` pass before and after. Astra review found no
actionable issues. No Playwright tests ran.

The whole app suite was run before and after with coverage disabled and one
worker: `pnpm --dir apps/mvp test --coverage.enabled=false --maxWorkers=1
--reporter=dot --reporter=json --outputFile.json=<report>`, with TMPDIR inside
this clone. Baseline: 23 passed files, 211 failed; after: 116 passed files,
115 failed, 3 skipped. No previously passing assertion or file newly failed.
Baseline ENOSPC left most paths uncollected (207 tests versus 2,976 after),
and the full suite also lacked working compose services. This comparison
cannot validate the uncollected paths and does not establish a passing app
suite or executed coverage. The focused theme and view suite above passes
independently using the real isolated database.
