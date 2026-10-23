---
title: File tab focus through persisted close and real navigation
status: done
area: files
owner: Codex (prod-file-tabs-3)
updated: 2026-10-23
links: [../features/files.md, ./prod-file-tabs-2.md, ../decisions/0083-file-route-pending-focus.md]
---

Fixed on main@origin 4e8c78ffd559. Production's browser log contains an
invariant during pending blob navigation. `BranchPendingScreen` strictly read
the tree route's parameters, throwing when the file route rendered it. The
error boundary remounted the strip and lost its focused DOM link. The earlier
Chromium fixture rendered a plain pending div and never executed that lookup.
Read the current match's parameters in the shared pending screen instead.

Before the fix, the new real-router regression failed with the correct
remaining tab and URL but `document.activeElement` on the body. It runs real
file-close flows, SQLite persistence, RepoApi/Postgres/Electric, repository
warm/open actions and the actual pending screen. The persistence host and
route continuation are held independently: no navigation before the write
receipt; afterward the pending screen must render and preserve the remaining
DOM link and focus. Green after the parameter fix; no focus timing workaround.

The strip reports content-free focus requests, consumption and drops through
`files.focus` logs/spans and `smithers_web_file_focus`. OTLP exports are checked
for every phase/reason. App views gain no React state or effects. The UI
instrumentation retains native caller refs and reads the current callback.
Library catalog: `@smthrs/ui`, `@smthrs/effect-tanstack-db`. This repairs existing
core integration; no new plugin feature or persisted schema.

Validation (Node 26.5.0):

- `pnpm --dir apps/mvp exec vitest run tests/FileTabs.navigation.test.ts tests/FileTabs.test.ts tests/FileTabs.browser.test.ts src/features/files/files.test.ts src/features/files/persistence.test.ts src/features/files/telemetry.test.ts src/telemetry.test.ts --coverage.include=src/features/files/files.ts --coverage.include=src/features/files/actions.ts --coverage.include=src/features/files/store.ts --coverage.include=src/features/files/metrics.ts`: 39 passed; these four logic modules have 100% statements, branches, functions and lines.
- `pnpm --dir packages/smithers/ui exec bun test tests --coverage --coverage-reporter=lcov --coverage-dir=/tmp/prod-file-tabs-3-ui-final-coverage`: 2636 passed; FileTabs 85/85 lines, 16/16 functions. Includes keyboard outcomes, Suspense restoration, outside focus and callback-ref replacement/cleanup.
- App `tsc -p tsconfig.json`, UI `pnpm run check`, and both `//apps/mvp:importRules` and `//packages/smithers/ui:importRules`: passed.
- `SMITHERS_WORKSPACE_JJ_EXPORT_BINARY=~/smithers-builders/smithers-jj-export pnpm docs:sync` and `pnpm docs:check`: passed (51 published tarballs).

Astra review: cleared after fixing the instrumentation's caller-ref handling;
regression tests retained. Fable cannot run: default session is not logged in,
and `claude-rr --model fable` reports every account failed or is cooling.

`pnpm --dir apps/mvp exec playwright test files.spec.ts --grep '^keyboard:' --workers=1`
was attempted locally. Alchemy stops before serving on missing
`CEREBRAS_API_KEY`. The keyboard test never sends a chat message or requires a
live model, but host startup currently requires that credential; this clone
also has neither Code Storage setting required by the test. No production E2E,
full app suite, push or deployment was run. Local bookmark: `mini/prod-file-tabs-3`.
