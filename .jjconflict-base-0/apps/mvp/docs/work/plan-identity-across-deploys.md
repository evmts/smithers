---
title: A parked durable run must survive a rebuild (plan identity across deploys)
status: in-progress
area: sdk
owner: SDK agent (started about 05:25 on 2026-10-20 by the lead); fix and tests on disk in `packages/smithers/flows/engine-store` from 05:32 to 05:35, unreported; its storage-matrix run finished about 05:44 with the 4 plan-identity cases green on SQLite and Postgres, 1 Postgres red in `RetentionFacade` and one uncovered branch at `EngineStore.ts:521`; from about 05:38 the 2 evidence answers live in a file (scratchpad `evidence/`), not the dev database, by the lead's correction; found by the wiring agent ([app wiring](app-wiring.md))
updated: 2026-10-20
links: [durable-answering.md, durable-browser-engine.md, cloudflare-flow-host.md, app-wiring.md, everything-is-a-durable-flow.md, host-agnostic-flows.md, local-first.md, code-reviews.md, ../decisions/0011-the-agent-runs-in-the-browser.md, ../features/agent.md, ../features/remote-flows.md, ../../../../AGENTS.md]
---

## What

Every in-flight durable run fails after a rebuild of the code that declares its flow. When a parked run wakes under the new build, the engine records the flow's plan again and compares it with the plan already in the journal. The plan record (`flows.engine.plan-recorded`, built by `summarize` in `packages/smithers/flows/flow/src/Interpreter.ts:230-241`) includes each node's `declaredAt`: the bundle path and line. The journal dedupes by content, so a rebuild that only shifts lines looks like a different plan, and the run fails with `plan_changed`.

The fix: `declaredAt` stays in the record as provenance, but leaves the compared identity. Records written in the old format, with sites inside the compared content, are read through the same projection. A real structural change, such as a removed step, is still refused with `plan_changed`.

```
build A ── run parks (durable sleep or deferred) ── deploy build B ── run wakes
plan A: nodes + declaredAt {DevChatApi.js, line 49}   plan B: same nodes, line 52
compared today:  content(A) != content(B)  ──▶ plan_changed, the run fails
compared after:  identity(A) == identity(B) ──▶ the run resumes
                 a removed or changed step  ──▶ plan_changed, as before
```

## Why

"Durable by default" in the root `AGENTS.md` means a run survives a crash and a deploy. Today no deploy is safe for a parked run:
- **Server:** `chat/Expire` sleeps up to `ANSWER_EXPIRY` (25 minutes) on the Cloudflare host. Every ChatApi rebuild or deploy inside that window breaks it, and the answer it guards stays `streaming` forever ([durable answering](durable-answering.md), [Cloudflare flow host](cloudflare-flow-host.md)).
- **Browser:** a tab resuming `chat/Answer` from OPFS after an app update hits the same refusal, so an unfinished answer never completes ([durable browser engine](durable-browser-engine.md)).

## State

- **About 05:25 on 2026-10-20, the lead to Will:** "The wiring agent found a serious SDK bug: every in-flight durable run fails after a deploy or rebuild."
  - Evidence: `chat/Expire` runs asleep across ChatApi rebuilds failed at wake, leaving 2 dev answers stuck `streaming` (`5a0b09e4…` and `49ad42d3…`). They stay in the dev database as evidence until the fix lands. The dev server then ran `ANSWER_EXPIRY="60 seconds"` (scratchpad `wiring/dev-expiry.sh`), so expiries woke within a minute of each rebuild ([app wiring](app-wiring.md)).
  - The lead started an SDK agent. Scope: `declaredAt` out of the compared identity; old-format records tolerated; a test for a rebuilt plan that differs only in declaration sites, and a test that a real structural change is still detected.
- 05:32 to 05:35 on 2026-10-20, on disk in `packages/smithers/flows/engine-store`, unreported:
  - **Test:** `test/PlanIdentityAcrossBuilds.test.ts` (05:33:14) parks a run on a durable deferred, reopens the store with a new engine, and resumes it, on SQLite and on Postgres. Four cases: `relocated` (the same flow declared at other lines of another file, `test/fixtures/RebuiltAnswerFlow.ts`, 05:32:31), `unrooted` (a host that records no sites), `earlier-bundle` (a first record written with bundle sites, `DevChatApi.js` line 49 on), and `restructured` (the doubling step removed, which must still fail `plan_changed`). No run is on record, so "fails first" is unproven.
  - **Fix:** `src/internal/NodeJournal.ts` (05:34:16) adds `planIdentity` and `samePlan`. Sites and the source revision are never compared. A record that carries a structural `digest` is identified by it and its other scalar fields, not its page layout; one without a digest is compared by its whole content without sites. `src/EngineStore.ts` (05:35:14) calls `samePlan` when the journal refuses a plan record whose slot holds other bytes, and resumes under the row already written.
  - `flow/src/Interpreter.ts` is unchanged (13:20 on 2026-10-19): `summarize` still writes `declaredAt`, now as provenance only.
- About 05:38 on 2026-10-20, the lead to Will: "the fix and its tests are already on disk." The lead also corrected its 05:25 instruction: the 2 stuck answers kept in the dev database block every later answer, because answers run in turn, and likely caused the final run's 5 local-first reds ([local-first](local-first.md)). The wiring agent exports them and their journal events to a file and reruns on a fresh database and fresh Durable Object state ([app wiring](app-wiring.md)).
- 05:38 to 05:43 on 2026-10-20, on disk, unreported:
  - **Evidence:** scratchpad `evidence/` holds `journal-<id>.jsonl` and `messages-<id>.jsonl` for `5a0b09e4…` and `49ad42d3…`, plus `chatapi-log-lines.jsonl` (05:38).
  - **Storage matrix** (scratchpad `engine-store-matrix.log`, SQLite from 05:39:02, Postgres from 05:40:22, merged report 05:43:42; exit 1): `test/PlanIdentityAcrossBuilds.test.ts` passes 4 of 4 on SQLite and on Postgres. SQLite: 205 files, 2117 tests passed. Postgres: 1 red of 2117, `RetentionFacade.test.ts` "leaves the schema and SQL change count untouched in a dry run" (a schema snapshot compare); no cause named. Merged coverage: 100% statements, functions and lines; branches 99.97%, one branch at `src/EngineStore.ts:521` uncovered, under the 100% threshold. "Fails first" on the old comparison is still unproven.

## Next

From about 05:43 on 2026-10-20: the SDK agent's report, with the `relocated` and `earlier-bundle` cases failing on the old comparison, a named cause for the Postgres `RetentionFacade` red, the uncovered branch at `EngineStore.ts:521` covered so engine-store is back at 100%, and the changelog and docs. Then a dev proof: a `chat/Expire` parked across a ChatApi rebuild settles at wake instead of failing. The 2 evidence answers are in scratchpad `evidence/` and no longer wait in the dev database. [Durable answering](durable-answering.md) and the browser's resume after an app update rely on the fix. The Fable review covers it ([code reviews](code-reviews.md)).

Until about 05:43 on 2026-10-20 the next step was: the SDK agent's report: the four cases green on SQLite and Postgres, with the `relocated` and `earlier-bundle` cases failing on the old comparison; engine-store at 100% coverage; the changelog and docs. Then a dev proof: a `chat/Expire` parked across a ChatApi rebuild settles at wake instead of failing. After that the 2 evidence answers can be settled, and [durable answering](durable-answering.md) and the browser's resume after an app update rely on it. The Fable review covers it ([code reviews](code-reviews.md)).

## Questions for Will

None. Open for the lead, not Will:
- Should a callback's source text stay part of the identity? The fixture's comment says it does, so reformatting a `Node.map` callback still counts as a changed plan and fails parked runs.
- What happens to a run whose plan really changed in a deploy? Today it fails `plan_changed`, and when that run is `chat/Expire`, nothing settles its answer.
