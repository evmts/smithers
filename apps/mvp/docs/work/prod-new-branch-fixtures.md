---
title: Rework isolated fixtures for landing
status: blocked
area: tests
owner: Codex prod-new-branch-fixtures
updated: 2026-10-23
links: [../infrastructure.md]
---

Rework 39f8cad1 on origin main, preserving its endpoint wiring, injected
RetryPolicy timings and TestClock alarm delivery. Retain only missing local
fixture safety and synchronization, with red/green evidence and the full app
gates. Library catalog: existing @smthrs/flow and @smthrs/platform-node runtime
hosts; no new dependency or product behavior. No production e2e, deploy or push.

Parent: ea5c8b8b (origin main). Kept fixtureConfig only in the repository and
GitHub handlers and the browser ChatApi, where a nested provider can build an
engine; the other harnesses keep main's electricUrl design. A selected-stack
clone journal assertion failed with no schema on that database, then passed.
Loopback and query-override regressions produced 17 more parent failures.
After the fix, 82 fixture tests passed. The 39 database/endpoint tests measured
TestDatabase.ts at 100% statements, branches, functions and lines.

The unmodified synchronization baseline passed 205 tests. Controlled adverse
schedules then reproduced separate faulty assumptions: reading a toast after
its real expiration lost stack:true; a completed response before pending-state
observation lost Requested; confirmation resends produced two dispatch joins,
not one; a check delayed 1600ms after queue movement expired it unless both
operations used PostgreSQL's transaction clock. Those probes failed, and the
retained tests use observers, request gates, durable journal receipts and a
transaction to assert the intended behavior. No production behavior changed.
Main's Todo parking tests passed; the original Todo change added diagnostics
only, so it is omitted. Main's memory/timeline retry and ExecutionHost alarm
designs, and the already-landed endpoint fixes, remain intact.

Astra reviewed the final code with no actionable findings. Fable could not run:
claude-rr reported every account failed or cooling, tried none. Initial importRules
passed. Typecheck found fetch.preconnect errors in existing Worker test code;
--explainFiles traces Bun globals through vibelang-unplugin/deferred's declaration
into unplugin's import of bun. An exact ea5c8b8b parent checkout reproduced the same 31 diagnostics (ignoring
line numbers); the working change was restored before further checks. All four
final TypeScript projects ran; only worker/tsconfig.json failed. Final importRules
executed successfully. The eight-file focused run passed 288 tests. The full app
suite ran on a private Postgres/Electric stack (55582/30582), with numeric
loopback DATABASE_URL, under the shared .full-suite.lock.

The issue-row wait also has a controlled receipt. A temporary copy of the TODO
suite used openFaultyApp and held the real ShapeSource before inserting issue 5.
Dispatching todo/issue through the slash door without a synced row failed
issue_not_found. Healing delivery, then running the retained activate/preload/row
barriers before the same dispatch passed. Probe source is retained in
/tmp/solc-issue-row-probe.ts; red/green logs are /tmp/solc-issue-row-{red,green}.log.
The temporary test file was removed; it is not part of the change or full suite.

Final full command: TEST_DATABASE_PORT=55582 TEST_ELECTRIC_PORT=30582
DATABASE_URL=postgresql://smithers:smithers@127.0.0.1:55582/smithers
pnpm --filter @smthrs/mvp test --maxWorkers=2 (lock acquired before launch and
removed on exit). Result: 320 files passed, two failed, four skipped; 4,111 tests
passed, two expected failures and 12 skips. Coverage reached 100% statements
(22,983/22,983), branches (12,601/12,601), functions (6,903/6,903) and lines
(19,900/19,900), with the unchanged coverage gate. Exit 1.

The two failures are existing build fixtures: ChatApi.startup.test.ts parses
packages/errors/src/SmithersError.vibe as JavaScript; ExecutionHost.workerd.test.ts
has no esbuild loader for .vibe. Both reproduce on exact parent ea5c8b8b with
pnpm --filter @smthrs/mvp test worker/ChatApi.startup.test.ts
worker/ExecutionHost.workerd.test.ts --coverage.enabled=false --maxWorkers=2,
again under the lock (localhost database URL for the parent's stricter guard).
The candidate was restored afterward. Final fetch: origin main is still ea5c8b8b.
No loader, VibeLang source or unrelated typing change is included.

Proof logs: /tmp/solc-fixtures-{red,green}.log, /tmp/solc-sync-{red,green}.log,
/tmp/solc-todo-red.log, /tmp/solc-attention-red.log and
/tmp/solc-helper-coverage.log. Final receipts: /tmp/solc-full-suite.log (exit 1),
/tmp/solc-parent-build-red.log (same two failed suites),
/tmp/solc-parent-typecheck.log (same 31 diagnostics),
/tmp/solc-final-typecheck.log and /tmp/solc-final-importRules.log (passed).
The 288 focused tests pass, and the 39 helper/endpoint tests cover TestDatabase.ts
at 100% in all categories. No production e2e, deployment, push or main mutation.
Landing remains blocked by the parent build fixtures and Worker type errors.
