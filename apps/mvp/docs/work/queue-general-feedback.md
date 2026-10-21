---
title: Apply one review comment to all matching items
status: done
area: process
owner: queue improvement builder assigned by lead
updated: 2026-10-20
links: [will-decision-queue.md, queue-review-quality-gate.md]
---

## Current specification — 2026-10-20, 18:55 PDT

**What:** Add an Applies to all action and keyboard shortcut that records one general change and holds affected queue items.

**Why:** Repeated defects should require one review comment.

**Current state:** At 18:53:04 the lead reports the feature live: g marks a note as applies to all, and Undo reverses it. At 18:53:12 the queue upgrade passed 59 server tests and 124 keyboard checks; all 66 existing answers survived the restart.

**Next step:** Retain the passing receipts and verify curator handling when the next real general feedback arrives. No additional implementation blocker is reported.

**Open questions for Will:** None.

Evidence: script-filtered user-typed messages and lead text replies from the latest two transcript hours, through 2026-10-21 01:54:51 UTC (18:54 PDT); queue answers through 01:30:17 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Later words and queue answers supersede historical proposals. Product tests are lead-reported; this tracker runs only the maintainer-site build. Execution ownership is retained; reconciliation by Codex.

## Earlier tracker history (retained)


**What:** Add an Applies to all action and keyboard shortcut that records one general change and holds affected queue items.

**Why:** Repeated recording and review defects were making Will give the same feedback many times.

**Current state:** Will agreed at 18:36; the lead started implementation and still reports it being added at 18:40. No live action or test receipt.

**Next step:** Implement durable feedback scope and curator consumption, preserve original answers, show which items are affected, and return them only after the shared fix and new evidence. Verify keyboard use and duplicate submissions.

**Open questions for Will:** None.

Evidence: user-typed text and lead replies extracted by script from session 6253ecf2 for 23:45–01:44 UTC (16:45–18:44 PDT); queue answers through 18:30 PDT; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest words and queue answers supersede older plans. Product receipts are reported by the lead; this tracker verifies only the maintainer-site build.
