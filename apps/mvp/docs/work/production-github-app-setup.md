---
title: Complete production GitHub App setup
status: in-progress
area: infra
owner: Will configures the App; lead validates production
updated: 2026-10-21 02:34 PDT
links: [land-and-deploy-mvp.md, sign-in.md, github-source-of-truth.md, will-decision-queue.md, ../rulings.md]
---

## Tracker reconciliation — 2026-10-21 02:34 PDT

**What:** Verify production GitHub sign-in and webhook setup.

**Why:** Installation coverage, callback configuration and event delivery need distinct evidence.

**Current state:** Will selected Installed for smithersai/vibelang at 01:16 PDT. At 01:38 the lead independently confirmed, using the App's credentials, installation across the smithersai organization and all repositories. Installation is settled. No successful production callback or webhook smoke receipt appears in the latest two-hour window; deployment is still running at 02:32. Status remains in-progress.

**Next step:** After deployment completes, validate production sign-in, webhook delivery and VibeLang import. Resolve this workstream from those receipts; do not repeat the installation request.

**Open questions for Will:** None now; validate the configured service before asking for further setup.

Evidence: queue answer question:vibelang-app-install at 2026-10-21T08:16:40.579Z; script-filtered lead replies at 01:38 and 02:32 PDT. Current rulings override historical briefs and proposals. Codex curates documentation only; execution ownership and all earlier history retained.

## Earlier tracker history (retained)


## Tracker reconciliation — 2026-10-20 23:14 PDT

**What:** Complete production GitHub App callback and webhook setup.

**Why:** Production sign-in and GitHub event delivery require the configured App.

**Current state:** Will’s queue answer at 23:13 explicitly says setup is not done yet, but he is working on it and expects a few minutes. No completion or successful production smoke receipt is present.

**Next step:** Wait for Will’s completion receipt, then have the lead smoke-test production sign-in and webhook and repeat after tonight’s deployment.

**Open questions for Will:** Confirm setup completion; never request credential values in the tracker.

Evidence: session 6253ecf2 user-typed text and lead text replies, script-filtered for the latest two hours through 23:13 PDT; rulings FE-16 and PROC-18; queue answers through 23:13 PDT. Synthetic notifications and relayed agent messages excluded. Current rulings supersede historical briefs and proposals. Product checks are lead-reported, not rerun by the tracker. Execution ownership retained; reconciliation by Codex tracker curator.
