---
title: Repair main landing gate regressions
status: blocked
area: testing
owner: Codex main-reds-0024d
updated: 2026-10-24
links:
  - ../decisions/0092-flow-editors-survive-reload.md
---

Repair stack status branch gaps, preserve decision 0092's unreadable-editor behavior in fault assertions, and resolve the PWA registration module in the tab graph gate. Keep the other job's files untouched. Validate focused tests, the full MVP suite under the shared lock, typecheck, and importRules.

`dbbb167b`'s SQL-error arm now runs against the real Postgres layer with this
file's isolated `todos` relation temporarily renamed, restored in `finally`.
The status route's only 404 returns after assigning `todo_not_found`, so its
fallback for an unset outcome could never observe 404; that dead arm is deleted.
The two stack API suites pass 37 tests at 100% statements, branches, functions
and lines (152/152 branches). The earlier scoped coverage run showed the dead
404 arm at line 233 after the SQL arm was exercised.

`4a6932b4` deliberately changed `openCode` to retain unsaved code after a failed
read, as decision 0092 says: "An unreadable revision keeps the text with a refusal."
The original fault assertion reproduced red (`read` versus `unavailable`). Its
replacement checks the exact retained edit, source, revision, idle state and
refusal, plus a second refused read with no edits that must remain unavailable.
No product behavior or assertion threshold changed.

The tab graph resolves and loads `virtual:pwa-register` through the app's actual
Vite config and continues walking its real Workbox dependency. It keeps all
forbidden-import and language-server-seam assertions. No virtual-module stub or
externalization was added. The existing esbuild graph has no `.vibe` sources on
this revision. An attempted extra `vibelang-unplugin/esbuild` import pulled in
ambient Bun types through `src/index.d.ts`'s `UnpluginInstance` and caused 144
browser diagnostics; removing that unrelated addition restores a clean browser
typecheck. The existing app Vite build still uses `vibelang-vite`.

The initial three-file run reproduced the two reported behavioral/bundle reds
(14 passed, 2 failed). After repair, all three files pass (17 tests). Browser,
infrastructure and eval VibeLang typechecks pass; worker reports exactly 31
known TS2741 `preconnect` diagnostics. ImportRules passes. Astra found no
issues; Fable is unavailable in this session's tools/model list.


Full gate: `pnpm test --maxWorkers=2`, held under this job's shared directory
lock for the entire run, completed in 4484.46 s: 322 files passed, 7 failed,
4 skipped; 4163 tests passed, 8 failed, 2 expected failures, 12 skipped, plus
2 unhandled errors. The EXIT trap released this job's lock. The three assigned
files passed. The stack API has no remaining coverage gaps.

Allowed residuals are the two VibeLang bundles (`worker/ChatApi.startup.test.ts`
parses `SmithersError.vibe` without its compiler, and
`worker/ExecutionHost.workerd.test.ts` has no `.vibe` loader), the other job's
`RemoteRuns.test.ts` and `todos.test.ts`, and gaps in issues, pulls/store and
repo/actions. No excluded file was changed.

Additional blockers prevent the required full-gate proof:
- `tests/FileTabs.navigation.test.ts:87` reproducibly fails before the held
  SQLite write is entered. A focused rerun while this job owned the lock failed
  identically. Temporary diagnostics confirmed the tab remains connected,
  revision is `main`, two tabs remain, and the keyboard focus emits requested
  and consumed, but no persistence write starts. The diagnostic edit was
  removed; this file remains identical to main.
- `src/features/flows-ui/tab.test.ts` reports two unhandled errors: a
  `MutationRefused` delete with no keys, and an interrupted fiber promise.
- Coverage outside the allowed files remains incomplete in `src/device/editorTab.ts`
  (0%), `src/device/registry.ts`, `src/features/flows-ui/actions.ts` and `store.ts`,
  `src/features/runs/store.ts` and `todoRun.ts`, and `worker/RepoApi.ts`.
  Full totals: 99.76% statements, 99.64% branches, 99.8% functions, 99.86% lines.
  No thresholds, exclusions, timeouts or assertions were weakened.

The full run also timed out in database `beforeEach` hooks in Stack.test.ts
and Checks.test.ts. Their complete focused reruns, each started while this job
held the full-suite lock, passed 42/42 and 25/25 respectively. Those files were
not changed. Final configured `pnpm run typecheck` reaches only the known 31
worker TS2741 diagnostics; browser, infrastructure and eval projects pass
individually. Final `pnpm exec smithers-build test '//apps/mvp:importRules'`
passes. No public API changed, so docs sync and a changeset are not required.
Library catalog entries retained: `@smthrs/flow` for the existing durable
fault dispatch and `@smthrs/observability` for existing route telemetry.
No push, landing, deployment or live browser/e2e run. Fable remains unavailable.
