---
title: A run's change feed moves while an action attempt works
status: in-progress
area: sdk
owner: Codex GPT-6.1 Sol
updated: 2026-10-22
links: [todo-active-run-view.md, ../decisions/0026-watching-a-todo-run.md, ../features/runs.md]
---

## Design — 2026-10-21, 16:10 PDT

**What:** A run's row of the engine's change feed (`flows_run_changes`) moves while one action attempt works, so a page following a TODO's run sees the agent's turns, tool calls and a steer's delivery as they happen, not when the `todo/Implement` step settles.

**Why (evidence):** the live steer e2e on 2026-10-21 (stack `steer_williamcory`) read the run at 22:31 UTC and next at 22:41 UTC: ten minutes with no change notification while the agent worked inside `todo/Implement`, whose journal grew from 19 to 201 events. The run page and a steer's Delivered lagged by the whole step. Decision 0026 and `features/runs.md` say the feed moves "about once per step attempt"; it doesn't.

**Cause:** `@smthrs/run-store` migration `0003_execution_revisions` bumps a run's revision only from triggers on `flows_runs` (insert, update, delete). An agent's model turns, cell calls and steering drains are inner sealed steps: they write `flows_attempts` rows and journal events, never the run's row.

**Design (recommended):** the engine touches the run's row when an attempt starts or settles inside a run, at a bounded rate.

```
attempt started/settled (run-store AttemptStore, the same transaction as its INSERT/UPDATE of flows_attempts)
  └─ if now - run.progress_at_ms >= PROGRESS_EVERY_MS (2 000)
       UPDATE flows_runs SET progress_at_ms = now WHERE run_id = ? AND (progress_at_ms IS NULL OR progress_at_ms <= now - 2000)
         └─ existing trigger: flows_run_source.revision + 1 → flows_run_changes(run_id).revision
```

- **New column** `flows_runs.progress_at_ms INTEGER NULL` (run-store migration `0005_run_progress`). Row metadata only: it is not in the plan, the payload or any step key, so no plan digest or `implementationVersion` changes, and a run parked across a deploy replays unchanged.
- **Bounded rate:** the conditional `UPDATE … WHERE progress_at_ms <= now - 2000` makes the bump at most once per 2 s per run whatever the attempt rate, and is a no-op inside the window (no trigger fires on zero rows). The interval is an engine option (`EngineStore.Options.progressEvery`), default 2 s.
- **Same transaction as the attempt row,** under the engine's fenced writer: a stale owner can't bump, and a rolled-back attempt bumps nothing.
- **Readers:** unchanged. Electric already follows `flows_run_changes`; `RunInspection` ignores the column.
- **Contention:** every bump also updates the singleton `flows_run_source` row, which serializes writers across runs. At 0.5 Hz per running run that's small; the journal-latency builder's per-run writer lock (af234a6d6c5f5d459) should take this into account, and this design must take its lock order (attempt row, then run row, inside one writer transaction).

**Rejected:** a trigger on `flows_journal_events` (hundreds of writes per minute per run, every one bumping the global singleton); a trigger on `flows_attempts` without a rate bound (the same, at the attempt rate); a separate heartbeat flow or timer (a second scheduler beside the engine, DUR-2); polling from the tab (FE rule, decision 0026 §4).

**Regression test (fails today):** `packages/smithers/flows/engine-store/test/RunChangeProgress.test.ts`, on SQLite and on Postgres under `SMITHERS_TEST_PG_URL`: run a flow whose one action performs three inner sealed steps (`Action.make(... tier: "sealed")` called from the action body), each waiting on a gate the test releases. After each release, read `flows_run_changes.revision` for the run: it must have moved at least once between the action's start and its settlement while the action is still running. Today the revision moves only at the action's start and end. A second case: ten inner steps within 2 s move it at most twice (the bound). A third: a fenced-out stale owner's attempt write doesn't move it.

**App proof:** `apps/mvp/src/features/runs/remote.test.ts` "a Member watches it live" gains an assertion that a page reads the run again during `probe/Pause`'s long step with inner steps; the steer e2e's Delivered then appears within seconds of the agent's next turn.

**Next step:** a builder takes this note: send the design to the journal-latency builder first, then the failing test, then the migration and the bump beside `AttemptStore`'s writes of `flows_attempts`. Mechanical parts (migration, option plumbing, docs) can go to Codex Sol.

**Open questions for Will:** None.

## Earlier tracker history from main

## Tracker reconciliation — 2026-10-21 21:10 PDT

**What:** Publish run progress during a long unresolved action.

**Why:** Run pages must update before an agent action finishes.

**Current state:** Recovered report hands off commit 66491a243035, not pushed. It records red-to-green SQLite/Postgres regressions, 313 SQLite passes/1 skip, 314 Postgres passes, focused engine and real app proofs, merged run-store coverage 100%, and passing docs. Astra timing finding fixed; Fable unavailable. Full engine, browser/live steering and production proofs were not rerun.

**Next step:** Land the reviewed change, complete outstanding review and live/browser validation; do not equate handoff with deployment.

**Open questions for Will:** None.

Evidence: script-filtered user text and lead replies, 19:06–21:06 PDT; current rulings and queue answers through 21:06; surviving briefs and reports. Product results are reported receipts, not rerun here. Implementation ownership retained; Codex curates documentation. Wiped scratch files are not missing work.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 20:34 PDT

**What:** Publish run progress before a long agent action settles.

**Why:** Run pages and steering delivery must not stay stale for the whole action.

**Current state:** The recovered RUN-PROGRESS-BRIEF.md resumes the surviving run-progress workspace. The intended run-store migration adds progress_at_ms and a journal-insert trigger throttled to one change-feed bump per two seconds per run, on SQLite and Postgres. At 20:30 the lead says the run-page fix is still going; no completed proof or landing receipt.

**Next step:** Prove the regression red on the base and green during an unresolved action; retain ordering/recovery/coverage receipts and hand off the commit.

**Open questions for Will:** None.

Evidence: lead text replies script-filtered from session 6253ecf2, approximately 18:34–20:34 PDT, and recovered briefs where named. Automated notifications and tool content are excluded. Current rulings and queue answers prevail over older plans. Existing implementation ownership is retained; Codex curates the tracker. Product results are reported evidence, not tests rerun by this refresh.

## Earlier tracker history (retained)

## Tracker reconciliation — 2026-10-21 17:23 PDT

**What:** Publish run progress while a long agent action remains open.

**Why:** Run pages and steering delivery must update before the action finishes.

**Current state:** At 17:16 the lead reports the Codex builder still running after 51 minutes with eight files changed. Its legitimate MacBook test lock holds other checks. There is no completed validation or landing receipt. The revised brief traces progress to journal events during one long attempt, rather than repeated flows_attempts writes.

**Next step:** Finish the revised SDK journal-event progress implementation, prove updates during an open attempt and retain recovery, ordering and contention receipts.

**Open questions for Will:** None newly identified; retained unresolved decisions remain with their owning workstreams.

Evidence: script-filtered user-typed messages and lead text replies from session 6253ecf2, approximately 15:23–17:23 PDT. Automated notifications and tool content excluded. Rulings and queue answers govern over older briefs, designs and planning docs. Implementation ownership retained; Codex maintains tracker documentation. Product results are lead-reported.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-21 16:33 PDT

**What:** Publish progress while a long durable agent step remains open.

**Why:** A long step leaves the run page and steering Delivered mark stale.

**Current state:** At 16:25 PDT the lead restarts the Codex Sol builder to test on the MacBook after its Latitude attempt stalled. The journal builder also moves its eight-run lock measurement to the MacBook. No implementation pass or landing receipt is reported; the prior design and no-deadlock assessment remain applicable.

**Next step:** Finish SDK implementation and tests; prove updates before step completion, recovery and ordering, then check the TODO view locally and live.

**Open questions for Will:** None.

Evidence: lead text replies in session 6253ecf2, script-filtered through 16:33 PDT from its latest two hours; automated notifications, tool records and compaction summaries excluded. Rulings and queue answers take precedence over historical briefs. Implementation ownership retained; Codex curates tracker documentation. Product results are lead-reported.

## Earlier tracker history (retained)


**What:** Persist and publish live run progress while a durable step remains open.

**Why:** A ten-minute agent step leaves its run page and steering Delivered mark stale until the step ends.

**Current state:** The local TODO-steering E2E exposed this gap at 16:09. At 16:12 the lead reports a written SDK design and a Codex Sol build underway. The journal builder confirms the two changes cannot deadlock; the remaining shared-row bottleneck is being measured with eight runs. The revised RUN-PROGRESS-BRIEF.md traces this to in-process agent turns emitting lossy journal events while the run-change cursor stays silent. It specifies a journal-insert trigger updating progress_at_ms at most every two seconds per run in SQLite and Postgres, without changing the plan digest. Migration ordering must be checked.

**Next step:** Finish SDK implementation, prove progress arrives before step completion with recovery and ordering checks, then validate the TODO view locally and live alongside journal changes.

**Open questions for Will:** None.

Evidence: script-filtered lead replies at 16:09–16:12 PDT in session 6253ecf2, plus RUN-PROGRESS-BRIEF.md. Rulings and queue answers prevail. No passing implementation receipt yet.
