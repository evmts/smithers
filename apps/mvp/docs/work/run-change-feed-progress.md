---
title: Update run pages during long agent steps
status: in-progress
area: sdk
owner: Codex Sol run-progress builder assigned by lead; Codex tracker maintains note
updated: 2026-10-21 21:10 PDT
links: [todo-active-run-view.md, journal-deployment-lock-contention.md, flow-debugging.md, ../rulings.md]
---

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
