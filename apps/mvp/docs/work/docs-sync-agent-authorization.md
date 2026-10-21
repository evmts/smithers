---
title: Restore agent-authorized docs synchronization
status: in-progress
area: sdk
owner: Codex tracker curator; execution assigned by lead
updated: 2026-10-20 22:54 PDT
links: [docs-check-flow-outcome.md, agent-run-credentials.md, agent-eval-regressions.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20, 22:54 PDT

**Current state:** The 22:47 lead update reports docs:check passing again after deleting a hard-linked scratch snapshot; the loader now identifies the file and syscall. The 22:37 green-suite handoff also includes a regression check that agents may start docs-sync without person approval. This does not establish the earlier requested two consecutive clean full-suite runs.

**Next step:** Retain fix and landing receipts, and collect the two clean full-suite runs. Keep the separate native hard-link diagnostic follow-up visible.

**Open questions for Will:** No new question; existing person-owned decisions remain open.

Evidence: lead text replies extracted by script from session 6253ecf2, approximately 20:54–22:54 PDT; user-typed text only for human messages, synthetic notifications excluded. Rulings and queue answers (latest 19:38 PDT) prevail. Execution ownership retained; Codex tracker curator records reported receipts.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 20:24 PDT

**What:** Keep authorized docs synchronization usable and remove contention from read-only status inspection.

**Why:** Parallel development flows must run without unnecessary lock contention or weaker authorization.

**Current state:** The lead corrected the earlier diagnosis at 20:16 PDT: docs sync was not approval-blocked; five or six agents queued behind it and status inspection contended on the repository lock. A lock-avoidance change was approved, but completion and two clean full runs are not reported. The earlier authorization-regression interpretation below is superseded.

**Next step:** Collect the contention fix and two consecutive clean full-suite receipts from the existing owner. Check compatibility with the standing jj-only rule; a lead report of a direct git command does not authorize this tracker to run it.

**Open questions for Will:** None.

Evidence: script-filtered user text and assistant replies from session 6253ecf2, approximately 18:24–20:24 PDT; queue answers through 19:38 PDT; rulings, decisions through 0021, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Builder checks are reported evidence; this tracker verifies the maintainer-site build. Existing execution ownership retained.

## Earlier tracker history (retained)


## Current specification — 2026-10-20, 19:34 PDT

**What:** Restore agents’ ability to launch docs sync without weakening person-only actions.

**Why:** Docs synchronization must remain available to authorized development flows.

**Current state:** At 19:29 the lead reports docs sync now waits for a person’s approval and an agent is restoring it. This is a new authorization regression, separate from the earlier completed docs-check outcome-reading fix. No passing receipt yet.

**Next step:** Find the authorization classification causing the regression, use the shared registry policy, and retain tests proving docs sync works while genuinely person-only actions remain refused.

**Open questions for Will:** None.

Evidence: script-extracted user-typed messages and lead text replies from session 6253ecf2, 2026-10-21 00:34–02:34 UTC (17:34–19:34 PDT); queue answers through 02:33:47 UTC; current rulings, decisions, proposals, TODOs, rules and shared feature/host/panel briefs and designs. Latest Will text and queue answers prevail. Product receipts are reported, not rerun by this tracker. Existing execution owners are retained.
