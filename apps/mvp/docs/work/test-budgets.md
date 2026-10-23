---
title: Timeline retries and ChatApi startup test budgets
status: blocked
area: testing
owner: Codex test-budgets
updated: 2026-10-23
links: [../../src/features/timeline/engine.test.ts, ../../worker/ChatApi.startup.test.ts]
---

Preserve six real durable model attempts and safe failure conversion with a
short retry policy injected through SummarySeat. Move the 200 ms startup
performance budget to the benchmark suite; retain deterministic lazy module
loading checks in the unit suite. Uses the library catalog durable model step
and Node flow host entries (@smthrs/agent, @smthrs/flow, @smthrs/platform-node).


The timeline regression first failed at the restored 30-second timeout with
production backoffs (`/tmp/test-budgets-timeline-default-red.log`). The injected
policy preserves ModelStep's max attempts and all failure classification. The
whole timeline file and startup file then passed (11 tests). An eager static
import mutation of ChatApiProgram made the new emitted-graph assertion fail;
the mutation was restored before final validation.

Startup protects deployment headroom rather than request query count. The
unchanged three-fresh-process median under 200 ms therefore lives in
`pnpm bench:startup --out <fresh-directory>`, separately from parallel unit
execution. Unit checks retain dynamic reachability, exclude the program from
the static closure, and load the real Alchemy bundle. The committed local
benchmark receipt records 63.3 ms median with method, raw samples, bundle hashes,
and machine/load metadata; it makes no new live performance claim.

Validation uses Node 26.5.0 and the frozen pnpm install. `pnpm typecheck`
(all four app projects), importRules, and the standalone startup runner's strict
TypeScript check passed. An extra whole-bench typecheck found existing errors
in `bench/cerebras-load/{admission.test,report,run}.ts`, outside these changes.
Astra's read-only review found no actionable issues. Fable is not in the exposed
model inventory; that review was not run.

The first shared-Postgres load attempt passed once, then timed out during host
setup before model attempts. Its full gate also failed a TODO webhook timing
case and was cancelled. The first isolated attempt was launched before the new
services were ready and failed startup connections; it was cancelled and is
not counted. Final validation started only after both services were healthy,
using a fresh local Postgres 17.11/Electric 1.8.1 pair on the supported
TEST_DATABASE_PORT=55593 and TEST_ELECTRIC_PORT=31593 settings. All services
are real; the final full gate and focused repetitions share this pair and the
same loaded machine. Receipts from discarded attempts remain under
`/tmp/test-budgets-shared-*` and `/tmp/test-budgets-before-ready-*`.

Both tests passed 20 consecutive runs while the full gate remained alive before
and after every run. The structured [receipt](test-budgets-validation.json)
retains commands, timestamps, overlap checks and each test's duration. Most
steady-state grant-store runs took 1–3 seconds; the first cold SQL host took
28 seconds. Raw logs are `/tmp/test-budgets-repeat-{01..20}.log`.

The completed full gate (`pnpm test --maxWorkers=2 --reporter=verbose`) exited
1 after 3,919.59 seconds: 23 files failed, 290 passed, 4 skipped; 116 tests
failed, 3,917 passed, 2 were expected failures, and 10 skipped (4,045 total).
Actual coverage was 98.56% statements, 97.75% branches, 98.44% functions and
98.75% lines. Every required threshold remains 100%; the gate is BLOCKED.

Both edited files passed in that full run as well: the grant-store case took
1,067 ms and startup 99 ms. The structured receipt retains the complete counts,
coverage, failed-file counts and both case timings. Full output remains at
`/tmp/test-budgets-full.log`.

Failures are outside the edited files. Identified blockers include migration
fixtures that create schemas on the selected test server but connect to
hardcoded port 54321 (`db/Database.test.ts:48`), the TODO closed/reopened
webhook's five-second timeout, triage returning 400 where its test expects 200,
and failures in shape/sync, repository and other integration cases. The isolated
endpoint limitation must be distinguished from a proven product failure;
these results do not establish a green default-stack gate. No failing check was
skipped, weakened or given a longer deadline to produce these receipts.

The dedicated test containers and network were removed after the completed run.
