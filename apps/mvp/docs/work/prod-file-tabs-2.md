---
title: Keyboard focus after closing a file tab
status: blocked
area: files
owner: Codex (prod-file-tabs-2 rework)
updated: 2026-10-23
links: [../features/files.md, ../features/chat.md, ./prod-file-tabs.md, ../decisions/0081-keyboard-focus-through-file-navigation.md]
---

Rework of bounced a7af3f6e26ae on main@origin 0a03ab7a. The original
`useLayoutEffect` focus policy violated `ui.flux-state`. No rules or coverage
thresholds are weakened.

Opening Chat now records one `focusRequested` in the existing memory-only
composer collection. An input attachment dispatches `takeComposerFocus`, then
focuses only when that request was pending. Closing cancels it. Draft changes,
branch tracking and Suspense remounts create no request. The component has no
React state hooks or refs used as state. No persisted schema changes.

Keep the FileTabs fix: capture keyboard ownership before Suspense hides a
pending route; on reveal restore the connected link only if focus is on the
body. Another control focused before or during pending keeps focus. File writes
still finish persistence before navigation.

Library catalog entries: `@smthrs/ui` and `@smthrs/effect-tanstack-db`.
This repairs existing primitives and chat actions; no new plugin or public API.
The DOM tests use the real app services, compose Postgres/Electric and the
existing happy-dom version with Node networking retained. Chromium tests use
the real router and a held navigation to exercise Suspense's browser behavior.

Red receipts: the bounced revision fails `//apps/mvp:importRules`; the new
idle-remount test fails with the textarea focused instead of the body (5 other
component tests pass). The new action test fails because `takeComposerFocus`
does not exist. The original FileTabs red receipt remains documented in the
previous revision; its implementation is unchanged by this rework.

Green receipts (Node 26.5.0):

- `pnpm exec smithers-build test '//apps/mvp:importRules' --workspace .`: passed,
  one target ran, no failures. `//packages/smithers/ui:importRules` also passes.
- `pnpm --dir apps/mvp exec vitest run tests/FileTabs.test.ts tests/FileTabs.browser.test.ts src/features/files/persistence.test.ts src/features/files/files.test.ts src/features/chat/chat.test.ts --coverage.include=src/features/files/store.ts --coverage.include=src/features/files/actions.ts`:
  98 passed; the file actions/store retain 100% statements, branches, functions
  and lines. All new focus-request branches and callback paths are exercised.
- `pnpm --dir apps/mvp exec tsc -p tsconfig.json --pretty false` and
  `pnpm --dir packages/smithers/ui run check`: passed.
- `pnpm --dir packages/smithers/ui test`: 2633 passed. The coverage run of the
  same suite (`test --coverage --coverage-reporter=lcov --coverage-dir=/tmp/prod-file-tabs-2-ui-coverage`)
  also passes; FileTabs executes 68/68 lines and 16/16 functions.
- `SMITHERS_WORKSPACE_JJ_EXPORT_BINARY=~/smithers-builders/smithers-jj-export pnpm docs:check`:
  passed, including 51 published package tarballs.
- Initial full `pnpm --dir apps/mvp test`: 3717 passed, one existing engine-recovery
  test failed because its answer remained `streaming` at the deadline (the same
  test passed in the focused run). Two expected failures and ten service skips.
  Full rerun with `pnpm --dir apps/mvp exec vitest run --maxWorkers=4 --coverage.reportsDirectory=/tmp/prod-file-tabs-2-mvp-full-coverage`
  passes all 3718 ordinary tests (plus two expected failures and ten service
  skips), including the initially failing recovery test. The command exits 1
  solely at the unchanged global coverage gate: 99.69% statements, 99.30%
  branches, 99.53% functions and 99.81% lines. Uncovered modules are outside
  this diff; the full report is `/tmp/prod-file-tabs-2-mvp-full-coverage/`.
  All four changed chat logic modules have 100% statements, branches, functions
  and lines in that full-run report. Assertions, timeout budgets and coverage
  thresholds are unchanged. No broader coverage repair is included in this
  focused rework; the global 100% gate remains the delivery blocker.

Final Codex Astra review: no findings. Fable could not start: the default Claude
session reports `Not logged in`; the configured `claude-rr` fallback also fails
(`every account failed or is cooling`). Production e2e, push and deployment are not
run. Local delivery bookmark: `mini/prod-file-tabs-2`.
