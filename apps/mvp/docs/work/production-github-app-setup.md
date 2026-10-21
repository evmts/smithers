---
title: Complete production GitHub App setup
status: in-progress
area: infra
owner: Will configures the App; lead validates production
updated: 2026-10-20 23:14 PDT
links: [land-and-deploy-mvp.md, sign-in.md, github-source-of-truth.md, will-decision-queue.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-20 23:14 PDT

**What:** Complete production GitHub App callback and webhook setup.

**Why:** Production sign-in and GitHub event delivery require the configured App.

**Current state:** Will’s queue answer at 23:13 explicitly says setup is not done yet, but he is working on it and expects a few minutes. No completion or successful production smoke receipt is present.

**Next step:** Wait for Will’s completion receipt, then have the lead smoke-test production sign-in and webhook and repeat after tonight’s deployment.

**Open questions for Will:** Confirm setup completion; never request credential values in the tracker.

Evidence: session 6253ecf2 user-typed text and lead text replies, script-filtered for the latest two hours through 23:13 PDT; rulings FE-16 and PROC-18; queue answers through 23:13 PDT. Synthetic notifications and relayed agent messages excluded. Current rulings supersede historical briefs and proposals. Product checks are lead-reported, not rerun by the tracker. Execution ownership retained; reconciliation by Codex tracker curator.
